/**
 * useChunkedUpload Hook
 * Manages the entire chunked upload process with concurrency control,
 * retry logic, progress tracking, and resume support.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  type ChunkState,
  type UploadSession,
  type UploadStatus,
  CHUNK_SIZE,
  MAX_CONCURRENT_UPLOADS,
  MAX_RETRIES,
  BASE_RETRY_DELAY,
  generateUploadId,
  calculateTotalChunks,
  calculateProgress,
  saveUploadState,
  loadUploadState,
  clearUploadState,
} from '@/lib/upload-types';
import {
  initUpload,
  uploadChunk,
  finalizeUpload,
  extractChunk,
  withRetry,
  getUploadStatus,
} from '@/lib/upload-api';

interface UseChunkedUploadOptions {
  onProgress?: (progress: number) => void;
  onComplete?: (hash: string, zipContents: string[]) => void;
  onError?: (error: string) => void;
}

interface UseChunkedUploadReturn {
  session: UploadSession | null;
  startUpload: (file: File) => Promise<void>;
  pauseUpload: () => void;
  resumeUpload: () => void;
  cancelUpload: () => void;
  isUploading: boolean;
  isPaused: boolean;
  progress: number;
}

export function useChunkedUpload(options: UseChunkedUploadOptions = {}) {
  const { onComplete, onError } = options;

  const [session, setSession] = useState<UploadSession | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  const fileRef = useRef<File | null>(null);
  const activeUploadsRef = useRef<Set<number>>(new Set());

  /* =========================
     UPLOAD SINGLE CHUNK
  ========================== */
  const uploadSingleChunk = useCallback(async (
    uploadId: string,
    chunkIndex: number,
    totalChunks: number,
    file: File
  ) => {
    if (isPaused) return;

    if (activeUploadsRef.current.has(chunkIndex)) return;
    activeUploadsRef.current.add(chunkIndex);

    try {
      setSession(prev => prev && ({
        ...prev,
        chunks: prev.chunks.map(c =>
          c.index === chunkIndex
            ? { ...c, status: "uploading" }
            : c
        )
      }));

      const chunkData = extractChunk(file, chunkIndex);

      await uploadChunk(uploadId, chunkIndex, totalChunks, chunkData);

      setSession(prev => prev && ({
        ...prev,
        chunks: prev.chunks.map(c =>
          c.index === chunkIndex
            ? { ...c, status: "success" }
            : c
        )
      }));

    } catch (err) {
      setSession(prev => prev && ({
        ...prev,
        chunks: prev.chunks.map(c =>
          c.index === chunkIndex
            ? { ...c, status: "error", retries: c.retries + 1 }
            : c
        )
      }));
    } finally {
      activeUploadsRef.current.delete(chunkIndex);
    }
  }, [isPaused]);

  /* =========================
     QUEUE PROCESSOR
  ========================== */
  const processUploadQueue = useCallback(async () => {
    if (!session || !fileRef.current || isPaused) return;

    const file = fileRef.current;

    const pending = session.chunks.filter(
      c => c.status === "pending" || (c.status === "error" && c.retries < MAX_RETRIES)
    );

    const successCount = session.chunks.filter(c => c.status === "success").length;

    /* ✅ FINALIZE — THIS IS THE FIX */
    if (successCount === session.totalChunks) {
      setSession(s => s && ({ ...s, status: "processing" }));

      try {
        const result = await finalizeUpload(session.uploadId);
        setSession(s => s && ({ ...s, status: "completed" }));
        onComplete?.(result.hash, result.zipContents);
      } catch {
        setSession(s => s && ({ ...s, status: "failed" }));
        onError?.("Finalize failed");
      }

      setIsUploading(false);
      return;
    }

    const slots =
      MAX_CONCURRENT_UPLOADS - activeUploadsRef.current.size;

    pending.slice(0, slots).forEach(c =>
      uploadSingleChunk(session.uploadId, c.index, session.totalChunks, file)
    );

  }, [session, isPaused, uploadSingleChunk]);

  /* =========================
     START UPLOAD
  ========================== */
  const startUpload = useCallback(async (file: File) => {
    fileRef.current = file;

    const uploadId = generateUploadId(file);
    const totalChunks = calculateTotalChunks(file.size);

    await initUpload(uploadId, file.name, file.size, totalChunks);

    setSession({
      uploadId,
      filename: file.name,
      fileSize: file.size,
      totalChunks,
      status: "uploading",
      chunks: Array.from({ length: totalChunks }, (_, i) => ({
        index: i,
        status: "pending",
        retries: 0
      })),
      startTime: Date.now(),
      bytesUploaded: 0,
      uploadSpeed: 0,
      eta: 0
    });

    setIsUploading(true);
    setIsPaused(false);
  }, []);

  /* =========================
     AUTO QUEUE RUNNER
  ========================== */
  useEffect(() => {
    if (isUploading && !isPaused) {
      processUploadQueue();
    }
  }, [session?.chunks, isUploading, isPaused]);

  return {
    session,
    startUpload,
    pauseUpload: () => setIsPaused(true),
    resumeUpload: () => setIsPaused(false),
    cancelUpload: () => setSession(null),
    isUploading,
    isPaused,
    progress: session ? calculateProgress(session.chunks) : 0
  };
}

