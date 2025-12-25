/**
 * Large File Upload System
 * Main page with chunked, resumable upload interface
 */

import { FileUploader } from '@/components/upload/FileUploader';
import { Cloud, Shield, Zap, RefreshCw } from 'lucide-react';

const features = [
  {
    icon: Zap,
    title: '5MB Chunks',
    description: 'Files split into manageable chunks for efficient upload',
  },
  {
    icon: RefreshCw,
    title: 'Resumable',
    description: 'Continue uploads after network interruptions',
  },
  {
    icon: Shield,
    title: 'Verified',
    description: 'SHA-256 hash verification on completion',
  },
  {
    icon: Cloud,
    title: 'Concurrent',
    description: '3 parallel uploads with exponential backoff retry',
  },
];

export default function Index() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card/30 backdrop-blur-card sticky top-0 z-50">
        <div className="container max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/20">
                <Cloud className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h1 className="font-semibold text-foreground">
                  ChunkUpload
                </h1>
                <p className="text-xs text-muted-foreground">
                  Resilient Large File Uploads
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
              <span className="px-2 py-1 rounded bg-secondary">v1.0.0</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 container max-w-6xl mx-auto px-4 py-12">
        {/* Hero Section */}
        <div className="text-center mb-12 animate-fade-in">
          <h2 className="text-4xl md:text-5xl font-bold mb-4">
            <span className="text-gradient">Chunked File Upload</span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Upload large ZIP files (1GB+) with automatic chunking, 
            concurrent uploads, retry logic, and resume support.
          </p>
        </div>

        {/* Feature badges */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
          {features.map((feature, index) => (
            <div
              key={feature.title}
              className="stat-card p-4 bg-card/50 rounded-lg border border-border text-center animate-fade-in"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <feature.icon className="w-6 h-6 text-primary mx-auto mb-2" />
              <h3 className="font-medium text-foreground text-sm mb-1">
                {feature.title}
              </h3>
              <p className="text-xs text-muted-foreground">
                {feature.description}
              </p>
            </div>
          ))}
        </div>

        {/* File Uploader */}
        <div className="max-w-4xl mx-auto">
          <FileUploader />
        </div>

        {/* Technical specs */}
        <div className="mt-16 pt-8 border-t border-border">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-6 text-center">
            Technical Specifications
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            {[
              { label: 'Chunk Size', value: '5 MB' },
              { label: 'Concurrent Uploads', value: '3' },
              { label: 'Max Retries', value: '3' },
              { label: 'Backoff Strategy', value: 'Exponential' },
            ].map((spec) => (
              <div key={spec.label} className="p-4">
                <div className="text-2xl font-mono font-bold text-primary mb-1">
                  {spec.value}
                </div>
                <div className="text-xs text-muted-foreground">
                  {spec.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-6">
        <div className="container max-w-6xl mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>
            Built with React + TypeScript • Backend: Node.js + Express + MySQL
          </p>
          <p className="mt-1 text-xs">
            See <code className="px-1.5 py-0.5 bg-secondary rounded">backend/</code> folder for server implementation
          </p>
        </div>
      </footer>
    </div>
  );
}
