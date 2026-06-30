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

export interface AskResponse {
  answer: string;
  follow_ups?: string[];
  citations?: any[];
}

export interface SuggestResponse {
  document_id: string;
  questions: string[];
}

export interface ExtractionResponse {
  document_id: string;
  extracted_data: any;
}

export interface AuditResponse {
  document_id: string;
  audit_report: any;
}

export interface IngestResponse {
  message: string;
  data: { document_id: string; filename: string; status: DocumentStatus }[];
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

  createConversation(documentId: string): Promise<ConversationResponse> {
    return request<ConversationResponse>(`/chat/conversations/${documentId}`, {
      method: 'POST',
    });
  },

  getConversation(id: string): Promise<ConversationResponse> {
    return request<ConversationResponse>(`/chat/conversations/${id}`);
  },

  ask(documentId: string, message: string): Promise<AskResponse> {
    return request<AskResponse>(`/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: message, document_ids: [documentId] }),
    });
  },

  async askStream(documentId: string, message: string, onUpdate: (chunk: string) => void): Promise<void> {
    const url = `${BASE}/ask/stream?query=${encodeURIComponent(message)}&document_ids=${encodeURIComponent(documentId)}`;
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
            if (dataStr === '[DONE]') {
              return;
            }
            if (dataStr) {
              try {
                const parsed = JSON.parse(dataStr);
                if (parsed.text) {
                  onUpdate(parsed.text);
                }
              } catch (e) {
                // ignore parse error
              }
            }
          }
        }
      }
    }
  },

  getSuggestions(documentId: string): Promise<SuggestResponse> {
    return request<SuggestResponse>(`/suggest/${documentId}`);
  },
};
