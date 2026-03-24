// frontend/src/components/signals/SignalCard.tsx
import React, { useState } from 'react';
import type { Signal } from '../../types';
import { ScenarioChart } from './ScenarioChart';
import { FundamentalsKPI } from './FundamentalsKPI';
import PeerComparison from './PeerComparison';
import ValuationView from './ValuationView';

interface InvestorTrend {
  foreign_net_buy: number;
  institution_net_buy: number;
  foreign_holding_pct: number | null;
  days?: number;
}

interface InsiderTrade {
  reporter_name: string;
  change_amount: number;
  report_date: string;
}

interface NewsSummary {
  headlines: string[];
  sentiment: string;
  summary?: string;
}

interface PeerComparisonData {
  sector: string;
  target?: { code: string; name: string; per: number | null; pbr: number | null };
  peers: Array<{ code: string; name: string; per: number | null; pbr: number | null }>;
}

interface DCFValuation {
  fair_value: number;
  current_price: number;
  upside_pct: number | null;
  sensitivity?: (number | null)[][];
  assumptions?: { wacc: number; growth_rate: number; terminal_growth: number };
}

interface SignalMetadata {
  investor_trend?: InvestorTrend;
  insider_trades?: InsiderTrade[];
  news_summary?: NewsSummary;
  peer_comparison?: PeerComparisonData;
  dcf_valuation?: DCFValuation;
}

interface SignalCardProps {
  signal: Signal;
  onApprove?: (id: number) => void;
  onReject?: (id: number) => void;
  acting?: boolean;
  defaultExpanded?: boolean;
}

const directionColor = (d: string) =>
  d === 'buy' ? '#28a745' : d === 'sell' ? '#dc3545' : '#6c757d';

export const SignalCard: React.FC<SignalCardProps> = ({ signal, onApprove, onReject, acting, defaultExpanded }) => {
  const [expanded, setExpanded] = useState(defaultExpanded ?? false);
  const [expandedExperts, setExpandedExperts] = useState(false);
  const {
    stock_name, stock_code, direction, rr_score, scenarios,
    variant_view, critic_result,
    confidence_grades, dart_fundamentals,
  } = signal;

  const overallGrade = (() => {
    if (!confidence_grades) return undefined;
    const vals = Object.values(confidence_grades);
    if (vals.includes('D')) return 'D';
    if (vals.includes('C')) return 'C';
    if (vals.includes('B')) return 'B';
    return 'A';
  })();

  return (
    <div className="card" style={{ padding: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <strong>{stock_name}</strong>
          <span className="text-muted" style={{ marginLeft: 6, fontSize: 'var(--text-xs)' }}>({stock_code})</span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{
            background: directionColor(direction),
            color: '#fff', padding: '2px 10px',
            borderRadius: 4, fontWeight: 700, fontSize: 13,
          }}>
            {direction.toUpperCase()}
          </span>
          {rr_score != null && (
            <span style={{ fontWeight: 700 }}>R/R: {rr_score.toFixed(1)}</span>
          )}
          {overallGrade && (
            <span className={`grade-badge grade-${overallGrade.toLowerCase()}`}>
              {overallGrade}등급
            </span>
          )}
        </div>
      </div>

      {/* Scenarios */}
      {scenarios && (
        <>
          <div className="scenario-row" style={{ marginTop: 10 }}>
            {[
              { s: scenarios.bull, cls: 'scenario-bull', sign: '↑' },
              { s: scenarios.base, cls: 'scenario-base', sign: '→' },
              { s: scenarios.bear, cls: 'scenario-bear', sign: '↓' },
            ].map(({ s, cls, sign }) => (
              <div className={`scenario-card ${cls}`} key={s.label}>
                <div style={{ fontSize: 11, fontWeight: 600 }}>{s.label}</div>
                <div className="scenario-pct">
                  {sign}{Math.abs(s.upside_pct).toFixed(1)}%
                </div>
                <div className="scenario-prob">확률 {(s.probability * 100).toFixed(0)}%</div>
                <div className="text-muted" style={{ fontSize: 10 }}>
                  {s.price_target.toLocaleString('ko-KR')}원
                </div>
              </div>
            ))}
          </div>

          {signal.current_price != null && (
            <ScenarioChart
              currentPrice={signal.current_price}
              bull={scenarios.bull}
              base={scenarios.base}
              bear={scenarios.bear}
            />
          )}
        </>
      )}

      {/* Variant view */}
      {variant_view && (
        <div className="variant-view">
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-primary)' }}>시장 오해: </span>
          {variant_view}
        </div>
      )}

      {/* Expand/collapse toggle */}
      <div
        className="text-muted"
        style={{ textAlign: 'center', padding: 'var(--space-1) 0', cursor: 'pointer', fontSize: 'var(--text-xs)' }}
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? '▲ 간략히 보기' : '▼ 상세 보기'}
      </div>

      {expanded && (<>
      {/* Risk notes */}
      {signal.risk_notes && (
        <div className="signal-section">
          <span className="section-label">리스크 노트</span>
          <p className="text-muted" style={{ fontSize: 'var(--text-xs)', margin: 'var(--space-1) 0 0' }}>{signal.risk_notes}</p>
        </div>
      )}

      {/* Expert panel */}
      {signal.expert_stances && Object.keys(signal.expert_stances).length > 0 && (
        <div className="signal-section">
          <div
            className="section-header"
            style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            onClick={() => setExpandedExperts(!expandedExperts)}
          >
            <span className="section-label">전문가 패널</span>
            <span style={{ fontSize: '0.75rem' }}>{expandedExperts ? '▲' : '▼'}</span>
          </div>
          <div className="expert-chips">
            {Object.entries(signal.expert_stances).map(([name, stance]) => (
              <span key={name} className={`expert-chip stance-${stance}`} title={name}>
                {name.split(' ')[0]}
              </span>
            ))}
          </div>
          {expandedExperts && (
            <div className="expert-details" style={{ marginTop: 'var(--space-2)', fontSize: 'var(--text-xs)' }}>
              {Object.entries(signal.expert_stances).map(([name, stance]) => (
                <div key={name} style={{ padding: 'var(--space-1) 0', borderBottom: '1px solid var(--color-border-light, var(--color-border))' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <strong>{name}</strong>
                    <span className={`badge stance-${stance}`}>{stance}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 수급 동향 */}
      {(() => {
        const meta = signal.metadata as SignalMetadata | undefined;
        const trend = meta?.investor_trend;
        if (!trend) return null;
        return (
          <div className="signal-section">
            <span className="section-label">수급 동향 ({trend.days || 20}일)</span>
            <div style={{ display: 'flex', gap: 'var(--space-4)', fontSize: 'var(--text-xs)', marginTop: 'var(--space-1)' }}>
              <span className={trend.foreign_net_buy >= 0 ? 'text-positive' : 'text-negative'}>
                외국인 {trend.foreign_net_buy >= 0 ? '+' : ''}{Number(trend.foreign_net_buy).toLocaleString()}주
              </span>
              <span className={trend.institution_net_buy >= 0 ? 'text-positive' : 'text-negative'}>
                기관 {trend.institution_net_buy >= 0 ? '+' : ''}{Number(trend.institution_net_buy).toLocaleString()}주
              </span>
            </div>
          </div>
        );
      })()}

      {/* 내부자 거래 */}
      {(() => {
        const meta = signal.metadata as SignalMetadata | undefined;
        const trades = meta?.insider_trades;
        if (!trades || trades.length === 0) return null;
        return (
          <div className="signal-section">
            <span className="section-label">내부자 거래</span>
            <div style={{ fontSize: 'var(--text-xs)', marginTop: 'var(--space-1)' }}>
              {trades.map((t, i) => (
                <div key={i} className="text-muted">
                  {t.reporter_name}: <span className={t.change_amount >= 0 ? 'text-positive' : 'text-negative'}>
                    {t.change_amount >= 0 ? '+' : ''}{Number(t.change_amount).toLocaleString()}주
                  </span> ({t.report_date})
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* 뉴스 동향 */}
      {(() => {
        const meta = signal.metadata as SignalMetadata | undefined;
        const news = meta?.news_summary;
        if (!news || !news.headlines?.length) return null;
        return (
          <div className="signal-section">
            <span className="section-label">뉴스 동향 ({news.sentiment})</span>
            <ul style={{ fontSize: 'var(--text-xs)', margin: 'var(--space-1) 0 0 var(--space-4)', padding: 0 }}>
              {news.headlines.slice(0, 3).map((h, i) => (
                <li key={i} className="text-muted">{h}</li>
              ))}
            </ul>
          </div>
        );
      })()}

      {/* 피어 비교 */}
      {(() => {
        const meta = signal.metadata as SignalMetadata | undefined;
        const peerData = meta?.peer_comparison;
        if (!peerData?.sector) return null;
        return <PeerComparison data={peerData} />;
      })()}

      {/* DCF 밸류에이션 */}
      {(() => {
        const meta = signal.metadata as SignalMetadata | undefined;
        const dcf = meta?.dcf_valuation;
        if (!dcf?.fair_value) return null;
        return <ValuationView dcf={dcf} />;
      })()}

      {/* DART KPI tiles */}
      {dart_fundamentals && confidence_grades && (
        <FundamentalsKPI
          dartFundamentals={dart_fundamentals}
          confidenceGrades={confidence_grades}
        />
      )}
      </>)}

      {/* Footer: critic + approve/reject */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'var(--space-2)' }}>
        <div className="text-muted" style={{ display: 'flex', gap: 'var(--space-3)', fontSize: 'var(--text-xs)' }}>
          <span>
            Critic: {critic_result === 'pass'
              ? '✓ 통과'
              : critic_result === 'fail'
              ? '✗ 실패'
              : '—'}
          </span>
          {overallGrade && (
            <span>신뢰도: <span className={`grade-badge grade-${overallGrade.toLowerCase()}`}>{overallGrade}</span></span>
          )}
        </div>
        {signal.status === 'pending' && onApprove && onReject && (
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="signal-approve-btn" onClick={() => onApprove(signal.id)} disabled={acting}>승인</button>
            <button className="signal-reject-btn" onClick={() => onReject(signal.id)} disabled={acting}>거부</button>
          </div>
        )}
        {signal.status !== 'pending' && (
          <span className={`signal-status status-${signal.status}`}>{signal.status}</span>
        )}
      </div>
    </div>
  );
};
