/**
 * DropZone Component
 * Drag and drop file upload zone with ZIP validation
 */

import { useState, useCallback, useRef } from 'react';
import { Upload, FileArchive, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatBytes } from '@/lib/upload-types';

interface DropZoneProps {
  onFileSelect: (file: File) => void;
  disabled?: boolean;
  className?: string;
}

export function DropZone({ onFileSelect, disabled, className }: DropZoneProps) {
  const [isDragActive, setIsDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const validateFile = useCallback((file: File): boolean => {
    setError(null);

    // Check file type
    if (!file.name.toLowerCase().endsWith('.zip')) {
      setError('Only ZIP files are allowed');
      return false;
    }

    // File size validation (optional max size)
    // const maxSize = 10 * 1024 * 1024 * 1024; // 10GB
    // if (file.size > maxSize) {
    //   setError(`File too large. Maximum size is ${formatBytes(maxSize)}`);
    //   return false;
    // }

    return true;
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) {
      setIsDragActive(true);
    }
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    if (disabled) return;

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      if (validateFile(file)) {
        onFileSelect(file);
      }
    }
  }, [disabled, validateFile, onFileSelect]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (validateFile(file)) {
        onFileSelect(file);
      }
    }
    // Reset input
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  }, [validateFile, onFileSelect]);

  const handleClick = useCallback(() => {
    if (!disabled) {
      inputRef.current?.click();
    }
  }, [disabled]);

  return (
    <div className={cn('w-full', className)}>
      <div
        onClick={handleClick}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={cn(
          'drop-zone relative flex flex-col items-center justify-center p-12 cursor-pointer',
          'bg-card/50 backdrop-blur-card',
          'min-h-[280px] transition-all duration-300',
          isDragActive && 'drop-zone-active border-primary',
          disabled && 'opacity-50 cursor-not-allowed',
          error && 'border-error'
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".zip"
          onChange={handleFileInput}
          className="hidden"
          disabled={disabled}
        />

        {/* Animated background gradient */}
        <div
          className={cn(
            'absolute inset-0 rounded-lg opacity-0 transition-opacity duration-500',
            isDragActive && 'opacity-100'
          )}
          style={{
            background: 'radial-gradient(ellipse at center, hsl(var(--primary) / 0.1) 0%, transparent 70%)'
          }}
        />

        {/* Icon */}
        <div
          className={cn(
            'relative mb-6 p-4 rounded-xl transition-all duration-300',
            'bg-secondary/50',
            isDragActive && 'bg-primary/20 scale-110'
          )}
        >
          {isDragActive ? (
            <FileArchive className="w-12 h-12 text-primary animate-pulse" />
          ) : (
            <Upload className="w-12 h-12 text-muted-foreground" />
          )}
        </div>

        {/* Text */}
        <div className="relative text-center">
          <p className="text-lg font-medium text-foreground mb-2">
            {isDragActive ? 'Drop your ZIP file here' : 'Drag & drop your ZIP file'}
          </p>
          <p className="text-sm text-muted-foreground mb-4">
            or click to browse
          </p>
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground/70">
            <FileArchive className="w-3.5 h-3.5" />
            <span>ZIP files only • Supports files up to 10GB+</span>
          </div>
        </div>

        {/* Corners decoration */}
        <div className="absolute top-4 left-4 w-4 h-4 border-l-2 border-t-2 border-border rounded-tl" />
        <div className="absolute top-4 right-4 w-4 h-4 border-r-2 border-t-2 border-border rounded-tr" />
        <div className="absolute bottom-4 left-4 w-4 h-4 border-l-2 border-b-2 border-border rounded-bl" />
        <div className="absolute bottom-4 right-4 w-4 h-4 border-r-2 border-b-2 border-border rounded-br" />
      </div>

      {/* Error message */}
      {error && (
        <div className="mt-3 flex items-center gap-2 text-error text-sm animate-fade-in">
          <AlertCircle className="w-4 h-4" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
