import { useEffect, useRef } from 'react';
import type { KeyboardEvent } from 'react';
import { ArrowUp, Square } from 'lucide-react';

interface ComposerProps {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  isResponding?: boolean;
  onStop?: () => void;
  placeholder?: string;
}

export function Composer({
  value,
  onChange,
  onSubmit,
  disabled,
  isResponding,
  onStop,
  placeholder = 'Ask anything about your document…',
}: ComposerProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const ta = ref.current;
    if (!ta) return;
    ta.style.height = '0px';
    ta.style.height = Math.min(ta.scrollHeight, 220) + 'px';
  }, [value]);

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (!disabled && value.trim()) onSubmit();
    }
  };

  const canSend = !disabled && value.trim().length > 0;

  return (
    <div className="composer-wrap">
      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSend) onSubmit();
        }}
      >
        <textarea
          ref={ref}
          className="composer-input"
          rows={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          disabled={disabled && !isResponding}
          aria-label="Message"
        />
        <div className="composer-bar">
          <span className="composer-hint">
            <kbd>Enter</kbd> to send · <kbd>Shift + Enter</kbd> for new line
          </span>
          {isResponding && onStop ? (
            <button
              type="button"
              className="send-btn"
              onClick={onStop}
              title="Stop"
              aria-label="Stop response"
            >
              <Square size={14} fill="currentColor" />
            </button>
          ) : (
            <button
              type="submit"
              className="send-btn"
              disabled={!canSend}
              title="Send"
              aria-label="Send message"
            >
              <ArrowUp size={16} />
            </button>
          )}
        </div>
      </form>
      <div className="composer-foot">
        Developed with &hearts; by <strong>Pratyush</strong> &bull; &copy; 2026
      </div>
    </div>
  );
}
