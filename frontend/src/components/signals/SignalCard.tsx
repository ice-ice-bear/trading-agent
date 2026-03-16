// frontend/src/components/signals/SignalCard.tsx
import React from 'react';
import { Signal } from '../../types';
import { ScenarioChart } from './ScenarioChart';
import { FundamentalsKPI } from './FundamentalsKPI';

interface SignalCardProps {
  signal: Signal;
  onApprove?: (id: number) => void;
  onReject?: (id: number) => void;
  acting?: boolean;
}

const directionColor = (d: string) =>
  d === 'buy' ? '#28a745' : d === 'sell' ? '#dc3545' : '#6c757d';

export const SignalCard: React.FC<SignalCardProps> = ({ signal, onApprove, onReject, acting }) => {
  const {
    stock_name, stock_code, direction, rr_score, scenarios,
    variant_view, expert_stances, critic_result,
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
    <div style={{ border: '1px solid #dee2e6', borderRadius: 8, padding: 12, marginBottom: 12 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <strong>{stock_name}</strong>
          <span style={{ color: '#888', marginLeft: 6, fontSize: 12 }}>({stock_code})</span>
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
                <div style={{ fontSize: 10, color: '#555' }}>
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
          <span style={{ fontSize: 10, fontWeight: 700, color: '#007bff' }}>시장 오해: </span>
          {variant_view}
        </div>
      )}

      {/* Expert panel */}
      {expert_stances && (
        <div className="expert-panel">
          {Object.entries(expert_stances).map(([name, stance]) => (
            <span className={`expert-chip stance-${stance}`} key={name}>
              {name}
            </span>
          ))}
        </div>
      )}

      {/* DART KPI tiles */}
      {dart_fundamentals && confidence_grades && (
        <FundamentalsKPI
          dartFundamentals={dart_fundamentals}
          confidenceGrades={confidence_grades}
        />
      )}

      {/* Footer: critic + approve/reject */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
        <div style={{ display: 'flex', gap: 12, fontSize: 11, color: '#888' }}>
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
