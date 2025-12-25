/**
 * UploadControls Component
 * Pause, Resume, and Cancel buttons for upload management
 */

import { Pause, Play, X, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { type UploadStatus } from '@/lib/upload-types';

interface UploadControlsProps {
  status: UploadStatus;
  isPaused: boolean;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
  onRetry?: () => void;
  className?: string;
}

export function UploadControls({
  status,
  isPaused,
  onPause,
  onResume,
  onCancel,
  onRetry,
  className,
}: UploadControlsProps) {
  const isActive = status === 'uploading' || status === 'paused';
  const isFailed = status === 'failed';
  const isProcessing = status === 'processing';

  return (
    <div className={cn('flex items-center gap-3', className)}>
      {/* Pause/Resume button */}
      {isActive && (
        <Button
          variant="outline"
          size="lg"
          onClick={isPaused ? onResume : onPause}
          className="gap-2 min-w-[120px]"
        >
          {isPaused ? (
            <>
              <Play className="w-4 h-4" />
              Resume
            </>
          ) : (
            <>
              <Pause className="w-4 h-4" />
              Pause
            </>
          )}
        </Button>
      )}

      {/* Cancel button */}
      {(isActive || isProcessing) && (
        <Button
          variant="destructive"
          size="lg"
          onClick={onCancel}
          className="gap-2"
          disabled={isProcessing}
        >
          <X className="w-4 h-4" />
          Cancel
        </Button>
      )}

      {/* Retry button for failed uploads */}
      {isFailed && onRetry && (
        <Button
          variant="default"
          size="lg"
          onClick={onRetry}
          className="gap-2"
        >
          <RotateCcw className="w-4 h-4" />
          Retry Upload
        </Button>
      )}
    </div>
  );
}
