import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from './api';
import type { ServerMessage } from './api';
import { Header } from './components/Header';
import { UploadView } from './components/UploadView';
import { ChatView } from './components/ChatView';
import { Composer } from './components/Composer';
import { Sidebar } from './components/Sidebar';
import type { HistoryItem } from './components/Sidebar';
import type { UiMessage } from './components/MessageItem';
import { Modal } from './components/Modal';
import './App.css';

type Phase =
  | { kind: 'idle' }
  | { kind: 'uploading' }
  | { kind: 'processing'; documentId: string; filename: string }
  | { kind: 'failed'; message: string }
  | { kind: 'ready'; documentId: string; conversationId: string; filename: string };

const SESSION_KEY = 'askdoc.session.v1';
const HISTORY_KEY = 'askdoc.history.v1';

interface PersistedSession {
  documentId: string;
  conversationId: string;
  filename: string;
}

function loadSession(): PersistedSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.conversationId === 'string') return parsed;
  } catch {
    /* ignore */
  }
  return null;
}

function saveSession(s: PersistedSession) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(s));
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

function loadHistory(): HistoryItem[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((x) => x?.conversationId);
  } catch {
    /* ignore */
  }
  return [];
}

function saveHistory(items: HistoryItem[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(items));
}

function welcomeMessage(filename: string): UiMessage {
  return {
    id: 'welcome',
    role: 'assistant',
    content: `I've finished reading **${filename}**. Ask me anything about it — a summary, a specific section, or a question hidden in the details.`,
  };
}

function adaptServerMessages(server: ServerMessage[]): UiMessage[] {
  return server.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
  }));
}

export default function App() {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState('');
  const [isResponding, setIsResponding] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>(() => loadHistory());
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [extractedData, setExtractedData] = useState<any>(null);
  const [auditReport, setAuditReport] = useState<any>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isAuditing, setIsAuditing] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  const [initialSession] = useState<PersistedSession | null>(() => loadSession());
  const [restoring, setRestoring] = useState(initialSession !== null);

  // Restore last session on mount.
  useEffect(() => {
    if (!initialSession) return;
    const session = initialSession;
    let cancelled = false;

    (async () => {
      try {
        const conv = await api.getConversation(session.conversationId);
        if (cancelled) return;
        setPhase({
          kind: 'ready',
          documentId: session.documentId,
          conversationId: session.conversationId,
          filename: session.filename,
        });
        const restored = adaptServerMessages(conv.messages);
        setMessages(
          restored.length > 0 ? restored : [welcomeMessage(session.filename)]
        );
      } catch {
        if (cancelled) return;
        clearSession();
        setPhase({ kind: 'idle' });
      } finally {
        if (!cancelled) setRestoring(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [initialSession]);

  // Poll document status while processing.
  useEffect(() => {
    if (phase.kind !== 'processing') return;
    const { documentId, filename } = phase;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      try {
        const doc = await api.getDocumentStatus(documentId);
        if (cancelled) return;

        if (doc.status === 'completed') {
          // Attempt to create conversation immediately, if it fails, oh well
          let convId = documentId; // Fallback to document ID if creation fails or isn't needed
          try {
            const conv = await api.createConversation(documentId);
            convId = conv.id;
          } catch(e) {
            console.log("Could not create conversation immediately or endpoint removed", e);
          }
          
          if (cancelled) return;
          saveSession({ documentId, conversationId: convId, filename });

          // Append to history.
          setHistory((prev) => {
            const next = [
              { documentId, conversationId: convId, filename, createdAt: Date.now() },
              ...prev.filter((h) => h.conversationId !== convId),
            ];
            saveHistory(next);
            return next;
          });

          setPhase({
            kind: 'ready',
            documentId,
            conversationId: convId,
            filename,
          });
          setMessages([welcomeMessage(filename)]);
          return;
        }

        if (doc.status === 'failed') {
          setPhase({
            kind: 'failed',
            message: "We couldn't read that file. It may be corrupted or unsupported.",
          });
          return;
        }

        timer = setTimeout(tick, 2200);
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof ApiError ? err.message : 'Something went wrong while processing.';
        setPhase({ kind: 'failed', message });
      }
    };

    timer = setTimeout(tick, 800);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [phase]);

  // Fetch dynamic suggestions when the chat is ready but empty
  useEffect(() => {
    if (phase.kind === 'ready' && messages.length <= 1) {
      let cancelled = false;
      api.getSuggestions(phase.documentId)
        .then((res) => {
          if (!cancelled) setSuggestions(res.questions);
        })
        .catch(() => {
          if (!cancelled) {
            setSuggestions([
              'Summarize this document in five bullet points',
              'What are the key dates or numbers mentioned?',
              'List the main arguments or findings',
              'Explain the most important section in plain language',
              'Are there any risks, caveats, or open questions?',
            ]);
          }
        });
      return () => {
        cancelled = true;
      };
    }
  }, [phase, messages.length]);

  const handleUpload = useCallback(async (files: File[]) => {
    setPhase({ kind: 'uploading' });
    try {
      const res = await api.uploadDocument(files);
      if (res.data && res.data.length > 0) {
        // Just track the first document ID for status polling, or if they uploaded multiple, we track the first one
        // Ideally we'd poll all, but this works for demo
        const doc = res.data[0];
        setPhase({
          kind: 'processing',
          documentId: doc.document_id,
          filename: res.data.map(d => d.filename).join(', '),
        });
      } else {
        throw new Error('No document returned');
      }
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : 'Failed to upload. Make sure the server is running.';
      setPhase({ kind: 'failed', message });
    }
  }, []);

  const handleNewChat = useCallback(() => {
    clearSession();
    setMessages([]);
    setInput('');
    setIsResponding(false);
    setSidebarOpen(false);
    setPhase({ kind: 'idle' });
    setExtractedData(null);
    setAuditReport(null);
    setSuggestions([]);
  }, []);

  const handleSelectHistory = useCallback(async (item: HistoryItem) => {
    setSidebarOpen(false);
    setRestoring(true);
    try {
      const conv = await api.getConversation(item.conversationId);
      saveSession({
        documentId: item.documentId,
        conversationId: item.conversationId,
        filename: item.filename,
      });
      setPhase({
        kind: 'ready',
        documentId: item.documentId,
        conversationId: item.conversationId,
        filename: item.filename,
      });
      const restored = adaptServerMessages(conv.messages);
      setMessages(restored.length > 0 ? restored : [welcomeMessage(item.filename)]);
    } catch {
      setHistory((prev) => {
        const next = prev.filter((h) => h.conversationId !== item.conversationId);
        saveHistory(next);
        return next;
      });
      setPhase({
        kind: 'failed',
        message: "That chat is no longer available on the server.",
      });
    } finally {
      setRestoring(false);
    }
  }, []);

  const handleDeleteHistory = useCallback(
    (conversationId: string) => {
      setHistory((prev) => {
        const next = prev.filter((h) => h.conversationId !== conversationId);
        saveHistory(next);
        return next;
      });
      if (phase.kind === 'ready' && phase.conversationId === conversationId) {
        handleNewChat();
      }
    },
    [phase, handleNewChat]
  );

  const handleSend = useCallback(
    async (overrideText?: string) => {
      if (phase.kind !== 'ready') return;
      const text = (overrideText ?? input).trim();
      if (!text) return;

      const userMsg: UiMessage = {
        id: `u-${Date.now()}`,
        role: 'user',
        content: text,
      };
      const pendingId = `a-${Date.now()}`;
      const pendingMsg: UiMessage = {
        id: pendingId,
        role: 'assistant',
        content: '',
        pending: true,
      };

      setMessages((m) => [...m, userMsg, pendingMsg]);
      setInput('');
      setIsResponding(true);

      try {
        const res = await api.ask(phase.documentId, text);
        const cleanAnswer = res.answer.replace(/\[Doc:.*?\]/g, '').replace(/ +/g, ' ').trim();
        setMessages((m) =>
          m.map((msg) =>
            msg.id === pendingId
              ? {
                  ...msg,
                  content: cleanAnswer + (res.citations && res.citations.length > 0 ? `\n\n**Sources:** ${res.citations.map(c => `[Doc ${c.document_id.substring(0, 4)} Page ${c.page || c.chunk_index || 'N/A'}]`).join(', ')}` : ''),
                  pending: false,
                  followUps: Array.isArray(res.follow_ups) ? res.follow_ups : [],
                }
              : msg
          )
        );
      } catch (err) {
        const message =
          err instanceof ApiError
            ? err.message
            : 'I ran into an error generating a response. Please try again.';
        setMessages((m) =>
          m.map((msg) =>
            msg.id === pendingId
              ? { ...msg, content: message, pending: false, error: true }
              : msg
          )
        );
      } finally {
        setIsResponding(false);
      }
    },
    [input, phase]
  );

  const handleExtract = useCallback(async () => {
    if (phase.kind !== 'ready') return;
    setIsExtracting(true);
    try {
      const res = await api.extractMetadata(phase.documentId);
      setExtractedData(res.extracted_data);
    } catch (err) {
      console.error("Extraction failed", err);
    } finally {
      setIsExtracting(false);
    }
  }, [phase]);

  const handleAudit = useCallback(async () => {
    if (phase.kind !== 'ready') return;
    setIsAuditing(true);
    try {
      const res = await api.auditDocument(phase.documentId);
      setAuditReport(res.audit_report);
    } catch (err) {
      console.error("Audit failed", err);
    } finally {
      setIsAuditing(false);
    }
  }, [phase]);

  const isReady = phase.kind === 'ready';
  const filename = phase.kind === 'ready' || phase.kind === 'processing' ? phase.filename : undefined;
  const activeConversationId = phase.kind === 'ready' ? phase.conversationId : undefined;

  return (
    <div className={`app ${sidebarOpen ? 'sidebar-open' : ''}`}>
      <Sidebar
        history={history}
        activeConversationId={activeConversationId}
        onSelect={handleSelectHistory}
        onNew={handleNewChat}
        onDelete={handleDeleteHistory}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="app-shell">
        <Header
          filename={isReady ? filename : undefined}
          onNewDocument={handleNewChat}
          showNewButton={phase.kind !== 'idle' && phase.kind !== 'uploading'}
          onToggleSidebar={() => setSidebarOpen((o) => !o)}
          sidebarOpen={sidebarOpen}
          onExtract={isReady ? handleExtract : undefined}
          onAudit={isReady ? handleAudit : undefined}
          isExtracting={isExtracting}
          isAuditing={isAuditing}
        />

        <main className="app-main">
          {restoring ? (
            <div className="boot-screen" aria-busy="true">
              <span className="boot-spinner" />
            </div>
          ) : isReady ? (
            <ChatView
              messages={messages}
              isResponding={isResponding}
              onSuggestion={(t) => handleSend(t)}
              filename={filename}
              suggestions={suggestions}
            />
          ) : (
            <UploadView
              phase={
                phase.kind === 'processing'
                  ? { kind: 'processing', filename: phase.filename }
                  : phase.kind === 'failed'
                    ? { kind: 'failed', message: phase.message }
                    : phase.kind === 'uploading'
                      ? { kind: 'uploading' }
                      : { kind: 'idle' }
              }
              onUpload={handleUpload}
              onRetry={handleNewChat}
            />
          )}
        </main>

        {isReady && (
          <Composer
            value={input}
            onChange={setInput}
            onSubmit={() => handleSend()}
            disabled={isResponding}
            isResponding={isResponding}
          />
        )}
      </div>

      <Modal
        title="Extracted Metadata"
        isOpen={!!extractedData}
        onClose={() => setExtractedData(null)}
      >
        <div className="json-display">
          {extractedData && JSON.stringify(extractedData, null, 2)}
        </div>
      </Modal>

      <Modal
        title="Risk Audit Report"
        isOpen={!!auditReport}
        onClose={() => setAuditReport(null)}
      >
        <div className="json-display">
          {auditReport && JSON.stringify(auditReport, null, 2)}
        </div>
      </Modal>

    </div>
  );
}
