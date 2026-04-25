import { useEffect, useRef } from 'react';
import { MessageItem } from './MessageItem';
import type { UiMessage } from './MessageItem';

interface ChatViewProps {
  messages: UiMessage[];
  isResponding: boolean;
  onSuggestion: (text: string) => void;
  filename?: string;
}

const SUGGESTIONS = [
  'Summarize this document in five bullet points',
  'What are the key dates or numbers mentioned?',
  'List the main arguments or findings',
  'Explain the most important section in plain language',
];

export function ChatView({ messages, isResponding, onSuggestion, filename }: ChatViewProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, isResponding]);

  const showSuggestions =
    !isResponding &&
    messages.length <= 1 &&
    messages.every((m) => m.role === 'assistant');

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
          <MessageItem key={m.id} message={m} />
        ))}

        {showSuggestions && (
          <div className="suggestions" aria-label="Suggested prompts">
            {SUGGESTIONS.map((s) => (
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
