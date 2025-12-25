/**
 * CompletionView Component
 * Shows upload completion status with hash and ZIP contents
 */

import { CheckCircle, FileArchive, Hash, Copy, Check } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface CompletionViewProps {
  filename: string;
  hash: string;
  zipContents: string[];
  onNewUpload: () => void;
  className?: string;
}

export function CompletionView({
  filename,
  hash,
  zipContents,
  onNewUpload,
  className,
}: CompletionViewProps) {
  const [copied, setCopied] = useState(false);

  const handleCopyHash = async () => {
    try {
      await navigator.clipboard.writeText(hash);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy hash:', err);
    }
  };

  return (
    <div className={cn('space-y-8 animate-fade-in', className)}>
      {/* Success header */}
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-success/20 mb-4">
          <CheckCircle className="w-10 h-10 text-success" />
        </div>
        <h2 className="text-2xl font-bold text-foreground mb-2">
          Upload Complete
        </h2>
        <p className="text-muted-foreground">
          Your file has been successfully uploaded and verified.
        </p>
      </div>

      {/* File info card */}
      <div className="p-6 bg-card rounded-lg border border-border space-y-4">
        {/* Filename */}
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/20">
            <FileArchive className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-0.5">
              Filename
            </div>
            <div className="font-medium text-foreground truncate">
              {filename}
            </div>
          </div>
        </div>

        {/* SHA-256 Hash */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">
            <Hash className="w-3.5 h-3.5" />
            SHA-256 Hash
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 p-3 bg-secondary rounded-md font-mono text-xs text-foreground break-all">
              {hash || 'Hash will be computed by the backend'}
            </code>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleCopyHash}
              className="shrink-0"
              disabled={!hash}
            >
              {copied ? (
                <Check className="w-4 h-4 text-success" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>

        {/* ZIP Contents */}
        {zipContents.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground uppercase tracking-wider">
              ZIP Contents (Top Level)
            </div>
            <div className="max-h-[200px] overflow-y-auto p-3 bg-secondary rounded-md">
              <ul className="space-y-1 font-mono text-xs">
                {zipContents.map((item, index) => (
                  <li
                    key={index}
                    className="flex items-center gap-2 text-muted-foreground"
                  >
                    <span className="text-primary">→</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>

      {/* Action button */}
      <div className="flex justify-center">
        <Button
          size="lg"
          onClick={onNewUpload}
          className="gap-2"
        >
          <FileArchive className="w-4 h-4" />
          Upload Another File
        </Button>
      </div>
    </div>
  );
}
