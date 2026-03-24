import { useState, useEffect } from 'react';

interface RiskData {
  var_95: number;
  var_99: number;
  portfolio_beta: number;
  sector_breakdown: Record<string, number>;
  total_value: number;
  correlation?: { codes: string[]; matrix: number[][] };
}

export default function RiskDashboard() {
  const [risk, setRisk] = useState<RiskData | null>(null);

  useEffect(() => {
    fetch('/api/dashboard/risk-analysis')
      .then(r => r.json())
      .then(setRisk)
      .catch(() => {});
  }, []);

  if (!risk || risk.total_value === 0) return null;

  return (
    <div className="card">
      <div className="card-header"><h3>리스크 분석</h3></div>
      <div className="card-body">
        <div style={{ display: 'flex', gap: '16px', fontSize: '0.85rem', marginBottom: '12px' }}>
          <div>
            <span className="text-muted">VaR(95%) </span>
            <strong style={{ color: 'var(--color-negative, #ef4444)' }}>{risk.var_95.toFixed(2)}%</strong>
          </div>
          <div>
            <span className="text-muted">VaR(99%) </span>
            <strong style={{ color: 'var(--color-negative, #ef4444)' }}>{risk.var_99.toFixed(2)}%</strong>
          </div>
          <div>
            <span className="text-muted">베타 </span>
            <strong>{risk.portfolio_beta.toFixed(2)}</strong>
          </div>
        </div>
        {Object.keys(risk.sector_breakdown).length > 0 && (
          <div>
            <span className="text-muted" style={{ fontSize: '0.8rem' }}>섹터 비중</span>
            {Object.entries(risk.sector_breakdown)
              .sort(([, a], [, b]) => b - a)
              .map(([sector, pct]) => (
                <div key={sector} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', padding: '2px 0' }}>
                  <span>{sector}</span>
                  <span style={{ color: pct > 40 ? 'var(--color-negative, #ef4444)' : undefined }}>{pct.toFixed(1)}%</span>
                </div>
              ))}
          </div>
        )}
        {risk.correlation && risk.correlation.matrix.length > 0 && (
          <div style={{ marginTop: '12px' }}>
            <span className="text-muted" style={{ fontSize: '0.8rem' }}>종목 상관관계</span>
            <table style={{ width: '100%', fontSize: '0.65rem', marginTop: '4px', borderCollapse: 'collapse', textAlign: 'center' }}>
              <thead>
                <tr>
                  <th style={{ padding: '2px', textAlign: 'left' }}></th>
                  {risk.correlation.codes.map(c => (
                    <th key={c} style={{ padding: '2px', fontWeight: 400 }}>{c.slice(-4)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {risk.correlation.matrix.map((row, i) => (
                  <tr key={i}>
                    <td style={{ textAlign: 'left', fontWeight: 600, padding: '2px' }}>{risk.correlation!.codes[i].slice(-4)}</td>
                    {row.map((val, j) => {
                      const absVal = Math.abs(val);
                      const bg = i === j ? 'transparent'
                        : val > 0.5 ? `rgba(239, 68, 68, ${absVal * 0.4})`
                        : val < -0.3 ? `rgba(34, 197, 94, ${absVal * 0.4})`
                        : 'transparent';
                      return (
                        <td key={j} style={{ padding: '2px', background: bg, borderRadius: '2px' }}>
                          {i === j ? '-' : val.toFixed(2)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
