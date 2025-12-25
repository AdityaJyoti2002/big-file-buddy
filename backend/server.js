/**
 * Backend Reference Implementation
 * Node.js + Express Server for Chunked Upload System
 * 
 * This file is for reference - run separately from the React frontend
 * 
 * To use:
 * 1. Create a new Node.js project
 * 2. Copy this file as server.js
 * 3. Install dependencies: npm install express cors multer mysql2 yauzl crypto
 * 4. Create MySQL database and run schema.sql
 * 5. Configure environment variables
 * 6. Run: node server.js
 */

/*
============================================
DEPENDENCIES (package.json)
============================================
{
  "name": "chunk-upload-server",
  "version": "1.0.0",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "multer": "^1.4.5-lts.1",
    "mysql2": "^3.6.0",
    "yauzl": "^3.0.0",
    "dotenv": "^16.3.1"
  },
  "devDependencies": {
    "nodemon": "^3.0.1"
  }
}
*/

/*
============================================
ENVIRONMENT VARIABLES (.env)
============================================
PORT=3001
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=chunk_uploads
UPLOAD_DIR=./uploads
TEMP_DIR=./uploads/temp
MAX_FILE_SIZE=10737418240
CLEANUP_HOURS=24
*/

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const mysql = require('mysql2/promise');
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const yauzl = require('yauzl');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// ============================================
// DATABASE CONNECTION
// ============================================
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'chunk_uploads',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// ============================================
// MIDDLEWARE
// ============================================
app.use(cors());
app.use(express.json());

// Configure multer for chunk uploads (memory storage to stream to disk)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB max per chunk (5MB + overhead)
  }
});

// Ensure directories exist
const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';
const TEMP_DIR = process.env.TEMP_DIR || './uploads/temp';

async function ensureDirectories() {
  await fsp.mkdir(UPLOAD_DIR, { recursive: true });
  await fsp.mkdir(TEMP_DIR, { recursive: true });
}
ensureDirectories();

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Get the temp file path for an upload
 */
function getTempFilePath(uploadId) {
  return path.join(TEMP_DIR, `${uploadId}.partial`);
}

/**
 * Get the final file path for a completed upload
 */
function getFinalFilePath(uploadId, filename) {
  const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  return path.join(UPLOAD_DIR, `${uploadId}_${sanitizedFilename}`);
}

/**
 * Calculate SHA-256 hash of a file using streaming
 */
async function calculateFileHash(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    
    stream.on('data', (data) => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

/**
 * Peek inside ZIP file to list top-level entries
 */
async function peekZipContents(filePath, maxEntries = 100) {
  return new Promise((resolve, reject) => {
    const entries = [];
    
    yauzl.open(filePath, { lazyEntries: true }, (err, zipfile) => {
      if (err) {
        // If not a valid ZIP, return empty array
        resolve([]);
        return;
      }
      
      zipfile.readEntry();
      
      zipfile.on('entry', (entry) => {
        // Only include top-level entries
        const pathParts = entry.fileName.split('/').filter(Boolean);
        if (pathParts.length === 1 || 
            (pathParts.length === 2 && entry.fileName.endsWith('/'))) {
          entries.push(entry.fileName);
        }
        
        if (entries.length < maxEntries) {
          zipfile.readEntry();
        } else {
          zipfile.close();
          resolve(entries);
        }
      });
      
      zipfile.on('end', () => {
        resolve(entries);
      });
      
      zipfile.on('error', () => {
        resolve([]);
      });
    });
  });
}

// ============================================
// API ROUTES
// ============================================

/**
 * POST /api/uploads/init
 * Initialize or resume an upload session
 */
app.post('/api/uploads/init', async (req, res) => {
  try {
    const { uploadId, filename, fileSize, totalChunks } = req.body;
    
    if (!uploadId || !filename || !fileSize || !totalChunks) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Check if upload already exists
    const [existing] = await pool.execute(
      'SELECT id, status FROM uploads WHERE upload_id = ?',
      [uploadId]
    );
    
    if (existing.length > 0) {
      const upload = existing[0];
      
      if (upload.status === 'COMPLETED') {
        return res.json({
          uploadId,
          status: 'COMPLETED',
          uploadedChunks: Array.from({ length: totalChunks }, (_, i) => i)
        });
      }
      
      // Get already uploaded chunks
      const [chunks] = await pool.execute(
        `SELECT chunk_index FROM chunks 
         WHERE upload_id = ? AND status = 'RECEIVED'`,
        [upload.id]
      );
      
      return res.json({
        uploadId,
        status: upload.status,
        uploadedChunks: chunks.map(c => c.chunk_index)
      });
    }
    
    // Create new upload session
    const [result] = await pool.execute(
      `INSERT INTO uploads (upload_id, filename, total_size, total_chunks, status)
       VALUES (?, ?, ?, ?, 'UPLOADING')`,
      [uploadId, filename, fileSize, totalChunks]
    );
    
    const dbUploadId = result.insertId;
    
    // Initialize chunk records
    const chunkInserts = Array.from({ length: totalChunks }, (_, i) => 
      [dbUploadId, i, 'PENDING']
    );
    
    await pool.query(
      `INSERT INTO chunks (upload_id, chunk_index, status) VALUES ?`,
      [chunkInserts]
    );
    
    // Pre-allocate temp file
    const tempPath = getTempFilePath(uploadId);
    const fd = await fsp.open(tempPath, 'w');
    await fd.truncate(fileSize);
    await fd.close();
    
    res.json({
      uploadId,
      status: 'UPLOADING',
      uploadedChunks: []
    });
    
  } catch (error) {
    console.error('Init upload error:', error);
    res.status(500).json({ error: 'Failed to initialize upload' });
  }
});

/**
 * GET /api/uploads/:uploadId/status
 * Get current upload status
 */
app.get('/api/uploads/:uploadId/status', async (req, res) => {
  try {
    const { uploadId } = req.params;
    
    const [uploads] = await pool.execute(
      `SELECT * FROM uploads WHERE upload_id = ?`,
      [uploadId]
    );
    
    if (uploads.length === 0) {
      return res.status(404).json({ error: 'Upload not found' });
    }
    
    const upload = uploads[0];
    
    const [chunks] = await pool.execute(
      `SELECT chunk_index FROM chunks 
       WHERE upload_id = ? AND status = 'RECEIVED'`,
      [upload.id]
    );
    
    res.json({
      uploadId: upload.upload_id,
      filename: upload.filename,
      totalSize: upload.total_size,
      totalChunks: upload.total_chunks,
      status: upload.status,
      uploadedChunks: chunks.map(c => c.chunk_index),
      finalHash: upload.final_hash,
      zipContents: upload.zip_contents ? JSON.parse(upload.zip_contents) : null
    });
    
  } catch (error) {
    console.error('Get status error:', error);
    res.status(500).json({ error: 'Failed to get upload status' });
  }
});

/**
 * POST /api/uploads/:uploadId/chunk
 * Upload a single chunk
 */
app.post('/api/uploads/:uploadId/chunk', upload.single('chunk'), async (req, res) => {
  try {
    const { uploadId } = req.params;
    const { chunkIndex, totalChunks } = req.body;
    const chunkData = req.file?.buffer;
    
    if (!chunkData) {
      return res.status(400).json({ error: 'No chunk data received' });
    }
    
    const chunkIdx = parseInt(chunkIndex, 10);
    const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB
    
    // Get upload record
    const [uploads] = await pool.execute(
      `SELECT id, status FROM uploads WHERE upload_id = ?`,
      [uploadId]
    );
    
    if (uploads.length === 0) {
      return res.status(404).json({ error: 'Upload not found' });
    }
    
    const upload = uploads[0];
    
    if (upload.status === 'COMPLETED') {
      return res.json({ success: true, chunkIndex: chunkIdx, message: 'Upload already completed' });
    }
    
    // Check if chunk already received (idempotency)
    const [existingChunk] = await pool.execute(
      `SELECT status FROM chunks WHERE upload_id = ? AND chunk_index = ?`,
      [upload.id, chunkIdx]
    );
    
    if (existingChunk.length > 0 && existingChunk[0].status === 'RECEIVED') {
      return res.json({ success: true, chunkIndex: chunkIdx, message: 'Chunk already received' });
    }
    
    // Write chunk to correct position using streaming
    const tempPath = getTempFilePath(uploadId);
    const byteOffset = chunkIdx * CHUNK_SIZE;
    
    // Use write stream at specific position
    const fd = await fsp.open(tempPath, 'r+');
    await fd.write(chunkData, 0, chunkData.length, byteOffset);
    await fd.close();
    
    // Update chunk status
    await pool.execute(
      `UPDATE chunks SET status = 'RECEIVED', received_at = NOW()
       WHERE upload_id = ? AND chunk_index = ?`,
      [upload.id, chunkIdx]
    );
    
    res.json({
      success: true,
      chunkIndex: chunkIdx,
      message: 'Chunk uploaded successfully'
    });
    
  } catch (error) {
    console.error('Chunk upload error:', error);
    res.status(500).json({ error: 'Failed to upload chunk' });
  }
});

/**
 * POST /api/uploads/:uploadId/finalize
 * Finalize upload after all chunks received
 */
app.post('/api/uploads/:uploadId/finalize', async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    const { uploadId } = req.params;
    
    await connection.beginTransaction();
    
    // Get upload with lock to prevent double finalization
    const [uploads] = await connection.execute(
      `SELECT * FROM uploads WHERE upload_id = ? FOR UPDATE`,
      [uploadId]
    );
    
    if (uploads.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Upload not found' });
    }
    
    const upload = uploads[0];
    
    if (upload.status === 'COMPLETED') {
      await connection.rollback();
      return res.json({
        success: true,
        message: 'Upload already completed',
        hash: upload.final_hash,
        zipContents: upload.zip_contents ? JSON.parse(upload.zip_contents) : []
      });
    }
    
    if (upload.status === 'PROCESSING') {
      await connection.rollback();
      return res.status(409).json({ error: 'Upload is already being processed' });
    }
    
    // Verify all chunks received
    const [pendingChunks] = await connection.execute(
      `SELECT COUNT(*) as count FROM chunks 
       WHERE upload_id = ? AND status != 'RECEIVED'`,
      [upload.id]
    );
    
    if (pendingChunks[0].count > 0) {
      await connection.rollback();
      return res.status(400).json({ 
        error: 'Not all chunks received',
        pendingCount: pendingChunks[0].count
      });
    }
    
    // Mark as processing
    await connection.execute(
      `UPDATE uploads SET status = 'PROCESSING', updated_at = NOW()
       WHERE id = ?`,
      [upload.id]
    );
    
    await connection.commit();
    
    // Process file (outside transaction for long-running operations)
    const tempPath = getTempFilePath(uploadId);
    const finalPath = getFinalFilePath(uploadId, upload.filename);
    
    try {
      // Calculate hash
      const hash = await calculateFileHash(tempPath);
      
      // Peek inside ZIP
      const zipContents = await peekZipContents(tempPath);
      
      // Atomically move file
      await fsp.rename(tempPath, finalPath);
      
      // Update status to completed
      await pool.execute(
        `UPDATE uploads 
         SET status = 'COMPLETED', final_hash = ?, zip_contents = ?, updated_at = NOW()
         WHERE id = ?`,
        [hash, JSON.stringify(zipContents), upload.id]
      );
      
      res.json({
        success: true,
        message: 'Upload finalized successfully',
        hash,
        zipContents
      });
      
    } catch (processError) {
      // Mark as failed
      await pool.execute(
        `UPDATE uploads SET status = 'FAILED', updated_at = NOW() WHERE id = ?`,
        [upload.id]
      );
      throw processError;
    }
    
  } catch (error) {
    await connection.rollback();
    console.error('Finalize error:', error);
    res.status(500).json({ error: 'Failed to finalize upload' });
  } finally {
    connection.release();
  }
});

/**
 * Cleanup orphaned uploads (run periodically)
 */
async function cleanupOrphanedUploads() {
  const cleanupHours = parseInt(process.env.CLEANUP_HOURS || '24', 10);
  
  try {
    // Find old incomplete uploads
    const [orphans] = await pool.execute(
      `SELECT upload_id FROM uploads 
       WHERE status IN ('UPLOADING', 'FAILED')
       AND updated_at < DATE_SUB(NOW(), INTERVAL ? HOUR)`,
      [cleanupHours]
    );
    
    for (const orphan of orphans) {
      const tempPath = getTempFilePath(orphan.upload_id);
      
      // Delete temp file
      try {
        await fsp.unlink(tempPath);
      } catch (e) {
        // File may not exist
      }
      
      // Delete database records
      await pool.execute(
        `DELETE FROM chunks WHERE upload_id IN 
         (SELECT id FROM uploads WHERE upload_id = ?)`,
        [orphan.upload_id]
      );
      
      await pool.execute(
        `DELETE FROM uploads WHERE upload_id = ?`,
        [orphan.upload_id]
      );
      
      console.log(`Cleaned up orphaned upload: ${orphan.upload_id}`);
    }
    
  } catch (error) {
    console.error('Cleanup error:', error);
  }
}

// Run cleanup every hour
setInterval(cleanupOrphanedUploads, 60 * 60 * 1000);

// ============================================
// START SERVER
// ============================================
app.listen(PORT, () => {
  console.log(`Chunk upload server running on port ${PORT}`);
  console.log(`Upload directory: ${UPLOAD_DIR}`);
});

module.exports = app;
