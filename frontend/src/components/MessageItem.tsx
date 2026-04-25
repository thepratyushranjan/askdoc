import { useState } from 'react';
import { Check, Copy, Sparkles } from 'lucide-react';
import { Markdown } from './Markdown';

export interface UiMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  pending?: boolean;
  error?: boolean;
}

interface MessageItemProps {
  message: UiMessage;
}

export function MessageItem({ message }: MessageItemProps) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  };

  if (isUser) {
    return (
      <div className="msg msg-user">
        <div className="msg-bubble">{message.content}</div>
      </div>
    );
  }

  return (
    <div className={`msg msg-assistant ${message.error ? 'is-error' : ''}`}>
      <div className="msg-meta">
        <span className="msg-glyph" aria-hidden="true">
          <Sparkles size={12} />
        </span>
        <span className="msg-role">Askdoc</span>
      </div>
      <div className="msg-body">
        {message.pending ? (
          <span className="msg-thinking" aria-live="polite">
            <span className="dot" />
            <span className="dot" />
            <span className="dot" />
          </span>
        ) : (
          <Markdown source={message.content} />
        )}
      </div>
      {!message.pending && !message.error && (
        <div className="msg-actions">
          <button type="button" className="icon-btn" onClick={copy} title="Copy">
            {copied ? <Check size={14} /> : <Copy size={14} />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
      )}
    </div>
  );
}
