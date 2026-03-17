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

export interface RiskConfig {
  stop_loss_pct: number;
  take_profit_pct: number;
  max_positions: number;
  max_position_weight_pct: number;
  max_daily_loss: number;
  signal_approval_mode: 'auto' | 'manual';
}

// Dashboard types
export interface PortfolioData {
  total_value: number;
  cash_balance: number;
  initial_capital: number;
  total_pnl: number;
  total_pnl_pct: number;
  positions: Position[];
  timestamp?: string;
}

export interface Position {
  stock_code: string;
  stock_name: string;
  quantity: number;
  avg_buy_price: number;
  current_price: number;
  market_value: number;
  unrealized_pnl: number;
  unrealized_pnl_pct: number;
}

export interface Order {
  id: number;
  timestamp: string;
  agent_id: string;
  stock_code: string;
  stock_name: string;
  side: 'buy' | 'sell';
  order_type: string;
  quantity: number;
  price: number | null;
  status: 'submitted' | 'filled' | 'rejected' | 'cancelled';
  reason?: string;
}

export interface Scenario {
  label: string;
  price_target: number;
  upside_pct: number;
  probability: number;
}

export interface DartFundamentals {
  dart_per: number | null;
  dart_pbr: number | null;
  dart_eps_yoy_pct: number | null;
  dart_debt_ratio: number | null;
  dart_operating_margin: number | null;
  dart_dividend_yield: number | null;
}

export interface Signal {
  id: number;
  timestamp: string;
  agent_id: string;
  stock_code: string;
  stock_name: string;
  direction: 'buy' | 'sell' | 'hold';
  confidence: number;
  reason?: string;
  status: 'pending' | 'approved' | 'rejected' | 'executed' | 'failed';
  risk_notes?: string;
  // New enhancement fields (optional for backward compat)
  current_price?: number;
  scenarios?: { bull: Scenario; base: Scenario; bear: Scenario };
  rr_score?: number;
  variant_view?: string;
  confidence_grades?: Record<string, string>;
  expert_stances?: Record<string, string>;
  critic_result?: string;
  dart_fundamentals?: DartFundamentals;
}

export interface Agent {
  id: string;
  name: string;
  role: string;
  status: 'idle' | 'running' | 'error' | 'disabled';
  last_run: string | null;
  config: Record<string, unknown>;
  allowed_tools: string[];
}

export interface AgentLog {
  id: number;
  timestamp: string;
  agent_id: string;
  agent_role: string;
  action: string;
  duration_ms: number;
  success: number;
  result_summary: string;
  error_message: string | null;
}

export interface AgentEvent {
  event_type: string;
  agent_id: string;
  data: Record<string, unknown>;
  timestamp: string;
}

export interface WatchlistItem {
  id: number;
  stock_code: string;
  stock_name: string;
  last_price: number | null;
  added_at: string;
}

export interface ScheduledTask {
  id: number;
  name: string;
  agent_id: string;
  cron_expression: string;
  enabled: number;
  last_run: string | null;
  last_status: string | null;
  next_run_computed?: string | null;
}

export interface Report {
  id: number;
  timestamp: string;
  report_type: 'daily' | 'weekly' | 'manual';
  period_start: string;
  period_end: string;
  title: string;
  content?: string;
  summary?: ReportSummary | null;
  agent_id: string;
}

export type AppView = 'chat' | 'settings' | 'dashboard' | 'agents' | 'reports';

// --- Report Summary types ---

export interface ReportKPIs {
  total_pnl: number;
  total_pnl_pct: number;
  trade_count: number;
  win_rate: number;
  max_drawdown_pct: number;
  signal_count: number;
  signal_approval_rate: number;
}

export interface ReportTrade {
  stock_name: string;
  side: 'buy' | 'sell';
  quantity: number;
  price: number;
  pnl?: number | null;
  timestamp: string;
}

export interface ReportSignalSummary {
  stock_name: string;
  direction: string;
  rr_score?: number | null;
  status: string;
}

export interface ReportRiskEvent {
  event_type: string;
  stock_name: string;
  detail: string;
  timestamp: string;
}

export interface ReportSummary {
  kpis: ReportKPIs;
  trades: ReportTrade[];
  signals: ReportSignalSummary[];
  risk_events: ReportRiskEvent[];
}
