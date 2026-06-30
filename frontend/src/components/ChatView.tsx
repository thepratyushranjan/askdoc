import { useEffect, useRef } from 'react';
import { MessageItem } from './MessageItem';
import type { UiMessage } from './MessageItem';

interface ChatViewProps {
  messages: UiMessage[];
  isResponding: boolean;
  onSuggestion: (text: string) => void;
  filename?: string;
  suggestions?: string[];
}

export function ChatView({ messages, isResponding, onSuggestion, filename, suggestions = [] }: ChatViewProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, isResponding]);

  const showStarterSuggestions =
    !isResponding &&
    messages.length <= 1 &&
    messages.every((m) => m.role === 'assistant');

  let lastAssistantId: string | undefined;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant' && !messages[i].pending) {
      lastAssistantId = messages[i].id;
      break;
    }
  }

  return (
    <div className="chat-stage">
      <div className="chat-stream">
        {messages.length === 0 && (
          <div className="chat-welcome">
            <h2>Ready when you are</h2>
            <p>
              {filename
                ? `I've finished reading ${filename}. Ask me anything about it.`
                : 'Ask me anything about your document.'}
            </p>
          </div>
        )}

        {messages.map((m) => (
          <MessageItem
            key={m.id}
            message={m}
            onFollowUp={isResponding ? undefined : onSuggestion}
            isLastAssistant={m.id === lastAssistantId}
          />
        ))}

        {showStarterSuggestions && suggestions.length > 0 && (
          <div className="suggestions" aria-label="Suggested prompts">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                className="suggestion-chip"
                onClick={() => onSuggestion(s)}
              >
                {s}
              </button>
            ))}
          </div>
        )}

        <div ref={endRef} />
      </div>
    </div>
  );
}
