export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: ToolCall[];
  isStreaming?: boolean;
  timestamp?: number;
}

export interface ToolCall {
  id: string;
  name: string;
  input?: Record<string, unknown>;
  status: 'started' | 'executing' | 'done';
  resultPreview?: string;
}

export interface Session {
  id: string;
  title: string;
  messageCount: number;
}

export interface AppSettings {
  trading_mode: 'demo' | 'real';
  claude_model: string;
  claude_max_tokens: number;
}
