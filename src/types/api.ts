// src/types/index.ts
export interface AppContext {
  userId: string;
  sessionId: string;
  conversationId?: string;
  db?: any;
}

export interface ChatRequestBody {
  sessionId?: string;
  message: string;
  userId: string;
}

export interface ChatResponse {
  response: string;
  sessionId: string;
  images?: string[];
  functionCalls?: any[];
  mcpStatus: string;
  timestamp: string;
  error?: boolean;
}

export interface ServiceHealth {
  status: string;
  timestamp: string;
  services: {
    database: string;
    mcp: string;
    mcpHealthy: boolean;
  };
}
