import { useState, useEffect } from 'react';

interface RiskData {
  var_95: number;
  var_99: number;
  portfolio_beta: number;
  sector_breakdown: Record<string, number>;
  total_value: number;
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
      </div>
    </div>
  );
}
