/**
 * Upload API Client
 * Handles all API calls to the backend upload service
 */

import {
  type InitUploadResponse,
  type UploadStatusResponse,
  type ChunkUploadResponse,
  type FinalizeResponse,
  CHUNK_SIZE,
} from './upload-types';

// API base URL - configure this based on your backend
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

/**
 * Initialize upload session
 * Returns existing upload state if resuming
 */
export async function initUpload(
  uploadId: string,
  filename: string,
  fileSize: number,
  totalChunks: number
): Promise<InitUploadResponse> {
  const response = await fetch(`${API_BASE_URL}/uploads/init`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      uploadId,
      filename,
      fileSize,
      totalChunks,
    }),
  });

  if (!response.ok) {
    throw new Error(`Init upload failed: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Get current upload status
 */
export async function getUploadStatus(uploadId: string): Promise<UploadStatusResponse> {
  const response = await fetch(`${API_BASE_URL}/uploads/${uploadId}/status`);

  if (!response.ok) {
    throw new Error(`Get status failed: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Upload a single chunk
 */
export async function uploadChunk(
  uploadId: string,
  chunkIndex: number,
  totalChunks: number,
  chunkData: Blob,
  onProgress?: (loaded: number, total: number) => void
): Promise<ChunkUploadResponse> {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append('chunk', chunkData);
    formData.append('uploadId', uploadId);
    formData.append('chunkIndex', chunkIndex.toString());
    formData.append('totalChunks', totalChunks.toString());

    const xhr = new XMLHttpRequest();
    
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(event.loaded, event.total);
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const response = JSON.parse(xhr.responseText);
          resolve(response);
        } catch {
          resolve({ success: true, chunkIndex, message: 'Chunk uploaded' });
        }
      } else {
        reject(new Error(`Chunk upload failed: ${xhr.statusText}`));
      }
    });

    xhr.addEventListener('error', () => {
      reject(new Error('Network error during chunk upload'));
    });

    xhr.addEventListener('abort', () => {
      reject(new Error('Chunk upload aborted'));
    });

    xhr.open('POST', `${API_BASE_URL}/uploads/${uploadId}/chunk`);
    xhr.send(formData);
  });
}

/**
 * Finalize upload after all chunks are received
 */
export async function finalizeUpload(uploadId: string): Promise<FinalizeResponse> {
  const response = await fetch(`${API_BASE_URL}/uploads/${uploadId}/finalize`, {
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error(`Finalize failed: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Extract a chunk from a file
 */
export function extractChunk(file: File, chunkIndex: number): Blob {
  const start = chunkIndex * CHUNK_SIZE;
  const end = Math.min(start + CHUNK_SIZE, file.size);
  return file.slice(start, end);
}

/**
 * Retry wrapper with exponential backoff
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt < maxRetries) {
        // Exponential backoff with jitter
        const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 500;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError;
}
