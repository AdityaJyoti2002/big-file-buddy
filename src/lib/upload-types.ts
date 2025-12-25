/**
 * Upload Types and Constants
 * Shared types for the chunked upload system
 */

// Chunk size: 5MB
export const CHUNK_SIZE = 5 * 1024 * 1024;

// Maximum concurrent chunk uploads
export const MAX_CONCURRENT_UPLOADS = 3;

// Maximum retry attempts for failed chunks
export const MAX_RETRIES = 3;

// Base delay for exponential backoff (ms)
export const BASE_RETRY_DELAY = 1000;

// Chunk status enum
export type ChunkStatus = 'pending' | 'uploading' | 'success' | 'error';

// Upload session status
export type UploadStatus = 'idle' | 'uploading' | 'paused' | 'processing' | 'completed' | 'failed';

// Individual chunk state
export interface ChunkState {
  index: number;
  status: ChunkStatus;
  retries: number;
  startTime?: number;
  endTime?: number;
  error?: string;
}

// Upload session state
export interface UploadSession {
  uploadId: string;
  filename: string;
  fileSize: number;
  totalChunks: number;
  status: UploadStatus;
  chunks: ChunkState[];
  startTime?: number;
  bytesUploaded: number;
  uploadSpeed: number; // bytes per second
  eta: number; // seconds remaining
}

// API response types
export interface InitUploadResponse {
  uploadId: string;
  uploadedChunks: number[];
  status: string;
}

export interface UploadStatusResponse {
  uploadId: string;
  filename: string;
  totalSize: number;
  totalChunks: number;
  status: string;
  uploadedChunks: number[];
  finalHash?: string;
  zipContents?: string[];
}

export interface ChunkUploadResponse {
  success: boolean;
  chunkIndex: number;
  message: string;
}

export interface FinalizeResponse {
  success: boolean;
  message: string;
  hash?: string;
  zipContents?: string[];
}

// Generate unique upload ID from file properties
export function generateUploadId(file: File): string {
  const str = `${file.name}-${file.size}-${file.lastModified}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `upload_${Math.abs(hash).toString(16)}_${Date.now().toString(36)}`;
}

// Calculate number of chunks for a file
export function calculateTotalChunks(fileSize: number): number {
  return Math.ceil(fileSize / CHUNK_SIZE);
}

// Format bytes to human readable
export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Format seconds to human readable time
export function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '--:--';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }
  return `${secs}s`;
}

// Format speed to human readable
export function formatSpeed(bytesPerSecond: number): string {
  return formatBytes(bytesPerSecond) + '/s';
}

// Calculate progress percentage
export function calculateProgress(chunks: ChunkState[]): number {
  if (chunks.length === 0) return 0;
  const completed = chunks.filter(c => c.status === 'success').length;
  return Math.round((completed / chunks.length) * 100);
}

// Local storage keys for resume support
export const STORAGE_KEY_PREFIX = 'chunk_upload_';

export function getStorageKey(uploadId: string): string {
  return `${STORAGE_KEY_PREFIX}${uploadId}`;
}

// Save upload state to localStorage
export function saveUploadState(session: UploadSession): void {
  try {
    const key = getStorageKey(session.uploadId);
    localStorage.setItem(key, JSON.stringify({
      uploadId: session.uploadId,
      filename: session.filename,
      fileSize: session.fileSize,
      totalChunks: session.totalChunks,
      chunks: session.chunks,
      timestamp: Date.now()
    }));
  } catch (e) {
    console.warn('Failed to save upload state to localStorage:', e);
  }
}

// Load upload state from localStorage
export function loadUploadState(uploadId: string): Partial<UploadSession> | null {
  try {
    const key = getStorageKey(uploadId);
    const data = localStorage.getItem(key);
    if (!data) return null;
    
    const parsed = JSON.parse(data);
    // Check if state is less than 24 hours old
    const age = Date.now() - parsed.timestamp;
    if (age > 24 * 60 * 60 * 1000) {
      localStorage.removeItem(key);
      return null;
    }
    
    return parsed;
  } catch (e) {
    console.warn('Failed to load upload state from localStorage:', e);
    return null;
  }
}

// Clear upload state from localStorage
export function clearUploadState(uploadId: string): void {
  try {
    const key = getStorageKey(uploadId);
    localStorage.removeItem(key);
  } catch (e) {
    console.warn('Failed to clear upload state from localStorage:', e);
  }
}
