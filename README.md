# Large File Resumable ZIP Upload System

This project implements a resilient, memory-efficient, resumable large file upload system
designed to handle ZIP files larger than 1GB. The system is built to survive network failures,
out-of-order chunk delivery, retries, and backend restarts without corrupting data.

---

## 🚀 Tech Stack

- **Frontend:** React.js
- **Backend:** Node.js (Express)
- **Database:** MySQL
- **File Handling:** Streaming I/O (fs streams)
- **Chunk Size:** 5 MB
- **Max Concurrent Uploads:** 3

---

## 🧠 System Architecture Overview

The system follows a chunk-based upload architecture:

1. The frontend splits a large ZIP file into fixed-size chunks (5MB).
2. Chunks are uploaded concurrently (max 3 at a time).
3. The backend writes each chunk directly to disk using streams.
4. MySQL acts as the source of truth to track upload and chunk state.
5. Uploads can resume safely after refresh, retry, or server restart.

---

## 📤 Upload Flow

### 1. Upload Initialization (Handshake)
- Frontend sends filename + file size to backend
- Backend checks database for an existing upload session
- Backend responds with:
  - upload_id
  - list of already uploaded chunks (if any)

### 2. Chunk Upload
- File is split using `Blob.slice()`
- Each chunk is uploaded with:
  - upload_id
  - chunk_index
  - total_chunks
- Only 3 chunks are uploaded concurrently

### 3. Retry & Resilience
- Failed chunks retry up to 3 times
- Exponential backoff is used (1s → 2s → 4s)
- Duplicate chunks are ignored safely (idempotent handling)

### 4. Finalization
- Once all chunks are received:
  - File is finalized atomically
  - SHA-256 hash is calculated
  - ZIP contents are inspected using streaming (no extraction)
  - Upload is marked as COMPLETED

---

## 🔁 Pause & Resume Logic

- Upload progress is fully tracked in the database
- On page refresh or browser close:
  - Frontend re-initiates handshake
  - Missing chunks are detected
  - Upload resumes from the last incomplete chunk
- No in-memory state is relied upon for recovery

---

## 🔐 File Integrity (Hashing)

- SHA-256 hash is calculated **after** all chunks are assembled
- Hash ensures:
  - Data integrity
  - Safe retry handling
  - No corruption due to out-of-order delivery

Example:
SHA-256: a3f9c2e7b1d4e9...


---

## 📦 ZIP Peek Requirement

- The system **does NOT extract** the ZIP file
- A streaming ZIP parser is used to:
  - Read ZIP headers
  - List top-level files/folders only

Example Output:


ZIP Contents:

videos/

images/

report.pdf


---

## 🗃️ Database Design

### Uploads Table
Tracks the overall upload state.

Fields:
- id
- filename
- total_size
- total_chunks
- status (UPLOADING, PROCESSING, COMPLETED, FAILED)
- final_hash
- created_at
- updated_at

### Chunks Table
Tracks each individual chunk.

Fields:
- id
- upload_id
- chunk_index
- status (PENDING, RECEIVED)
- received_at

---

## 🧪 Failure Scenarios Handled

✔ Network failures (30% simulated failure rate)  
✔ Out-of-order chunk delivery  
✔ Duplicate chunk uploads  
✔ Double-finalization race condition  
✔ Backend crash & restart  
✔ Incomplete / abandoned uploads (cleanup logic)

---

## 🧹 Cleanup Strategy

- Uploads stuck in `UPLOADING` state beyond a threshold are considered orphaned
- Associated chunks and temporary files are cleaned periodically

---

## 📊 UI Features

- Global upload progress bar (0–100%)
- Chunk status grid:
  - Pending
  - Uploading
  - Success
  - Error
- Live upload speed (MB/s)
- Estimated time remaining (ETA)

---

## 📁 Project Structure



frontend/
backend/
docker-compose.yml
README.md


## 🔐 How File Integrity Was Handled (Hashing)

To ensure file integrity, the system calculates a **SHA-256 hash** of the final assembled ZIP file **after all chunks have been successfully received and written to disk**.

- Chunk-level hashing is intentionally avoided to reduce computational overhead.
- The backend uses **streaming-based hashing**, ensuring the file is never fully loaded into memory.
- The calculated hash is stored in the database (`final_hash`) and serves as the definitive proof of file correctness.

This approach guarantees that:
- Out-of-order chunk uploads do not corrupt the final file.
- Retries and duplicate chunk uploads do not alter file contents.
- The uploaded file is identical to the original client-side file.

---

## ⏸️ How the "Pause / Resume" Logic Was Managed

Pause and resume functionality is implemented using a **database-driven state management approach**, making the system resilient to page refreshes, browser restarts, and backend crashes.

### Frontend
- Before starting an upload, the frontend performs a **handshake** with the backend.
- The backend responds with a list of already uploaded chunk indices.
- The frontend uploads **only the missing chunks**, skipping completed ones.
- Upload progress is preserved even after page refresh or browser restart.

### Backend
- Each chunk’s status is persisted in the database.
- No in-memory state is used for tracking upload progress.
- If the backend restarts mid-upload, the database state enables safe recovery without data loss.

This design ensures **true resumability**, not just UI-level pause and resume.

---

## ⚖️ Known Trade-offs

The following trade-offs were made deliberately to balance complexity, performance, and reliability:

1. **Local Disk Storage**
   - Files are stored on the local filesystem instead of cloud object storage (e.g., AWS S3).
   - This simplifies deployment but limits horizontal scalability.

2. **ZIP Peek Limitation**
   - Only **top-level ZIP entries** are inspected.
   - Recursive inspection was avoided to maintain performance and memory efficiency.

3. **Time-based Cleanup**
   - Orphaned uploads are cleaned up using a time-based threshold.
   - In rare cases, extremely slow uploads may be removed prematurely.

4. **No Authentication Layer**
   - Authentication and authorization were intentionally omitted to keep the focus on upload reliability and resiliency.

---

## 🚀 Further Enhancements

The system can be extended in the following ways:

- Integration with **cloud storage** services (AWS S3, Google Cloud Storage)
- **WebSocket-based** real-time upload progress updates
- File **encryption at rest**
- User authentication and upload ownership
- Distributed chunk processing across multiple servers
- Background workers for finalization and cleanup tasks
- Malware and virus scanning for uploaded ZIP files
- Adaptive chunk sizes based on network conditions


## 🎥 Demo

The demo shows:
- Uploading a 1GB+ ZIP file
- Manual network disconnection
- Upload resuming automatically
- Successful finalization and ZIP inspection

---

## ✅ Conclusion

This system demonstrates a production-grade approach to large file uploads with a strong
focus on resiliency, memory efficiency, and data integrity under real-world failure conditions