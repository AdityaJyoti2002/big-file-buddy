/**
 * UploadProgress Component
 * Displays upload progress bar and statistics
 */

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import {
  type UploadSession,
  formatBytes,
  formatSpeed,
  formatTime,
  calculateProgress,
} from '@/lib/upload-types';
import {
  Clock,
  Zap,
  HardDrive,
  Layers,
  FileArchive,
  Hash,
} from 'lucide-react';

interface UploadProgressProps {
  session: UploadSession;
  className?: string;
}

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  subValue?: string;
}

function StatCard({ icon, label, value, subValue }: StatCardProps) {
  return (
    <div className="stat-card flex items-center gap-3 p-4 bg-card/50 rounded-lg border border-border">
      <div className="p-2 rounded-lg bg-secondary/50 text-primary">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-muted-foreground uppercase tracking-wider mb-0.5">
          {label}
        </div>
        <div className="font-mono text-lg font-semibold text-foreground truncate">
          {value}
        </div>
        {subValue && (
          <div className="text-xs text-muted-foreground font-mono truncate">
            {subValue}
          </div>
        )}
      </div>
    </div>
  );
}

export function UploadProgress({ session, className }: UploadProgressProps) {
  const progress = useMemo(() => calculateProgress(session.chunks), [session.chunks]);
  
  const stats = useMemo(() => ({
    uploaded: formatBytes(session.bytesUploaded),
    total: formatBytes(session.fileSize),
    speed: formatSpeed(session.uploadSpeed),
    eta: formatTime(session.eta),
    chunksComplete: session.chunks.filter(c => c.status === 'success').length,
    chunksTotal: session.totalChunks,
  }), [session]);

  return (
    <div className={cn('space-y-6', className)}>
      {/* File info header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/20">
          <FileArchive className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-foreground truncate">
            {session.filename}
          </h3>
          <p className="text-sm text-muted-foreground font-mono">
            {stats.total}
          </p>
        </div>
        <div className="text-right">
          <span className="text-2xl font-bold font-mono text-gradient">
            {progress}%
          </span>
        </div>
      </div>

      {/* Main progress bar */}
      <div className="space-y-2">
        <div className="relative h-4 bg-secondary rounded-full overflow-hidden">
          {/* Background track */}
          <div className="absolute inset-0 bg-gradient-to-r from-secondary via-muted to-secondary opacity-50" />
          
          {/* Progress fill */}
          <div
            className={cn(
              'absolute inset-y-0 left-0 rounded-full transition-all duration-300',
              session.status === 'uploading' && 'progress-bar-animate',
              session.status === 'paused' && 'bg-warning',
              session.status === 'completed' && 'bg-success',
              session.status === 'failed' && 'bg-error',
              (session.status === 'uploading' || session.status === 'processing') && 
                'bg-gradient-to-r from-primary to-accent'
            )}
            style={{ width: `${progress}%` }}
          />
          
          {/* Glow effect */}
          {session.status === 'uploading' && (
            <div
              className="absolute inset-y-0 rounded-full blur-sm bg-primary/50"
              style={{ width: `${progress}%` }}
            />
          )}
        </div>

        {/* Progress labels */}
        <div className="flex justify-between text-xs text-muted-foreground font-mono">
          <span>{stats.uploaded}</span>
          <span>{stats.total}</span>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          icon={<Zap className="w-4 h-4" />}
          label="Speed"
          value={stats.speed}
        />
        <StatCard
          icon={<Clock className="w-4 h-4" />}
          label="ETA"
          value={stats.eta}
        />
        <StatCard
          icon={<Layers className="w-4 h-4" />}
          label="Chunks"
          value={`${stats.chunksComplete}/${stats.chunksTotal}`}
        />
        <StatCard
          icon={<HardDrive className="w-4 h-4" />}
          label="Uploaded"
          value={stats.uploaded}
          subValue={`of ${stats.total}`}
        />
      </div>

      {/* Status indicator */}
      <div className="flex items-center justify-center gap-2 py-2">
        <div
          className={cn(
            'w-2 h-2 rounded-full',
            session.status === 'uploading' && 'bg-primary animate-pulse',
            session.status === 'paused' && 'bg-warning',
            session.status === 'processing' && 'bg-accent animate-pulse',
            session.status === 'completed' && 'bg-success',
            session.status === 'failed' && 'bg-error'
          )}
        />
        <span className="text-sm text-muted-foreground capitalize">
          {session.status === 'uploading' && 'Uploading chunks...'}
          {session.status === 'paused' && 'Upload paused'}
          {session.status === 'processing' && 'Processing file...'}
          {session.status === 'completed' && 'Upload complete'}
          {session.status === 'failed' && 'Upload failed'}
        </span>
      </div>
    </div>
  );
}
