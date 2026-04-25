import { FileText, PenSquare, PanelLeft, Sparkles } from 'lucide-react';

interface HeaderProps {
  filename?: string;
  onNewDocument: () => void;
  showNewButton: boolean;
  onToggleSidebar: () => void;
  sidebarOpen: boolean;
}

export function Header({
  filename,
  onNewDocument,
  showNewButton,
  onToggleSidebar,
  sidebarOpen,
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

        {filename && (
          <div className="header-doc" title={filename}>
            <FileText size={14} aria-hidden="true" />
            <span className="header-doc-name">{filename}</span>
          </div>
        )}

        <div className="header-actions">
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
        </div>
      </div>
    </header>
  );
}
