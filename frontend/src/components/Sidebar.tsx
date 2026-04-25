import { FileText, PenSquare, Trash2 } from 'lucide-react';

export interface HistoryItem {
  documentId: string;
  conversationId: string;
  filename: string;
  createdAt: number;
}

interface SidebarProps {
  history: HistoryItem[];
  activeConversationId?: string;
  onSelect: (item: HistoryItem) => void;
  onNew: () => void;
  onDelete: (conversationId: string) => void;
  open: boolean;
  onClose: () => void;
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString();
}

export function Sidebar({
  history,
  activeConversationId,
  onSelect,
  onNew,
  onDelete,
  open,
  onClose,
}: SidebarProps) {
  return (
    <>
      <div
        className={`sidebar-scrim ${open ? 'is-open' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside className={`sidebar ${open ? 'is-open' : ''}`} aria-label="Chat history">
        <div className="sidebar-head">
          <button type="button" className="sidebar-new" onClick={onNew}>
            <PenSquare size={14} aria-hidden="true" />
            <span>New chat</span>
          </button>
        </div>

        <div className="sidebar-section-label">Recent</div>

        <nav className="sidebar-list">
          {history.length === 0 ? (
            <div className="sidebar-empty">No past chats yet.</div>
          ) : (
            history.map((it) => {
              const active = it.conversationId === activeConversationId;
              return (
                <div
                  key={it.conversationId}
                  className={`sidebar-item ${active ? 'is-active' : ''}`}
                >
                  <button
                    type="button"
                    className="sidebar-item-main"
                    onClick={() => onSelect(it)}
                    title={it.filename}
                  >
                    <FileText size={13} aria-hidden="true" />
                    <span className="sidebar-item-name">{it.filename}</span>
                    <span className="sidebar-item-time">{formatRelative(it.createdAt)}</span>
                  </button>
                  <button
                    type="button"
                    className="sidebar-item-del"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(it.conversationId);
                    }}
                    title="Remove from history"
                    aria-label={`Remove ${it.filename}`}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              );
            })
          )}
        </nav>
      </aside>
    </>
  );
}
