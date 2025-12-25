import express from "express";
import cors from "cors";
import multer from "multer";
import mysql from "mysql2/promise";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import crypto from "crypto";
import yauzl from "yauzl";
import dotenv from "dotenv";
import { fileURLToPath } from "url";

dotenv.config();

// =====================
// __dirname fix
// =====================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// =====================
// Middleware
// =====================
app.use(cors());
app.use(express.json());

// =====================
// Multer
// =====================
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
});

// =====================
// Directories
// =====================
const UPLOAD_DIR = path.join(__dirname, "uploads");
const TEMP_DIR = path.join(UPLOAD_DIR, "temp");
await fsp.mkdir(TEMP_DIR, { recursive: true });

// =====================
// Database
// =====================
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
});


// =====================
// Helpers
// =====================
const getTempFilePath = (id) => path.join(TEMP_DIR, `${id}.partial`);
const getFinalFilePath = (id, name) =>
  path.join(UPLOAD_DIR, `${id}_${name.replace(/[^a-zA-Z0-9._-]/g, "_")}`);

async function ensureTempFile(file, size) {
  try {
    await fsp.access(file);
  } catch {
    console.log("📁 [FILE] Creating temp file:", file);
    const fd = await fsp.open(file, "w");
    await fd.truncate(size);
    await fd.close();
  }
}

function calculateFileHash(filePath) {
  return new Promise((resolve, reject) => {
    console.log("🔐 [HASH] Calculating SHA256...");
    const hash = crypto.createHash("sha256");
    fs.createReadStream(filePath)
      .on("data", (d) => hash.update(d))
      .on("end", () => resolve(hash.digest("hex")))
      .on("error", reject);
  });
}

function peekZipContents(filePath) {
  return new Promise((resolve) => {
    console.log("📦 [ZIP] Reading zip contents...");
    const files = [];
    yauzl.open(filePath, { lazyEntries: true }, (err, zip) => {
      if (err) return resolve([]);
      zip.readEntry();
      zip.on("entry", (e) => {
        files.push(e.fileName);
        zip.readEntry();
      });
      zip.on("end", () => resolve(files));
    });
  });
}

// =====================
// INIT
// =====================
app.post("/api/uploads/init", async (req, res) => {
  const { uploadId, filename, fileSize, totalChunks } = req.body;

  console.log(
    `🚀 [INIT] uploadId=${uploadId} file=${filename} size=${fileSize} chunks=${totalChunks}`
  );

  const [[existing]] = await pool.execute(
    "SELECT id FROM uploads WHERE upload_id=?",
    [uploadId]
  );

  let uploadDbId;

  if (!existing) {
    const [r] = await pool.execute(
      `INSERT INTO uploads (upload_id, filename, total_size, total_chunks)
       VALUES (?,?,?,?)`,
      [uploadId, filename, fileSize, totalChunks]
    );
    uploadDbId = r.insertId;

    const rows = Array.from({ length: totalChunks }, (_, i) => [uploadDbId, i]);
    await pool.query(
      "INSERT INTO chunks (upload_id, chunk_index) VALUES ?",
      [rows]
    );
  } else {
    uploadDbId = existing.id;
  }

  const [chunks] = await pool.execute(
    "SELECT chunk_index FROM chunks WHERE upload_id=? AND status='RECEIVED'",
    [uploadDbId]
  );

  await ensureTempFile(getTempFilePath(uploadId), fileSize);

  res.json({
    uploadId,
    uploadedChunks: chunks.map((c) => c.chunk_index),
  });
});

// =====================
// CHUNK
// =====================
app.post(
  "/api/uploads/:uploadId/chunk",
  upload.single("chunk"),
  async (req, res) => {
    try {
      if (!req.file) {
        console.log("❌ [CHUNK] No file received");
        return res.status(400).json({ error: "No chunk received" });
      }

      const { uploadId } = req.params;
      const chunkIdx = Number(req.body.chunkIndex);
      const CHUNK_SIZE = 5 * 1024 * 1024;

      console.log(
        `📥 [CHUNK] uploadId=${uploadId} chunk=${chunkIdx} size=${req.file.buffer.length}`
      );

      const [[upload]] = await pool.execute(
        "SELECT id, total_size FROM uploads WHERE upload_id=?",
        [uploadId]
      );

      const tempPath = getTempFilePath(uploadId);
      await ensureTempFile(tempPath, upload.total_size);

      const offset = chunkIdx * CHUNK_SIZE;
      const fd = await fsp.open(tempPath, "r+");
      await fd.write(req.file.buffer, 0, req.file.buffer.length, offset);
      await fd.close();

      console.log(`✍️  [WRITE] chunk=${chunkIdx} offset=${offset} SUCCESS`);

      await pool.execute(
        `UPDATE chunks SET status='RECEIVED', received_at=NOW()
         WHERE upload_id=? AND chunk_index=?`,
        [upload.id, chunkIdx]
      );

      console.log(`🟢 [DB] chunk=${chunkIdx} marked RECEIVED`);

      res.json({ success: true, chunkIndex: chunkIdx });
    } catch (err) {
      console.error(`❌ [ERROR][CHUNK]`, err);
      res.status(500).json({ error: "Chunk upload failed" });
    }
  }
);

// =====================
// FINALIZE
// =====================
app.post("/api/uploads/:uploadId/finalize", async (req, res) => {
  try {
    const { uploadId } = req.params;
    console.log(`🏁 [FINALIZE] uploadId=${uploadId}`);

    const [[upload]] = await pool.execute(
      "SELECT * FROM uploads WHERE upload_id=?",
      [uploadId]
    );

    const [[{ pending }]] = await pool.execute(
      "SELECT COUNT(*) pending FROM chunks WHERE upload_id=? AND status!='RECEIVED'",
      [upload.id]
    );

    console.log(`⏳ [FINALIZE] pending chunks=${pending}`);

    if (pending > 0) {
      return res.status(409).json({ error: "Chunks still processing" });
    }

    const temp = getTempFilePath(uploadId);
    const final = getFinalFilePath(uploadId, upload.filename);

    const hash = await calculateFileHash(temp);
    const zipContents = await peekZipContents(temp);

    await fsp.rename(temp, final);

    await pool.execute(
      `UPDATE uploads SET status='COMPLETED', final_hash=?, zip_contents=?
       WHERE id=?`,
      [hash, JSON.stringify(zipContents), upload.id]
    );

    console.log(`✅ [DONE] uploadId=${uploadId} COMPLETED`);

    res.json({ success: true, hash, zipContents });
  } catch (err) {
    console.error("❌ [ERROR][FINALIZE]", err);
    res.status(500).json({ error: "Finalize failed" });
  }
});

// =====================
app.listen(PORT, () =>
  console.log(`🚀 Server running on http://localhost:${PORT}`)
);
