import { useState, useEffect } from 'react';
import type { AppSettings, RiskConfig } from '../types';
import { checkHealth, getRiskConfig, updateRiskConfig } from '../services/api';

interface Props {
  settings: AppSettings;
  onSave: (patch: Partial<AppSettings>) => Promise<AppSettings>;
  error: string | null;
  onBack: () => void;
}

const MODEL_OPTIONS = [
  { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', desc: '최신 최고 성능' },
  { value: 'claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5', desc: '균형 잡힌 성능' },
  { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5', desc: '빠른 응답' },
  { value: 'claude-opus-4-5-20251101', label: 'Claude Opus 4.5', desc: '고도의 추론' },
];

const DEFAULT_RISK: RiskConfig = {
  stop_loss_pct: -3.0,
  take_profit_pct: 5.0,
  max_positions: 5,
  max_position_weight_pct: 20.0,
  max_daily_loss: 500000,
  signal_approval_mode: 'manual',
  initial_capital: 10000000,
  min_rr_score: 0.3,
  max_candidates: 25,
  max_expert_stocks: 10,
  critic_check_dissent: true,
  critic_check_variant: true,
  dart_per_required: true,
  max_buy_qty: 10,
  sector_max_pct: 40.0,
  calibration_ceiling: 2.0,
  min_hold_minutes: 0,
};

export default function SettingsView({ settings, onSave, error, onBack }: Props) {
  const [form, setForm] = useState(settings);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [health, setHealth] = useState<{
    status: string;
    mcp_connected: boolean;
    mcp_tools_count: number;
    mcp_tools: string[];
  } | null>(null);

  // Risk config state
  const [riskBase, setRiskBase] = useState<RiskConfig>(DEFAULT_RISK);
  const [riskForm, setRiskForm] = useState<RiskConfig>(DEFAULT_RISK);
  const [riskSaving, setRiskSaving] = useState(false);
  const [riskSaved, setRiskSaved] = useState(false);
  const [riskError, setRiskError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  useEffect(() => {
    checkHealth().then(setHealth).catch(() => setHealth(null));
    getRiskConfig()
      .then((cfg) => {
        setRiskBase(cfg);
        setRiskForm(cfg);
      })
      .catch(() => {/* use defaults */})
      .finally(() => setLoading(false));
  }, []);

  const dirty =
    form.trading_mode !== settings.trading_mode ||
    form.claude_model !== settings.claude_model ||
    form.claude_max_tokens !== settings.claude_max_tokens;

  const riskDirty =
    riskForm.stop_loss_pct !== riskBase.stop_loss_pct ||
    riskForm.take_profit_pct !== riskBase.take_profit_pct ||
    riskForm.max_positions !== riskBase.max_positions ||
    riskForm.max_position_weight_pct !== riskBase.max_position_weight_pct ||
    riskForm.max_daily_loss !== riskBase.max_daily_loss ||
    riskForm.signal_approval_mode !== riskBase.signal_approval_mode ||
    riskForm.initial_capital !== riskBase.initial_capital ||
    riskForm.min_rr_score !== riskBase.min_rr_score ||
    riskForm.max_candidates !== riskBase.max_candidates ||
    riskForm.max_expert_stocks !== riskBase.max_expert_stocks ||
    riskForm.critic_check_dissent !== riskBase.critic_check_dissent ||
    riskForm.critic_check_variant !== riskBase.critic_check_variant ||
    riskForm.dart_per_required !== riskBase.dart_per_required ||
    riskForm.max_buy_qty !== riskBase.max_buy_qty ||
    riskForm.sector_max_pct !== riskBase.sector_max_pct ||
    riskForm.calibration_ceiling !== riskBase.calibration_ceiling ||
    riskForm.min_hold_minutes !== riskBase.min_hold_minutes;

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const patch: Partial<AppSettings> = {};
      if (form.trading_mode !== settings.trading_mode) patch.trading_mode = form.trading_mode;
      if (form.claude_model !== settings.claude_model) patch.claude_model = form.claude_model;
      if (form.claude_max_tokens !== settings.claude_max_tokens) patch.claude_max_tokens = form.claude_max_tokens;
      await onSave(patch);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // error is handled by parent via error prop
    } finally {
      setSaving(false);
    }
  };

  const handleRiskSave = async () => {
    setRiskSaving(true);
    setRiskSaved(false);
    setRiskError(null);
    try {
      const updated = await updateRiskConfig(riskForm);
      setRiskBase(updated);
      setRiskForm(updated);
      setRiskSaved(true);
      setTimeout(() => setRiskSaved(false), 2000);
    } catch (e) {
      setRiskError(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setRiskSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="settings-view">
        <div className="settings-scroll">
          <div className="settings-inner">
            <div className="settings-page-header">
              <button className="settings-back-btn" onClick={onBack}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 12H5" />
                  <path d="M12 19l-7-7 7-7" />
                </svg>
                대화로 돌아가기
              </button>
              <h1 className="settings-title">설정</h1>
              <p className="settings-subtitle">트레이딩 환경과 AI 모델을 구성합니다</p>
            </div>
            <div className="settings-loading">
              <div className="settings-skeleton-card" />
              <div className="settings-skeleton-card" />
              <div className="settings-skeleton-card settings-skeleton-card--tall" />
              <div className="settings-skeleton-card" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="settings-view">
      <div className="settings-scroll">
        <div className="settings-inner">
          {/* Header */}
          <div className="settings-page-header">
            <button className="settings-back-btn" onClick={onBack}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5" />
                <path d="M12 19l-7-7 7-7" />
              </svg>
              대화로 돌아가기
            </button>
            <h1 className="settings-title">설정</h1>
            <p className="settings-subtitle">트레이딩 환경과 AI 모델을 구성합니다</p>
          </div>

          {/* Trading Mode */}
          <section className="settings-card">
            <div className="settings-card-header">
              <div className="settings-card-icon trading-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
                  <polyline points="16 7 22 7 22 13" />
                </svg>
              </div>
              <div>
                <h2>트레이딩 모드</h2>
                <p>거래 환경을 선택합니다</p>
              </div>
            </div>
            <div className="settings-card-body">
              <div className="mode-toggle">
                <button
                  className={`mode-btn demo ${form.trading_mode === 'demo' ? 'active' : ''}`}
                  onClick={() => setForm({ ...form, trading_mode: 'demo' })}
                >
                  <span className="mode-dot demo" />
                  <div className="mode-label">
                    <strong>모의투자</strong>
                    <span>Demo</span>
                  </div>
                </button>
                <button
                  className={`mode-btn real ${form.trading_mode === 'real' ? 'active' : ''}`}
                  onClick={() => setForm({ ...form, trading_mode: 'real' })}
                >
                  <span className="mode-dot real" />
                  <div className="mode-label">
                    <strong>실전투자</strong>
                    <span>Real</span>
                  </div>
                </button>
              </div>
              {form.trading_mode === 'real' && (
                <div className="mode-warning">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  <span>실전 모드에서는 실제 자금으로 거래됩니다. KIS 실전투자 API 키가 필요합니다.</span>
                </div>
              )}
            </div>
          </section>

          {/* AI Model */}
          <section className="settings-card">
            <div className="settings-card-header">
              <div className="settings-card-icon ai-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2a4 4 0 014 4v1a1 1 0 001 1h1a4 4 0 010 8h-1a1 1 0 00-1 1v1a4 4 0 01-8 0v-1a1 1 0 00-1-1H6a4 4 0 010-8h1a1 1 0 001-1V6a4 4 0 014-4z" />
                </svg>
              </div>
              <div>
                <h2>AI 모델</h2>
                <p>Claude 모델과 응답 설정을 조정합니다</p>
              </div>
            </div>
            <div className="settings-card-body">
              <div className="setting-field">
                <label className="setting-label">모델</label>
                <div className="model-grid">
                  {MODEL_OPTIONS.map((m) => (
                    <button
                      key={m.value}
                      className={`model-option ${form.claude_model === m.value ? 'active' : ''}`}
                      onClick={() => setForm({ ...form, claude_model: m.value })}
                    >
                      <span className="model-name">{m.label}</span>
                      <span className="model-desc">{m.desc}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="setting-field">
                <label className="setting-label" htmlFor="max-tokens">최대 토큰</label>
                <div className="token-input-row">
                  <input
                    id="max-tokens"
                    type="range"
                    min={256}
                    max={32768}
                    step={256}
                    value={form.claude_max_tokens}
                    onChange={(e) =>
                      setForm({ ...form, claude_max_tokens: Number(e.target.value) })
                    }
                    className="token-slider"
                  />
                  <span className="token-value">{form.claude_max_tokens.toLocaleString()}</span>
                </div>
              </div>
            </div>
          </section>

          {/* Risk Management */}
          <section className="settings-card">
            <div className="settings-card-header">
              <div className="settings-card-icon risk-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </div>
              <div>
                <h2>리스크 관리</h2>
                <p>에이전트 매매 임계값을 설정합니다</p>
              </div>
            </div>
            <div className="settings-card-body">
              {/* Initial capital */}
              <div className="setting-field">
                <label className="setting-label">
                  초기 자본금
                  <span className="setting-hint">포트폴리오 비중 계산에 사용되는 초기 자본금</span>
                </label>
                <div className="risk-input-row">
                  <input
                    type="number"
                    value={riskForm.initial_capital ?? 10000000}
                    onChange={(e) => setRiskForm({ ...riskForm, initial_capital: Number(e.target.value) })}
                    step={1000000}
                    min={1000000}
                    max={1000000000}
                    className="risk-number-input risk-number-input--wide"
                  />
                  <span className="risk-unit">
                    {((riskForm.initial_capital ?? 10000000) / 10000).toLocaleString()}만원
                  </span>
                </div>
              </div>

              {/* Stop-loss */}
              <div className="setting-field">
                <label className="setting-label" htmlFor="stop-loss">
                  손절매 임계값
                  <span className="setting-hint">이 손실률에 도달하면 자동 매도</span>
                </label>
                <div className="risk-input-row">
                  <input
                    id="stop-loss"
                    type="number"
                    min={-20}
                    max={-0.1}
                    step={0.1}
                    value={riskForm.stop_loss_pct}
                    onChange={(e) =>
                      setRiskForm({ ...riskForm, stop_loss_pct: Number(e.target.value) })
                    }
                    className="risk-number-input"
                  />
                  <span className="risk-unit">%</span>
                </div>
              </div>

              {/* Take-profit */}
              <div className="setting-field">
                <label className="setting-label" htmlFor="take-profit">
                  익절매 임계값
                  <span className="setting-hint">이 수익률에 도달하면 자동 매도</span>
                </label>
                <div className="risk-input-row">
                  <input
                    id="take-profit"
                    type="number"
                    min={0.5}
                    max={50}
                    step={0.5}
                    value={riskForm.take_profit_pct}
                    onChange={(e) =>
                      setRiskForm({ ...riskForm, take_profit_pct: Number(e.target.value) })
                    }
                    className="risk-number-input"
                  />
                  <span className="risk-unit">%</span>
                </div>
              </div>

              {/* Max positions */}
              <div className="setting-field">
                <label className="setting-label" htmlFor="max-positions">
                  최대 보유 종목 수
                  <span className="setting-hint">동시에 보유할 수 있는 최대 종목</span>
                </label>
                <div className="token-input-row">
                  <input
                    id="max-positions"
                    type="range"
                    min={1}
                    max={20}
                    step={1}
                    value={riskForm.max_positions}
                    onChange={(e) =>
                      setRiskForm({ ...riskForm, max_positions: Number(e.target.value) })
                    }
                    className="token-slider"
                  />
                  <span className="token-value">{riskForm.max_positions}종목</span>
                </div>
              </div>

              {/* Max position weight */}
              <div className="setting-field">
                <label className="setting-label" htmlFor="max-weight">
                  종목당 최대 비중
                  <span className="setting-hint">단일 종목이 포트폴리오에서 차지할 수 있는 최대 비율</span>
                </label>
                <div className="token-input-row">
                  <input
                    id="max-weight"
                    type="range"
                    min={5}
                    max={50}
                    step={5}
                    value={riskForm.max_position_weight_pct}
                    onChange={(e) =>
                      setRiskForm({ ...riskForm, max_position_weight_pct: Number(e.target.value) })
                    }
                    className="token-slider"
                  />
                  <span className="token-value">{riskForm.max_position_weight_pct}%</span>
                </div>
              </div>

              {/* Daily loss limit */}
              <div className="setting-field">
                <label className="setting-label" htmlFor="daily-loss">
                  일일 최대 손실액
                  <span className="setting-hint">하루 손실이 이 금액을 초과하면 매수 신호 차단</span>
                </label>
                <div className="risk-input-row">
                  <input
                    id="daily-loss"
                    type="number"
                    min={10000}
                    max={5000000}
                    step={10000}
                    value={riskForm.max_daily_loss}
                    onChange={(e) =>
                      setRiskForm({ ...riskForm, max_daily_loss: Number(e.target.value) })
                    }
                    className="risk-number-input risk-number-input--wide"
                  />
                  <span className="risk-unit">원</span>
                </div>
              </div>

              {/* Signal approval mode */}
              <div className="setting-field">
                <label className="setting-label">
                  신호 승인 방식
                  <span className="setting-hint">매매 신호를 자동 실행할지, 수동으로 승인할지 설정</span>
                </label>
                <div className="mode-toggle">
                  <button
                    className={`mode-btn demo ${riskForm.signal_approval_mode === 'auto' ? 'active' : ''}`}
                    onClick={() => setRiskForm({ ...riskForm, signal_approval_mode: 'auto' })}
                  >
                    <span className="mode-dot demo" />
                    <div className="mode-label">
                      <strong>자동 실행</strong>
                      <span>Auto</span>
                    </div>
                  </button>
                  <button
                    className={`mode-btn real ${riskForm.signal_approval_mode === 'manual' ? 'active' : ''}`}
                    onClick={() => setRiskForm({ ...riskForm, signal_approval_mode: 'manual' })}
                  >
                    <span className="mode-dot real" />
                    <div className="mode-label">
                      <strong>수동 승인</strong>
                      <span>Manual</span>
                    </div>
                  </button>
                </div>
              </div>

              {/* Min R/R score */}
              <div className="setting-field">
                <label className="setting-label">
                  최소 R/R 스코어
                  <span className="setting-hint">시그널 R/R 스코어가 이 값 미만이면 자동 거부됩니다</span>
                </label>
                <div className="token-input-row">
                  <input
                    type="range"
                    min={0.1}
                    max={3.0}
                    step={0.05}
                    value={riskForm.min_rr_score ?? 0.3}
                    onChange={(e) => setRiskForm({ ...riskForm, min_rr_score: Number(e.target.value) })}
                    className="token-slider"
                  />
                  <span className="token-value">{(riskForm.min_rr_score ?? 0.3).toFixed(2)}</span>
                </div>
              </div>

              {/* Calibration ceiling */}
              <div className="setting-field">
                <label className="setting-label">
                  신뢰도 보정 기준값
                  <span className="setting-hint">이 R/R 스코어를 신뢰도 100%로 매핑합니다 (높을수록 보수적)</span>
                </label>
                <div className="token-input-row">
                  <input
                    type="range"
                    min={1.0}
                    max={5.0}
                    step={0.5}
                    value={riskForm.calibration_ceiling ?? 2.0}
                    onChange={(e) => setRiskForm({ ...riskForm, calibration_ceiling: Number(e.target.value) })}
                    className="token-slider"
                  />
                  <span className="token-value">{(riskForm.calibration_ceiling ?? 2.0).toFixed(1)}</span>
                </div>
              </div>

              {/* Sector concentration */}
              <div className="setting-field">
                <label className="setting-label">
                  섹터 최대 비중
                  <span className="setting-hint">동일 섹터 종목이 포트폴리오에서 차지할 수 있는 최대 비율</span>
                </label>
                <div className="token-input-row">
                  <input
                    type="range"
                    min={10}
                    max={80}
                    step={5}
                    value={riskForm.sector_max_pct ?? 40}
                    onChange={(e) => setRiskForm({ ...riskForm, sector_max_pct: Number(e.target.value) })}
                    className="token-slider"
                  />
                  <span className="token-value">{riskForm.sector_max_pct ?? 40}%</span>
                </div>
              </div>

              {/* Max buy quantity */}
              <div className="setting-field">
                <label className="setting-label">
                  주문당 최대 매수 수량
                  <span className="setting-hint">한 번의 매수 주문에서 매수할 최대 주식 수</span>
                </label>
                <div className="token-input-row">
                  <input
                    type="range"
                    min={1}
                    max={100}
                    step={1}
                    value={riskForm.max_buy_qty ?? 10}
                    onChange={(e) => setRiskForm({ ...riskForm, max_buy_qty: Number(e.target.value) })}
                    className="token-slider"
                  />
                  <span className="token-value">{riskForm.max_buy_qty ?? 10}주</span>
                </div>
              </div>

              {/* Min hold time */}
              <div className="setting-field">
                <label className="setting-label">
                  최소 보유 시간
                  <span className="setting-hint">매수 후 이 시간이 경과해야 매도 신호 허용 (0 = 제한 없음)</span>
                </label>
                <div className="risk-input-row">
                  <input
                    type="number"
                    value={riskForm.min_hold_minutes ?? 0}
                    onChange={(e) => setRiskForm({ ...riskForm, min_hold_minutes: Number(e.target.value) })}
                    min={0}
                    max={1440}
                    step={5}
                    className="risk-number-input"
                  />
                  <span className="risk-unit">분</span>
                </div>
              </div>
            </div>

            {/* Scanner & Critic Settings */}
            <div className="settings-card-body" style={{ borderTop: '1px solid var(--border-secondary, #e5e5e5)', paddingTop: '16px' }}>
              <div style={{ fontSize: '0.85em', fontWeight: 600, color: 'var(--text-secondary, #666)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>스캐너 설정</div>

              {/* Max candidates */}
              <div className="setting-field">
                <label className="setting-label">
                  스크리닝 후보 수
                  <span className="setting-hint">KOSPI200에서 거래량/등락률 기준으로 선별할 최대 종목 수</span>
                </label>
                <div className="token-input-row">
                  <input
                    type="range"
                    min={5}
                    max={50}
                    step={5}
                    value={riskForm.max_candidates ?? 25}
                    onChange={(e) => setRiskForm({ ...riskForm, max_candidates: Number(e.target.value) })}
                    className="token-slider"
                  />
                  <span className="token-value">{riskForm.max_candidates ?? 25}종목</span>
                </div>
              </div>

              {/* Max expert stocks */}
              <div className="setting-field">
                <label className="setting-label">
                  전문가 분석 종목 수
                  <span className="setting-hint">AI 전문가 패널이 심층 분석할 최대 종목 수 (Claude API 호출 비용에 영향)</span>
                </label>
                <div className="token-input-row">
                  <input
                    type="range"
                    min={3}
                    max={25}
                    step={1}
                    value={riskForm.max_expert_stocks ?? 10}
                    onChange={(e) => setRiskForm({ ...riskForm, max_expert_stocks: Number(e.target.value) })}
                    className="token-slider"
                  />
                  <span className="token-value">{riskForm.max_expert_stocks ?? 10}종목</span>
                </div>
              </div>

              <div style={{ fontSize: '0.85em', fontWeight: 600, color: 'var(--text-secondary, #666)', marginBottom: '12px', marginTop: '16px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>품질 게이트</div>

              {/* DART PER required */}
              <div className="setting-field">
                <label className="setting-label">
                  DART PER 필수 여부
                  <span className="setting-hint">비활성화 시 적자 기업(PER 없음)도 분석 대상에 포함됩니다</span>
                </label>
                <div className="mode-toggle">
                  <button
                    className={`mode-btn demo ${(riskForm.dart_per_required ?? true) ? 'active' : ''}`}
                    onClick={() => setRiskForm({ ...riskForm, dart_per_required: true })}
                  >
                    <span className="mode-dot demo" />
                    <div className="mode-label">
                      <strong>필수</strong>
                      <span>보수적</span>
                    </div>
                  </button>
                  <button
                    className={`mode-btn real ${!(riskForm.dart_per_required ?? true) ? 'active' : ''}`}
                    onClick={() => setRiskForm({ ...riskForm, dart_per_required: false })}
                  >
                    <span className="mode-dot real" />
                    <div className="mode-label">
                      <strong>선택</strong>
                      <span>적자기업 허용</span>
                    </div>
                  </button>
                </div>
              </div>

              {/* Critic check: dissent */}
              <div className="setting-field">
                <label className="setting-label">
                  전문가 이견 검증
                  <span className="setting-hint">비활성화 시 전문가 만장일치도 시그널로 통과합니다</span>
                </label>
                <div className="mode-toggle">
                  <button
                    className={`mode-btn demo ${(riskForm.critic_check_dissent ?? true) ? 'active' : ''}`}
                    onClick={() => setRiskForm({ ...riskForm, critic_check_dissent: true })}
                  >
                    <span className="mode-dot demo" />
                    <div className="mode-label">
                      <strong>활성</strong>
                      <span>이견 필수</span>
                    </div>
                  </button>
                  <button
                    className={`mode-btn real ${!(riskForm.critic_check_dissent ?? true) ? 'active' : ''}`}
                    onClick={() => setRiskForm({ ...riskForm, critic_check_dissent: false })}
                  >
                    <span className="mode-dot real" />
                    <div className="mode-label">
                      <strong>비활성</strong>
                      <span>만장일치 허용</span>
                    </div>
                  </button>
                </div>
              </div>

              {/* Critic check: variant view */}
              <div className="setting-field">
                <label className="setting-label">
                  Variant View 구체성 검증
                  <span className="setting-hint">비활성화 시 구체적 데이터 포인트 없이도 시그널 통과</span>
                </label>
                <div className="mode-toggle">
                  <button
                    className={`mode-btn demo ${(riskForm.critic_check_variant ?? true) ? 'active' : ''}`}
                    onClick={() => setRiskForm({ ...riskForm, critic_check_variant: true })}
                  >
                    <span className="mode-dot demo" />
                    <div className="mode-label">
                      <strong>활성</strong>
                      <span>구체성 필수</span>
                    </div>
                  </button>
                  <button
                    className={`mode-btn real ${!(riskForm.critic_check_variant ?? true) ? 'active' : ''}`}
                    onClick={() => setRiskForm({ ...riskForm, critic_check_variant: false })}
                  >
                    <span className="mode-dot real" />
                    <div className="mode-label">
                      <strong>비활성</strong>
                      <span>일반 표현 허용</span>
                    </div>
                  </button>
                </div>
              </div>
            </div>

            {/* Risk error */}
            {riskError && (
              <div className="settings-error" style={{ margin: '0 16px 8px' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
                {riskError}
              </div>
            )}

            {/* Risk save button */}
            <div className="settings-actions" style={{ paddingTop: 0, borderTop: 'none' }}>
              <button
                className={`settings-save-btn ${riskSaved ? 'saved' : ''}`}
                onClick={handleRiskSave}
                disabled={riskSaving || !riskDirty}
              >
                {riskSaving ? (
                  <span className="save-spinner" />
                ) : riskSaved ? (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    저장됨
                  </>
                ) : (
                  '리스크 설정 저장'
                )}
              </button>
            </div>
          </section>

          {/* Connection Status */}
          <section className="settings-card">
            <div className="settings-card-header">
              <div className="settings-card-icon connection-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12.55a11 11 0 0114.08 0" />
                  <path d="M1.42 9a16 16 0 0121.16 0" />
                  <path d="M8.53 16.11a6 6 0 016.95 0" />
                  <circle cx="12" cy="20" r="1" />
                </svg>
              </div>
              <div>
                <h2>연결 상태</h2>
                <p>서비스 연결 정보</p>
              </div>
            </div>
            <div className="settings-card-body">
              <div className="status-grid">
                <div className="status-row">
                  <span className="status-label">Backend</span>
                  <span className={`status-badge ${health ? 'ok' : 'fail'}`}>
                    <span className="status-pip" />
                    {health ? '연결됨' : '연결 끊김'}
                  </span>
                </div>
                <div className="status-row">
                  <span className="status-label">MCP Server</span>
                  <span className={`status-badge ${health?.mcp_connected ? 'ok' : 'fail'}`}>
                    <span className="status-pip" />
                    {health?.mcp_connected ? '연결됨' : '연결 끊김'}
                  </span>
                </div>
                {health?.mcp_tools_count != null && (
                  <div className="status-row">
                    <span className="status-label">도구</span>
                    <span className="status-tools-count">{health.mcp_tools_count}개 사용 가능</span>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Error */}
          {error && (
            <div className="settings-error">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="settings-actions">
            <button
              className={`settings-save-btn ${saved ? 'saved' : ''}`}
              onClick={handleSave}
              disabled={saving || !dirty}
            >
              {saving ? (
                <span className="save-spinner" />
              ) : saved ? (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  저장됨
                </>
              ) : (
                '변경사항 저장'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
