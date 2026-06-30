import { FileText, PenSquare, PanelLeft, Sparkles, Webhook } from 'lucide-react';
import type { HealthStatus } from '../api';

interface HeaderProps {
  filename?: string;
  onNewDocument: () => void;
  showNewButton: boolean;
  onToggleSidebar: () => void;
  sidebarOpen: boolean;
  onExtract?: () => void;
  onAudit?: () => void;
  isExtracting?: boolean;
  isAuditing?: boolean;
  health?: HealthStatus | null;
  onWebhooks?: () => void;
}

function HealthDot({ health }: { health: HealthStatus | null | undefined }) {
  if (!health) {
    return (
      <span className="health-indicator" title="Backend unreachable">
        <span className="health-dot health-unknown" />
      </span>
    );
  }

  const allUp = health.status === 'ok';
  const services = health.services;
  const title = `Postgres: ${services.postgres} · pgvector: ${services.pgvector} · Redis: ${services.redis}`;

  return (
    <span className="health-indicator" title={title}>
      <span className={`health-dot ${allUp ? 'health-ok' : 'health-degraded'}`} />
      <span className="health-label">{allUp ? 'Online' : 'Degraded'}</span>
    </span>
  );
}

export function Header({
  filename,
  onNewDocument,
  showNewButton,
  onToggleSidebar,
  sidebarOpen,
  onExtract,
  onAudit,
  isExtracting,
  isAuditing,
  health,
  onWebhooks,
}: HeaderProps) {
  return (
    <header className="app-header">
      <div className="header-inner">
        <button
          type="button"
          className="ghost-btn header-toggle"
          onClick={onToggleSidebar}
          aria-label={sidebarOpen ? 'Close history' : 'Open history'}
          aria-pressed={sidebarOpen}
        >
          <PanelLeft size={15} aria-hidden="true" />
        </button>

        <div className="header-brand" aria-label="Askdoc">
          <span className="brand-glyph" aria-hidden="true">
            <Sparkles size={16} strokeWidth={2.25} />
          </span>
          <span className="brand-text">Askdoc</span>
        </div>

        <HealthDot health={health} />

        {filename && (
          <div className="header-doc" title={filename}>
            <FileText size={14} aria-hidden="true" />
            <span className="header-doc-name">{filename}</span>
          </div>
        )}

        <div className="header-actions">
          {onExtract && (
            <button
              type="button"
              className="ghost-btn"
              onClick={onExtract}
              title="Extract Metadata"
              disabled={isExtracting}
            >
              <span>{isExtracting ? 'Extracting…' : '📋 Extract'}</span>
            </button>
          )}
          {onAudit && (
            <button
              type="button"
              className="ghost-btn"
              onClick={onAudit}
              title="Audit Document"
              disabled={isAuditing}
            >
              <span>{isAuditing ? 'Auditing…' : '🛡️ Audit Risks'}</span>
            </button>
          )}
          {showNewButton && (
            <button
              type="button"
              className="ghost-btn"
              onClick={onNewDocument}
              title="Start a new document"
            >
              <PenSquare size={15} aria-hidden="true" />
              <span>New</span>
            </button>
          )}
          {onWebhooks && (
            <button
              type="button"
              className="ghost-btn"
              onClick={onWebhooks}
              title="Configure Webhooks"
            >
              <Webhook size={15} aria-hidden="true" />
              <span>Webhooks</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
