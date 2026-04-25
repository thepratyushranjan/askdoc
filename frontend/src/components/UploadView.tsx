import { useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import { FileUp, FileText, Loader2, AlertCircle, RotateCcw } from 'lucide-react';

type Phase =
  | { kind: 'idle' }
  | { kind: 'uploading' }
  | { kind: 'processing'; filename: string }
  | { kind: 'failed'; message: string };

interface UploadViewProps {
  phase: Phase;
  onUpload: (file: File) => void;
  onRetry: () => void;
}

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB
const ALLOWED = ['.pdf', '.docx'];

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 5) return 'Working late';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 21) return 'Good evening';
  return 'Good evening';
}

function validate(file: File): string | null {
  const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
  if (!ALLOWED.includes(ext)) return 'Only PDF and DOCX files are supported.';
  if (file.size > MAX_BYTES) return 'File is too large. Max size is 25 MB.';
  if (file.size === 0) return 'This file appears to be empty.';
  return null;
}

export function UploadView({ phase, onUpload, onRetry }: UploadViewProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const isBusy = phase.kind === 'uploading' || phase.kind === 'processing';

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    const err = validate(file);
    if (err) {
      setLocalError(err);
      return;
    }
    setLocalError(null);
    onUpload(file);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);
    if (isBusy) return;
    handleFile(e.dataTransfer.files?.[0]);
  };

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    handleFile(e.target.files?.[0]);
    e.target.value = '';
  };

  return (
    <div className="upload-stage" role="region" aria-live="polite">
      <div className="hero">
        <h1 className="hero-title">{getGreeting()}</h1>
        <p className="hero-sub">
          Upload a document, then ask anything about it.
        </p>
      </div>

      {phase.kind === 'failed' ? (
        <div className="upload-card upload-failed" role="alert">
          <div className="upload-icon-wrap upload-icon-error">
            <AlertCircle size={22} aria-hidden="true" />
          </div>
          <div className="upload-card-title">Something went wrong</div>
          <div className="upload-card-sub">{phase.message}</div>
          <button type="button" className="primary-btn" onClick={onRetry}>
            <RotateCcw size={14} aria-hidden="true" />
            Try again
          </button>
        </div>
      ) : phase.kind === 'processing' ? (
        <div className="upload-card upload-processing">
          <div className="upload-icon-wrap upload-icon-busy">
            <Loader2 size={22} className="spin" aria-hidden="true" />
          </div>
          <div className="upload-card-title">Analyzing your document</div>
          <div className="upload-card-sub">
            <FileText size={13} aria-hidden="true" />
            <span className="filename-pill">{phase.filename}</span>
          </div>
          <div className="upload-progress" aria-hidden="true">
            <div className="upload-progress-bar" />
          </div>
          <div className="upload-hint">
            Reading text, splitting into chunks, and creating embeddings.
          </div>
        </div>
      ) : (
        <div
          className={`upload-card upload-dropzone ${dragActive ? 'is-drag' : ''} ${
            phase.kind === 'uploading' ? 'is-uploading' : ''
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            if (!isBusy) setDragActive(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setDragActive(false);
          }}
          onDrop={onDrop}
          onClick={() => !isBusy && inputRef.current?.click()}
          role="button"
          tabIndex={0}
          aria-disabled={isBusy}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === ' ') && !isBusy) {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
        >
          <div className="upload-icon-wrap">
            {phase.kind === 'uploading' ? (
              <Loader2 size={22} className="spin" aria-hidden="true" />
            ) : (
              <FileUp size={22} aria-hidden="true" />
            )}
          </div>
          <div className="upload-card-title">
            {phase.kind === 'uploading' ? 'Uploading…' : 'Drop a file or click to browse'}
          </div>
          <div className="upload-card-sub">
            PDF or DOCX · up to 25 MB
          </div>

          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="visually-hidden"
            onChange={onChange}
            disabled={isBusy}
          />
        </div>
      )}

      {localError && phase.kind === 'idle' && (
        <div className="inline-error" role="alert">
          <AlertCircle size={14} aria-hidden="true" />
          {localError}
        </div>
      )}
    </div>
  );
}
