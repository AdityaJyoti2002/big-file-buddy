# Chunked Large File Upload System

A resilient, memory-efficient, resumable file upload system for handling very large ZIP files (1GB+).

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (React)                         │
├─────────────────────────────────────────────────────────────────┤
│  FileUploader Component                                         │
│  ├── DropZone (drag & drop, file validation)                   │
│  ├── UploadProgress (progress bar, stats)                      │
│  ├── ChunkGrid (visual chunk status)                           │
│  ├── UploadControls (pause/resume/cancel)                      │
│  └── CompletionView (hash, ZIP contents)                       │
│                                                                 │
│  useChunkedUpload Hook                                          │
│  ├── Chunk splitting (Blob.slice)                              │
│  ├── Concurrent upload queue (max 3)                           │
│  ├── Exponential backoff retry                                 │
│  ├── Speed/ETA calculation                                     │
│  └── LocalStorage resume support                               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTP/REST
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   BACKEND (Node.js + Express)                   │
├─────────────────────────────────────────────────────────────────┤
│  POST /uploads/init     → Create upload session                 │
│  GET  /uploads/:id/status → Get upload progress                 │
│  POST /uploads/:id/chunk  → Receive chunk (streaming write)     │
│  POST /uploads/:id/finalize → Complete upload, hash, peek ZIP   │
│                                                                 │
│  Features:                                                      │
│  ├── Streaming I/O (never loads full file in memory)           │
│  ├── Idempotent chunk handling                                 │
│  ├── Database-tracked state (survives restarts)                │
│  ├── Pre-allocated sparse files                                │
│  └── Periodic orphan cleanup                                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ SQL
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        DATABASE (MySQL)                         │
├─────────────────────────────────────────────────────────────────┤
│  uploads table                                                  │
│  ├── id, upload_id, filename, total_size, total_chunks         │
│  ├── status (UPLOADING | PROCESSING | COMPLETED | FAILED)      │
│  ├── final_hash, zip_contents                                  │
│  └── created_at, updated_at                                    │
│                                                                 │
│  chunks table                                                   │
│  ├── id, upload_id (FK), chunk_index                           │
│  ├── status (PENDING | RECEIVED)                               │
│  └── received_at                                               │
└─────────────────────────────────────────────────────────────────┘
```

## Resume Logic

The system supports resuming uploads after:
- Page refresh
- Network interruption
- Browser crash
- Server restart

### How it works:

1. **Upload ID Generation**: A deterministic ID is generated from `filename + size + lastModified`. This ensures the same file always maps to the same upload session.

2. **Frontend State**: On page load, the frontend checks localStorage for in-progress uploads.

3. **Backend Handshake**: Before uploading, the frontend calls `/uploads/init` which returns:
   - List of already-received chunk indices
   - Current upload status

4. **Resume Strategy**: The frontend skips chunks that are already marked as `RECEIVED` and only uploads pending chunks.

5. **Idempotency**: If the same chunk is uploaded twice (due to retry or resume), the backend safely ignores duplicates.

## Hashing Logic

SHA-256 hashing is performed on the **complete assembled file** after all chunks are received:

```javascript
// Server-side streaming hash calculation
const hash = crypto.createHash('sha256');
const stream = fs.createReadStream(filePath);
stream.on('data', (data) => hash.update(data));
stream.on('end', () => resolve(hash.digest('hex')));
```

This approach:
- Never loads the entire file into memory
- Provides integrity verification for the complete file
- Runs as part of the finalization step

## File Structure

```
project/
├── src/                      # Frontend (React + Vite)
│   ├── components/
│   │   └── upload/
│   │       ├── FileUploader.tsx      # Main orchestrator
│   │       ├── DropZone.tsx          # Drag & drop zone
│   │       ├── ChunkGrid.tsx         # Visual chunk status
│   │       ├── UploadProgress.tsx    # Progress bar & stats
│   │       ├── UploadControls.tsx    # Pause/Resume/Cancel
│   │       └── CompletionView.tsx    # Success state
│   ├── hooks/
│   │   └── use-chunked-upload.ts     # Upload logic hook
│   ├── lib/
│   │   ├── upload-types.ts           # Types & utilities
│   │   └── upload-api.ts             # API client
│   └── pages/
│       └── Index.tsx                 # Main page
│
└── backend/                  # Backend (run separately)
    ├── server.js             # Express server
    └── schema.sql            # MySQL schema
```

## Configuration

### Frontend (.env)
```env
VITE_API_URL=http://localhost:3001/api
```

### Backend (.env)
```env
PORT=3001
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=chunk_uploads
UPLOAD_DIR=./uploads
TEMP_DIR=./uploads/temp
CLEANUP_HOURS=24
```

## Trade-offs & Decisions

| Decision | Trade-off |
|----------|-----------|
| **5MB chunk size** | Balance between HTTP overhead (too small) and retry cost (too large). 5MB works well for most networks. |
| **3 concurrent uploads** | Prevents overwhelming the server while utilizing bandwidth. Can be tuned per network. |
| **Exponential backoff** | May cause slower recovery on transient errors, but prevents server overload during issues. |
| **Pre-allocated files** | Requires disk space upfront, but enables random-access writes and prevents fragmentation. |
| **Database state tracking** | Slight performance overhead vs. file-based tracking, but enables distributed backends and survives restarts. |
| **Client-side chunking** | More complex frontend, but reduces server memory usage to near-zero. |
| **LocalStorage for resume** | Limited to ~5MB metadata per upload, but sufficient for chunk status and works offline. |

## Future Improvements

1. **Parallel hash calculation**: Hash chunks as they arrive, combine at end
2. **Chunk integrity verification**: MD5 checksum per chunk for corruption detection
3. **Compression**: gzip chunks before upload for faster transfers
4. **S3/Cloud storage**: Direct-to-S3 uploads with presigned URLs
5. **WebSocket progress**: Real-time server push for multi-client visibility
6. **Upload quotas**: Per-user storage limits and rate limiting
7. **Background uploads**: Service Worker for uploads that survive tab close
8. **Delta uploads**: Only upload changed portions for file updates

## Running the Project

### Frontend
```bash
# Already running in Lovable preview
npm run dev
```

### Backend
```bash
cd backend
npm install
# Set up .env with database credentials
mysql -u root -p < schema.sql
npm start
```

## API Reference

### POST /uploads/init
Initialize or resume an upload session.

**Request:**
```json
{
  "uploadId": "upload_abc123_xyz",
  "filename": "archive.zip",
  "fileSize": 1073741824,
  "totalChunks": 205
}
```

**Response:**
```json
{
  "uploadId": "upload_abc123_xyz",
  "status": "UPLOADING",
  "uploadedChunks": [0, 1, 2, 5, 6]
}
```

### POST /uploads/:id/chunk
Upload a single chunk.

**Request:** `multipart/form-data`
- `chunk`: Binary chunk data
- `chunkIndex`: Zero-based index
- `totalChunks`: Total chunk count

**Response:**
```json
{
  "success": true,
  "chunkIndex": 3,
  "message": "Chunk uploaded successfully"
}
```

### POST /uploads/:id/finalize
Complete the upload after all chunks received.

**Response:**
```json
{
  "success": true,
  "message": "Upload finalized successfully",
  "hash": "a7ffc6f8bf1ed76651c14756a061d662f580ff4de43b49fa82d80a4b80f8434a",
  "zipContents": ["folder/", "file1.txt", "file2.txt"]
}
```
