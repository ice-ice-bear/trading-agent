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

// --- Dashboard API ---

export async function getPortfolio(): Promise<import('../types').PortfolioData> {
  const res = await fetch('/api/dashboard/portfolio');
  if (!res.ok) throw new Error('Failed to fetch portfolio');
  return res.json();
}

export async function getPositions(): Promise<{ positions: import('../types').Position[] }> {
  const res = await fetch('/api/dashboard/positions');
  if (!res.ok) throw new Error('Failed to fetch positions');
  return res.json();
}

export async function getOrders(limit = 50): Promise<{ orders: import('../types').Order[]; total_count: number }> {
  const res = await fetch(`/api/dashboard/orders?limit=${limit}`);
  if (!res.ok) throw new Error('Failed to fetch orders');
  return res.json();
}

// --- Risk Config API ---

export async function getRiskConfig(): Promise<import('../types').RiskConfig> {
  const res = await fetch('/api/agents/risk-config');
  if (!res.ok) throw new Error('Failed to fetch risk config');
  return res.json();
}

export async function updateRiskConfig(
  patch: Partial<import('../types').RiskConfig>
): Promise<import('../types').RiskConfig> {
  const res = await fetch('/api/agents/risk-config', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Failed to update risk config');
  }
  return res.json();
}

// --- Agent API ---

export async function getAgents(): Promise<{ agents: import('../types').Agent[] }> {
  const res = await fetch('/api/agents');
  if (!res.ok) throw new Error('Failed to fetch agents');
  return res.json();
}

export async function runAgent(agentId: string): Promise<{ success: boolean; summary: string }> {
  const res = await fetch(`/api/agents/${agentId}/run`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to run agent');
  return res.json();
}

export async function enableAgent(agentId: string): Promise<void> {
  await fetch(`/api/agents/${agentId}/enable`, { method: 'POST' });
}

export async function disableAgent(agentId: string): Promise<void> {
  await fetch(`/api/agents/${agentId}/disable`, { method: 'POST' });
}

export async function getAgentLogs(agentId?: string, limit = 50): Promise<{ logs: import('../types').AgentLog[] }> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (agentId) params.set('agent_id', agentId);
  const res = await fetch(`/api/agents/logs?${params}`);
  if (!res.ok) throw new Error('Failed to fetch agent logs');
  return res.json();
}

export async function getAgentEvents(limit = 100): Promise<{ events: import('../types').AgentEvent[] }> {
  const res = await fetch(`/api/agents/events?limit=${limit}`);
  if (!res.ok) throw new Error('Failed to fetch events');
  return res.json();
}

// --- Watchlist API ---

export async function getWatchlist(): Promise<{ items: import('../types').WatchlistItem[] }> {
  const res = await fetch('/api/watchlist');
  if (!res.ok) throw new Error('Failed to fetch watchlist');
  return res.json();
}

export async function addToWatchlist(stockCode: string, stockName = ''): Promise<void> {
  await fetch('/api/watchlist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stock_code: stockCode, stock_name: stockName }),
  });
}

export async function removeFromWatchlist(stockCode: string): Promise<void> {
  await fetch(`/api/watchlist/${stockCode}`, { method: 'DELETE' });
}

// --- Signal API ---

export async function getSignals(status?: string, limit = 50): Promise<{ signals: import('../types').Signal[] }> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (status) params.set('status', status);
  const res = await fetch(`/api/signals?${params}`);
  if (!res.ok) throw new Error('Failed to fetch signals');
  return res.json();
}

export async function approveSignal(signalId: number): Promise<void> {
  const res = await fetch(`/api/signals/${signalId}/approve`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to approve signal');
}

export async function rejectSignal(signalId: number): Promise<void> {
  const res = await fetch(`/api/signals/${signalId}/reject`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to reject signal');
}

// --- Report API ---

export async function getReports(
  reportType?: string,
  limit = 20
): Promise<{ reports: import('../types').Report[] }> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (reportType) params.set('report_type', reportType);
  const res = await fetch(`/api/reports?${params}`);
  if (!res.ok) throw new Error('Failed to fetch reports');
  return res.json();
}

export async function deleteReport(reportId: number): Promise<{ success: boolean }> {
  const res = await fetch(`/api/reports/${reportId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete report');
  return res.json();
}

export async function deleteReportsBulk(
  reportType?: string,
  all = false
): Promise<{ success: boolean; deleted_count: number }> {
  const params = new URLSearchParams();
  if (all) params.set('all', 'true');
  else if (reportType) params.set('report_type', reportType);
  const res = await fetch(`/api/reports?${params}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete reports');
  return res.json();
}

export async function generateReport(
  reportType: 'daily' | 'weekly'
): Promise<{ success: boolean; summary: string; report_id?: number }> {
  const res = await fetch(`/api/reports/generate?report_type=${reportType}`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to generate report');
  return res.json();
}

export async function getReport(reportId: number): Promise<import('../types').Report> {
  const res = await fetch(`/api/reports/${reportId}`);
  if (!res.ok) throw new Error('Failed to fetch report');
  return res.json();
}

// --- Task API ---

export async function getTasks(): Promise<{ tasks: import('../types').ScheduledTask[] }> {
  const res = await fetch('/api/tasks');
  if (!res.ok) throw new Error('Failed to fetch tasks');
  return res.json();
}
