import { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { api } from '../api';
import type { WebhookEvent, WebhookResponse } from '../api';
import { Trash2, Plus, RefreshCw } from 'lucide-react';

interface WebhookModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const AVAILABLE_EVENTS: WebhookEvent[] = [
  'ingestion.completed',
  'ingestion.failed',
  'extraction.completed',
  'audit.completed'
];

export function WebhookModal({ isOpen, onClose }: WebhookModalProps) {
  const [webhooks, setWebhooks] = useState<WebhookResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [url, setUrl] = useState('');
  const [event, setEvent] = useState<WebhookEvent>('ingestion.completed');
  const [secret, setSecret] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchWebhooks = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getWebhooks();
      setWebhooks(res.webhooks);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch webhooks');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchWebhooks();
      setUrl('');
      setSecret('');
      setEvent('ingestion.completed');
    }
  }, [isOpen]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;

    setCreating(true);
    setError(null);
    try {
      await api.createWebhook({ url, event, secret: secret || undefined });
      setUrl('');
      setSecret('');
      await fetchWebhooks();
    } catch (err: any) {
      setError(err.message || 'Failed to create webhook');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.deleteWebhook(id);
      setWebhooks(w => w.filter(hook => hook.id !== id));
    } catch (err: any) {
      setError(err.message || 'Failed to delete webhook');
    }
  };

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Configure Webhooks">
      <div className="webhook-modal-content">
        <p style={{ marginBottom: '1rem', color: 'var(--text-secondary)' }}>
          Register webhooks to receive real-time POST requests when async tasks complete.
        </p>

        {error && (
          <div className="toast toast-error" style={{ position: 'relative', marginBottom: '1rem', bottom: 0, left: 0, transform: 'none' }}>
            <span>⚠️ {error}</span>
          </div>
        )}

        <form onSubmit={handleCreate} className="webhook-form" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '2rem', padding: '1rem', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
          <h4>Add New Webhook</h4>
          
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.25rem' }}>URL endpoint</label>
            <input 
              type="url" 
              value={url} 
              onChange={e => setUrl(e.target.value)} 
              placeholder="https://your-domain.com/webhook" 
              required
              style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
            />
          </div>

          <div style={{ display: 'flex', gap: '1rem' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.25rem' }}>Event trigger</label>
              <select 
                value={event} 
                onChange={e => setEvent(e.target.value as WebhookEvent)}
                style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
              >
                {AVAILABLE_EVENTS.map(ev => (
                  <option key={ev} value={ev}>{ev}</option>
                ))}
              </select>
            </div>
            
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.25rem' }}>HMAC Secret (optional)</label>
              <input 
                type="text" 
                value={secret} 
                onChange={e => setSecret(e.target.value)} 
                placeholder="super-secret-key"
                style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
              />
            </div>
          </div>

          <button 
            type="submit" 
            disabled={creating || !url}
            className="ghost-btn"
            style={{ alignSelf: 'flex-start', background: 'var(--accent-color)', color: 'white', marginTop: '0.5rem' }}
          >
            {creating ? <RefreshCw size={14} className="spin" /> : <Plus size={14} />}
            <span style={{ marginLeft: '4px' }}>Register Webhook</span>
          </button>
        </form>

        <div className="webhook-list">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h4>Registered Webhooks</h4>
            <button onClick={fetchWebhooks} className="ghost-btn" title="Refresh list">
              <RefreshCw size={14} className={loading ? 'spin' : ''} />
            </button>
          </div>

          {loading && webhooks.length === 0 ? (
            <p>Loading...</p>
          ) : webhooks.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>No webhooks registered yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {webhooks.map(hook => (
                <div key={hook.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', border: '1px solid var(--border-color)', borderRadius: '6px', background: 'var(--bg-primary)' }}>
                  <div style={{ overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                      <span style={{ background: 'var(--accent-color)', color: 'white', fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>
                        {hook.event}
                      </span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        {new Date(hook.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {hook.url}
                    </div>
                  </div>
                  <button 
                    onClick={() => handleDelete(hook.id)} 
                    className="ghost-btn" 
                    title="Delete Webhook"
                    style={{ color: '#ef4444' }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
