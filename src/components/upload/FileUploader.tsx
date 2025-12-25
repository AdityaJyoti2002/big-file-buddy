/**
 * FileUploader Component
 * Main component orchestrating the chunked file upload experience
 */

import { useState, useCallback } from 'react';
import { useChunkedUpload } from '@/hooks/use-chunked-upload';
import { DropZone } from './DropZone';
import { UploadProgress } from './UploadProgress';
import { ChunkGrid } from './ChunkGrid';
import { UploadControls } from './UploadControls';
import { CompletionView } from './CompletionView';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface FileUploaderProps {
  className?: string;
}

export function FileUploader({ className }: FileUploaderProps) {
  const [completionData, setCompletionData] = useState<{
    filename: string;
    hash: string;
    zipContents: string[];
  } | null>(null);

  const handleComplete = useCallback((hash: string, zipContents: string[]) => {
    setCompletionData({
      filename: session?.filename || 'Uploaded file',
      hash,
      zipContents,
    });
    toast({
      title: 'Upload Complete',
      description: 'Your file has been successfully uploaded and verified.',
    });
  }, []);

  const handleError = useCallback((error: string) => {
    toast({
      title: 'Upload Error',
      description: error,
      variant: 'destructive',
    });
  }, []);

  const {
    session,
    startUpload,
    pauseUpload,
    resumeUpload,
    cancelUpload,
    isUploading,
    isPaused,
    progress,
  } = useChunkedUpload({
    onComplete: handleComplete,
    onError: handleError,
  });

  const handleFileSelect = useCallback((file: File) => {
    setCompletionData(null);
    startUpload(file);
  }, [startUpload]);

  const handleNewUpload = useCallback(() => {
    setCompletionData(null);
    cancelUpload();
  }, [cancelUpload]);

  const handleRetry = useCallback(() => {
    // Reset and allow selecting a new file
    setCompletionData(null);
    cancelUpload();
  }, [cancelUpload]);

  // Show completion view
  if (completionData) {
    return (
      <div className={cn('max-w-2xl mx-auto', className)}>
        <CompletionView
          filename={completionData.filename}
          hash={completionData.hash}
          zipContents={completionData.zipContents}
          onNewUpload={handleNewUpload}
        />
      </div>
    );
  }

  // Show upload in progress
  if (session) {
    return (
      <div className={cn('space-y-8', className)}>
        {/* Progress section */}
        <UploadProgress session={session} />

        {/* Control buttons */}
        <div className="flex justify-center">
          <UploadControls
            status={session.status}
            isPaused={isPaused}
            onPause={pauseUpload}
            onResume={resumeUpload}
            onCancel={cancelUpload}
            onRetry={session.status === 'failed' ? handleRetry : undefined}
          />
        </div>

        {/* Chunk visualization */}
        <div className="pt-4 border-t border-border">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">
            Chunk Status Grid
          </h3>
          <ChunkGrid chunks={session.chunks} />
        </div>
      </div>
    );
  }

  // Show drop zone (initial state)
  return (
    <div className={className}>
      <DropZone
        onFileSelect={handleFileSelect}
        disabled={isUploading}
      />
    </div>
  );
}
