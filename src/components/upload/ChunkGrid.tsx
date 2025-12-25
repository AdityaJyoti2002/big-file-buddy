/**
 * ChunkGrid Component
 * Visual grid showing the status of each chunk
 */

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { type ChunkState, type ChunkStatus } from '@/lib/upload-types';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface ChunkGridProps {
  chunks: ChunkState[];
  className?: string;
}

const statusConfig: Record<ChunkStatus, { label: string; className: string }> = {
  pending: {
    label: 'Pending',
    className: 'bg-chunk-pending',
  },
  uploading: {
    label: 'Uploading',
    className: 'bg-chunk-uploading chunk-uploading',
  },
  success: {
    label: 'Success',
    className: 'bg-chunk-success',
  },
  error: {
    label: 'Error',
    className: 'bg-chunk-error',
  },
};

export function ChunkGrid({ chunks, className }: ChunkGridProps) {
  // Calculate optimal grid size based on chunk count
  const gridCols = useMemo(() => {
    if (chunks.length <= 50) return 10;
    if (chunks.length <= 200) return 20;
    if (chunks.length <= 500) return 25;
    return 30;
  }, [chunks.length]);

  // Status summary
  const summary = useMemo(() => {
    return chunks.reduce(
      (acc, chunk) => {
        acc[chunk.status]++;
        return acc;
      },
      { pending: 0, uploading: 0, success: 0, error: 0 } as Record<ChunkStatus, number>
    );
  }, [chunks]);

  return (
    <div className={cn('space-y-4', className)}>
      {/* Status Legend */}
      <div className="flex flex-wrap items-center gap-4 text-sm">
        {(Object.keys(statusConfig) as ChunkStatus[]).map((status) => (
          <div key={status} className="flex items-center gap-2">
            <div
              className={cn(
                'w-3 h-3 rounded-sm',
                statusConfig[status].className
              )}
            />
            <span className="text-muted-foreground">
              {statusConfig[status].label}:{' '}
              <span className="font-mono text-foreground">{summary[status]}</span>
            </span>
          </div>
        ))}
      </div>

      {/* Chunk Grid */}
      <div
        className="p-4 bg-card/50 rounded-lg border border-border overflow-hidden"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))`,
          gap: '3px',
        }}
      >
        {chunks.map((chunk) => (
          <Tooltip key={chunk.index}>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  'aspect-square rounded-sm transition-all duration-200 cursor-pointer',
                  'hover:scale-125 hover:z-10 hover:shadow-glow',
                  statusConfig[chunk.status].className
                )}
              />
            </TooltipTrigger>
            <TooltipContent side="top" className="font-mono text-xs">
              <div className="space-y-1">
                <div>Chunk {chunk.index + 1}</div>
                <div className="text-muted-foreground">
                  Status: {statusConfig[chunk.status].label}
                </div>
                {chunk.retries > 0 && (
                  <div className="text-warning">Retries: {chunk.retries}</div>
                )}
                {chunk.error && (
                  <div className="text-error text-xs max-w-[200px] truncate">
                    {chunk.error}
                  </div>
                )}
              </div>
            </TooltipContent>
          </Tooltip>
        ))}
      </div>

      {/* Progress text */}
      <div className="text-center text-sm text-muted-foreground font-mono">
        {summary.success} / {chunks.length} chunks uploaded
      </div>
    </div>
  );
}
