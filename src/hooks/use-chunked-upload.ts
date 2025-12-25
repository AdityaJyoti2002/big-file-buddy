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

export function useChunkedUpload(options: UseChunkedUploadOptions = {}): UseChunkedUploadReturn {
  const { onProgress, onComplete, onError } = options;
  
  const [session, setSession] = useState<UploadSession | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  
  const fileRef = useRef<File | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const activeUploadsRef = useRef<Set<number>>(new Set());
  const speedSamplesRef = useRef<{ time: number; bytes: number }[]>([]);
  const totalBytesUploadedRef = useRef(0);

  // Calculate upload speed from recent samples
  const calculateSpeed = useCallback(() => {
    const samples = speedSamplesRef.current;
    const now = Date.now();
    
    // Keep only samples from the last 5 seconds
    speedSamplesRef.current = samples.filter(s => now - s.time < 5000);
    
    if (speedSamplesRef.current.length < 2) return 0;
    
    const oldest = speedSamplesRef.current[0];
    const newest = speedSamplesRef.current[speedSamplesRef.current.length - 1];
    const timeDiff = (newest.time - oldest.time) / 1000;
    const bytesDiff = newest.bytes - oldest.bytes;
    
    return timeDiff > 0 ? bytesDiff / timeDiff : 0;
  }, []);

  // Update session with new chunk states
  const updateSession = useCallback((
    updater: (prev: UploadSession) => Partial<UploadSession>
  ) => {
    setSession(prev => {
      if (!prev) return prev;
      
      const updates = updater(prev);
      const newSession = { ...prev, ...updates };
      
      // Recalculate speed and ETA
      const speed = calculateSpeed();
      const remainingBytes = newSession.fileSize - totalBytesUploadedRef.current;
      const eta = speed > 0 ? remainingBytes / speed : 0;
      
      newSession.uploadSpeed = speed;
      newSession.eta = eta;
      newSession.bytesUploaded = totalBytesUploadedRef.current;
      
      // Save state for resume support
      saveUploadState(newSession);
      
      // Notify progress
      const progress = calculateProgress(newSession.chunks);
      onProgress?.(progress);
      
      return newSession;
    });
  }, [calculateSpeed, onProgress]);

  // Upload a single chunk with retry logic
  const uploadSingleChunk = useCallback(async (
    uploadId: string,
    chunkIndex: number,
    totalChunks: number,
    file: File
  ): Promise<boolean> => {
    if (isPaused || !abortControllerRef.current) {
      return false;
    }

    // Mark chunk as uploading
    updateSession(prev => ({
      chunks: prev.chunks.map(c =>
        c.index === chunkIndex
          ? { ...c, status: 'uploading' as const, startTime: Date.now() }
          : c
      )
    }));

    activeUploadsRef.current.add(chunkIndex);

    try {
      const chunkData = extractChunk(file, chunkIndex);
      
      await withRetry(
        async () => {
          await uploadChunk(
            uploadId,
            chunkIndex,
            totalChunks,
            chunkData,
            (loaded, _total) => {
              const chunkStart = chunkIndex * CHUNK_SIZE;
              const currentBytes = chunkStart + loaded;
              
              // Update speed samples
              speedSamplesRef.current.push({
                time: Date.now(),
                bytes: currentBytes
              });
              
              totalBytesUploadedRef.current = Math.max(
                totalBytesUploadedRef.current,
                currentBytes
              );
            }
          );
        },
        MAX_RETRIES,
        BASE_RETRY_DELAY
      );

      // Mark chunk as success
      updateSession(prev => ({
        chunks: prev.chunks.map(c =>
          c.index === chunkIndex
            ? { ...c, status: 'success' as const, endTime: Date.now() }
            : c
        )
      }));

      activeUploadsRef.current.delete(chunkIndex);
      return true;
    } catch (error) {
      // Mark chunk as error
      updateSession(prev => ({
        chunks: prev.chunks.map(c =>
          c.index === chunkIndex
            ? {
                ...c,
                status: 'error' as const,
                retries: c.retries + 1,
                error: (error as Error).message
              }
            : c
        )
      }));

      activeUploadsRef.current.delete(chunkIndex);
      return false;
    }
  }, [isPaused, updateSession]);

  // Main upload orchestrator
  const processUploadQueue = useCallback(async () => {
    if (!session || !fileRef.current || isPaused) return;

    const file = fileRef.current;
    const pendingChunks = session.chunks
      .filter(c => c.status === 'pending' || (c.status === 'error' && c.retries < MAX_RETRIES))
      .map(c => c.index);

    if (pendingChunks.length === 0) {
      // Check if all chunks are successful
      const allSuccess = session.chunks.every(c => c.status === 'success');
      
      if (allSuccess) {
        // Finalize upload
        updateSession(() => ({ status: 'processing' as UploadStatus }));
        
        try {
          const result = await finalizeUpload(session.uploadId);
          
          updateSession(() => ({ status: 'completed' as UploadStatus }));
          clearUploadState(session.uploadId);
          
          onComplete?.(result.hash || '', result.zipContents || []);
        } catch (error) {
          updateSession(() => ({ status: 'failed' as UploadStatus }));
          onError?.(`Finalization failed: ${(error as Error).message}`);
        }
      } else {
        // Some chunks failed permanently
        updateSession(() => ({ status: 'failed' as UploadStatus }));
        onError?.('Some chunks failed to upload after max retries');
      }
      
      setIsUploading(false);
      return;
    }

    // Upload chunks with concurrency limit
    const uploadsToStart = Math.min(
      MAX_CONCURRENT_UPLOADS - activeUploadsRef.current.size,
      pendingChunks.length
    );

    const chunksToUpload = pendingChunks.slice(0, uploadsToStart);
    
    await Promise.all(
      chunksToUpload.map(chunkIndex =>
        uploadSingleChunk(
          session.uploadId,
          chunkIndex,
          session.totalChunks,
          file
        )
      )
    );

    // Continue processing if not paused
    if (!isPaused && abortControllerRef.current) {
      // Use setTimeout to prevent call stack overflow
      setTimeout(() => processUploadQueue(), 0);
    }
  }, [session, isPaused, uploadSingleChunk, updateSession, onComplete, onError]);

  // Start upload
  const startUpload = useCallback(async (file: File) => {
    // Validate file type
    if (!file.name.toLowerCase().endsWith('.zip')) {
      onError?.('Only ZIP files are allowed');
      return;
    }

    fileRef.current = file;
    abortControllerRef.current = new AbortController();
    activeUploadsRef.current.clear();
    speedSamplesRef.current = [];
    totalBytesUploadedRef.current = 0;

    const uploadId = generateUploadId(file);
    const totalChunks = calculateTotalChunks(file.size);

    // Check for existing upload state (resume support)
    const savedState = loadUploadState(uploadId);
    let uploadedChunks: number[] = [];

    try {
      // Initialize upload with backend
      const initResponse = await initUpload(
        uploadId,
        file.name,
        file.size,
        totalChunks
      );

      uploadedChunks = initResponse.uploadedChunks || [];
    } catch (error) {
      // If backend is unavailable, use local state only
      if (savedState) {
        uploadedChunks = savedState.chunks
          ?.filter(c => c.status === 'success')
          .map(c => c.index) || [];
      }
      console.warn('Backend init failed, using local state:', error);
    }

    // Initialize chunk states
    const chunks: ChunkState[] = Array.from({ length: totalChunks }, (_, index) => ({
      index,
      status: uploadedChunks.includes(index) ? 'success' : 'pending',
      retries: 0,
    }));

    // Calculate already uploaded bytes
    totalBytesUploadedRef.current = uploadedChunks.length * CHUNK_SIZE;

    const newSession: UploadSession = {
      uploadId,
      filename: file.name,
      fileSize: file.size,
      totalChunks,
      status: 'uploading',
      chunks,
      startTime: Date.now(),
      bytesUploaded: totalBytesUploadedRef.current,
      uploadSpeed: 0,
      eta: 0,
    };

    setSession(newSession);
    setIsUploading(true);
    setIsPaused(false);

    // Start processing queue
    setTimeout(() => processUploadQueue(), 0);
  }, [onError, processUploadQueue]);

  // Pause upload
  const pauseUpload = useCallback(() => {
    setIsPaused(true);
    updateSession(() => ({ status: 'paused' as UploadStatus }));
  }, [updateSession]);

  // Resume upload
  const resumeUpload = useCallback(() => {
    setIsPaused(false);
    updateSession(() => ({ status: 'uploading' as UploadStatus }));
    setTimeout(() => processUploadQueue(), 0);
  }, [updateSession, processUploadQueue]);

  // Cancel upload
  const cancelUpload = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    
    if (session) {
      clearUploadState(session.uploadId);
    }
    
    setSession(null);
    setIsUploading(false);
    setIsPaused(false);
    fileRef.current = null;
    activeUploadsRef.current.clear();
  }, [session]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  // Continue processing when resumed
  useEffect(() => {
    if (isUploading && !isPaused && session?.status === 'uploading') {
      processUploadQueue();
    }
  }, [isUploading, isPaused, session?.status]);

  const progress = session ? calculateProgress(session.chunks) : 0;

  return {
    session,
    startUpload,
    pauseUpload,
    resumeUpload,
    cancelUpload,
    isUploading,
    isPaused,
    progress,
  };
}
