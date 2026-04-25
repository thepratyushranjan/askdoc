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
  uploadDocument(file: File): Promise<DocumentResponse> {
    const formData = new FormData();
    formData.append('file', file);
    return request<DocumentResponse>('/documents/upload', {
      method: 'POST',
      body: formData,
    });
  },

  getDocument(id: string): Promise<DocumentResponse> {
    return request<DocumentResponse>(`/documents/${id}`);
  },

  createConversation(documentId: string): Promise<ConversationResponse> {
    return request<ConversationResponse>(`/chat/conversations/${documentId}`, {
      method: 'POST',
    });
  },

  getConversation(id: string): Promise<ConversationResponse> {
    return request<ConversationResponse>(`/chat/conversations/${id}`);
  },

  ask(conversationId: string, message: string): Promise<AskResponse> {
    return request<AskResponse>(`/chat/conversations/${conversationId}/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    });
  },
};
