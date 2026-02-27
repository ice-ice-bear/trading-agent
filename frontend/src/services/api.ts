import { fetchEventSource } from '@microsoft/fetch-event-source';

export interface ChatCallbacks {
  onTextDelta: (text: string) => void;
  onToolStart: (toolName: string, toolId: string) => void;
  onToolExecuting: (toolName: string, toolId: string, input: Record<string, unknown>) => void;
  onToolResult: (toolName: string, toolId: string, resultPreview: string) => void;
  onDone: () => void;
  onError: (error: string) => void;
}

export async function sendMessage(
  message: string,
  sessionId: string,
  callbacks: ChatCallbacks,
  abortController: AbortController
): Promise<void> {
  await fetchEventSource('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, session_id: sessionId }),
    signal: abortController.signal,
    openWhenHidden: true,

    onmessage(ev) {
      try {
        const data = JSON.parse(ev.data);
        switch (ev.event) {
          case 'text_delta':
            callbacks.onTextDelta(data.text);
            break;
          case 'tool_start':
            callbacks.onToolStart(data.tool_name, data.tool_id);
            break;
          case 'tool_executing':
            callbacks.onToolExecuting(data.tool_name, data.tool_id, data.input);
            break;
          case 'tool_result':
            callbacks.onToolResult(data.tool_name, data.tool_id, data.result_preview);
            break;
          case 'done':
            callbacks.onDone();
            break;
          case 'error':
            callbacks.onError(data.message);
            break;
        }
      } catch {
        // ignore parse errors for empty events
      }
    },

    onerror(err) {
      callbacks.onError(String(err));
      throw err; // stop retrying
    },
  });
}

export async function checkHealth(): Promise<{
  status: string;
  mcp_connected: boolean;
  mcp_tools_count: number;
  mcp_tools: string[];
  trading_mode?: string;
  claude_model?: string;
}> {
  const res = await fetch('/health');
  return res.json();
}

export async function getSettings(): Promise<import('../types').AppSettings> {
  const res = await fetch('/api/settings');
  if (!res.ok) throw new Error(`Failed to fetch settings: ${res.status}`);
  return res.json();
}

export async function updateSettings(
  patch: Partial<import('../types').AppSettings>
): Promise<import('../types').AppSettings> {
  const res = await fetch('/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Failed to update settings');
  }
  return res.json();
}
