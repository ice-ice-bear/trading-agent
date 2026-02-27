import { useState, useEffect } from 'react';
import type { AppSettings } from '../types';
import { checkHealth } from '../services/api';

interface Props {
  settings: AppSettings;
  onSave: (patch: Partial<AppSettings>) => Promise<AppSettings>;
  error: string | null;
  onBack: () => void;
}

const MODEL_OPTIONS = [
  { value: 'claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5', desc: '균형 잡힌 성능' },
  { value: 'claude-haiku-4-5-20250929', label: 'Claude Haiku 4.5', desc: '빠른 응답' },
  { value: 'claude-opus-4-20250514', label: 'Claude Opus 4', desc: '최고 성능' },
];

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

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  useEffect(() => {
    checkHealth().then(setHealth).catch(() => setHealth(null));
  }, []);

  const dirty =
    form.trading_mode !== settings.trading_mode ||
    form.claude_model !== settings.claude_model ||
    form.claude_max_tokens !== settings.claude_max_tokens;

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
