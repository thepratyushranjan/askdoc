export type DocumentStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface DocumentResponse {
  id: string;
  filename: string;
  status: DocumentStatus;
  created_at: string;
}

export interface ServerMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at?: string;
}

export interface ConversationResponse {
  id: string;
  document_id: string;
  created_at: string;
  messages: ServerMessage[];
}

// Matches backend schemas/ask.py → AskResponse
export interface Citation {
  doc_id: string;
  chunk_index: number;
}

export interface AskResponse {
  answer: string;
  citations: Citation[];
}

// Matches backend schemas/chat.py → ChatResponse
export interface ChatAskResponse {
  answer: string;
  follow_ups: string[];
}

// Matches backend schemas/document.py → ExtractedData
export interface LiabilityCap {
  value: number | null;
  currency: string | null;
}

export interface ExtractedData {
  parties: string[];
  effective_date: string | null;
  term: string | null;
  governing_law: string | null;
  payment_terms: string | null;
  termination: string | null;
  auto_renewal: boolean;
  confidentiality: boolean;
  indemnity: string | null;
  liability_cap: LiabilityCap | null;
  signatories: string[];
}

export interface ExtractionResponse {
  document_id: string;
  extracted_data: ExtractedData;
}

// Matches backend schemas/document.py → AuditReport
export interface AuditFinding {
  clause_type: string;
  severity: string;
  evidence: string;
  explanation: string;
}

export interface AuditReport {
  findings: AuditFinding[];
}

export interface AuditResponse {
  document_id: string;
  audit_report: AuditReport;
}

export interface IngestResponse {
  message: string;
  data: { document_id: string; filename: string; status: DocumentStatus }[];
}

// Matches backend endpoints/system.py
export interface HealthStatus {
  status: string;
  services: {
    postgres: string;
    pgvector: string;
    redis: string;
  };
  uptime_seconds: number;
}

export interface MetricsResponse {
  http_requests_total: number;
  http_request_duration_seconds: number;
  failures: number;
  llm_token_usage: number;
  uptime_seconds: number;
}

export type WebhookEvent = 'ingestion.completed' | 'ingestion.failed' | 'extraction.completed' | 'audit.completed';

export interface WebhookCreate {
  url: string;
  event: WebhookEvent;
  secret?: string;
}

export interface WebhookResponse {
  id: string;
  url: string;
  event: WebhookEvent;
  is_active: boolean;
  created_at: string;
}

export interface WebhookListResponse {
  webhooks: WebhookResponse[];
}

const BASE = '/api/v1';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, init);
  } catch {
    throw new ApiError("Can't reach the server. Check your connection.", 0);
  }

  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (data?.detail) detail = typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail);
    } catch {
      /* ignore */
    }
    throw new ApiError(detail, res.status);
  }
  return res.json() as Promise<T>;
}

export const api = {
  /* ── Ingestion ── */

  uploadDocument(files: File[]): Promise<IngestResponse> {
    const formData = new FormData();
    files.forEach(f => formData.append('files', f));
    return request<IngestResponse>('/ingest', {
      method: 'POST',
      body: formData,
    });
  },

  getDocumentStatus(id: string): Promise<{ document_id: string; status: DocumentStatus; ready_for_extraction: boolean }> {
    return request<{ document_id: string; status: DocumentStatus; ready_for_extraction: boolean }>(`/ingest/status/${id}`);
  },

  /* ── Extraction & Audit ── */

  extractMetadata(documentId: string): Promise<ExtractionResponse> {
    return request<ExtractionResponse>('/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ document_id: documentId }),
    });
  },

  auditDocument(documentId: string): Promise<AuditResponse> {
    return request<AuditResponse>('/audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ document_id: documentId }),
    });
  },

  /* ── Conversations ── */

  createConversation(documentId: string): Promise<ConversationResponse> {
    return request<ConversationResponse>(`/chat/conversations/${documentId}`, {
      method: 'POST',
    });
  },

  getConversation(id: string): Promise<ConversationResponse> {
    return request<ConversationResponse>(`/chat/conversations/${id}`);
  },

  /** Conversation-aware Q&A — persists messages to DB and returns follow-ups */
  askConversation(conversationId: string, message: string): Promise<ChatAskResponse> {
    return request<ChatAskResponse>(`/chat/conversations/${conversationId}/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    });
  },

  /** Stateless RAG Q&A — does NOT persist to conversation history */
  ask(documentId: string, message: string): Promise<AskResponse> {
    return request<AskResponse>('/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: message, document_ids: [documentId] }),
    });
  },

  /** Streaming stateless Q&A (SSE) */
  async askStream(documentIds: string[], message: string, onUpdate: (chunk: string) => void): Promise<void> {
    // FastAPI expects repeated query params for List types
    const params = new URLSearchParams();
    params.set('query', message);
    documentIds.forEach(id => params.append('document_ids', id));

    const url = `${BASE}/ask/stream?${params.toString()}`;
    const res = await fetch(url, { headers: { accept: 'text/event-stream' } });
    if (!res.ok) throw new ApiError(`Request failed (${res.status})`, res.status);
    if (!res.body) throw new Error('ReadableStream not supported');

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let done = false;

    while (!done) {
      const { value, done: readerDone } = await reader.read();
      done = readerDone;
      if (value) {
        const chunkStr = decoder.decode(value, { stream: true });
        const lines = chunkStr.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.replace('data: ', '').trim();
            if (dataStr === '[DONE]') return;
            if (dataStr) {
              try {
                const parsed = JSON.parse(dataStr);
                if (parsed.text) onUpdate(parsed.text);
              } catch {
                /* ignore parse error */
              }
            }
          }
        }
      }
    }
  },

  /* ── System / Observability ── */

  getHealth(): Promise<HealthStatus> {
    return request<HealthStatus>('/healthz');
  },

  getMetrics(): Promise<MetricsResponse> {
    return request<MetricsResponse>('/metrics');
  },

  /* ── Webhooks ── */

  getWebhooks(): Promise<WebhookListResponse> {
    return request<WebhookListResponse>('/webhooks');
  },

  createWebhook(payload: WebhookCreate): Promise<WebhookResponse> {
    return request<WebhookResponse>('/webhooks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  },

  deleteWebhook(id: string): Promise<void> {
    return request<void>(`/webhooks/${id}`, {
      method: 'DELETE',
    });
  },
};
