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
  initial_capital?: number;
  min_composite_score?: number;
  // Scanner settings
  max_candidates?: number;
  max_expert_stocks?: number;
  // Critic settings
  critic_check_dissent?: boolean;
  critic_check_variant?: boolean;
  // Data gate settings
  dart_per_required?: boolean;
  // Execution settings
  max_buy_qty?: number;
  sector_max_pct?: number;
  // Confidence calibration
  calibration_ceiling?: number;
  // Hold time gate
  min_hold_minutes?: number;
  // Multi-factor weights
  weight_rr_ratio?: number;
  weight_expert_consensus?: number;
  weight_fundamental?: number;
  weight_technical?: number;
  weight_institutional?: number;
  // ATR dynamic stop-loss
  atr_stop_loss_multiplier_short?: number;
  atr_stop_loss_multiplier_long?: number;
  position_reeval_enabled?: boolean;
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
  stop_loss_pct?: number;
  stop_loss_source?: 'auto' | 'manual' | 'global';
  investment_horizon?: 'short' | 'long' | null;
  reeval_status?: 'hold' | 'caution' | 'sell' | null;
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
  fill_price?: number | null;
  fill_quantity?: number | null;
  signal_id?: number | null;
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
  metadata?: Record<string, unknown>;
  investment_horizon?: 'short' | 'long' | null;
  atr_stop_loss_pct?: number | null;
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

export type AppView = 'settings' | 'dashboard' | 'agents' | 'reports' | 'stockinfo';

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

export interface PerformanceData {
  returns_pct: number;
  max_drawdown: number;
  trade_count: number;
  chart_data: Array<{ timestamp: string; total_value: number; total_pnl: number; total_pnl_pct: number }>;
}

export interface PortfolioSnapshot {
  timestamp: string;
  total_value: number;
  total_pnl: number;
  total_pnl_pct: number;
}

// ── Stock Info / Research types ──────────────────────────────────────

export interface StockPrice {
  stck_prpr: string;       // 현재가
  prdy_vrss: string;       // 전일대비
  prdy_ctrt: string;       // 전일대비율
  stck_oprc: string;       // 시가
  stck_hgpr: string;       // 고가
  stck_lwpr: string;       // 저가
  acml_vol: string;        // 누적거래량
  [key: string]: unknown;
}

export interface TechnicalIndicators {
  rsi: number | null;
  macd: { macd: number; signal: number; histogram: number; cross: string } | null;
  bollinger: { upper: number; middle: number; lower: number; bandwidth: number; position: string } | null;
  ma: { ma20: number | null; ma50: number | null; ma200: number | null };
  volume_trend_pct: number | null;
}

export interface StockAnalysis {
  chart: Record<string, string>[];
  technicals: TechnicalIndicators | null;
  fundamentals: DartFundamentals | null;
  confidence_grades: Record<string, string>;
  investor_trend: { foreign_net_buy: number; institution_net_buy: number; days?: number };
  insider_trades: InsiderTrade[];
  dcf: DCFResult | null;
}

export interface InsiderTrade {
  reporter_name: string;
  position: string;
  change_type: string;
  shares_before: number;
  shares_after: number;
  change_amount: number;
  report_date: string;
}

export interface DCFResult {
  fair_value: number;
  enterprise_value?: number;
  assumptions?: { wacc: number; growth_rate: number; terminal_growth: number };
  projected_fcf?: number[];
  sensitivity?: number[][];
  cash_flow_data?: Record<string, unknown>;
}

export interface StockNews {
  news: { headlines: string[]; sentiment: string; summary?: string; source?: string };
  disclosures: { stock_code?: string; event_type: string; event_date: string; description: string; source: string }[];
}

export interface MarketRanks {
  volume_rank: RankItem[];
  fluctuation_rank: RankItem[];
}

export interface RankItem {
  [key: string]: unknown;
}

export interface SearchResult {
  stock_code: string;
  stock_name: string;
  market: string;
}
