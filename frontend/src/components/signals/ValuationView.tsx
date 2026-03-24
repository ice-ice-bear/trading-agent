interface DCFData {
  fair_value: number;
  current_price: number;
  upside_pct: number | null;
  sensitivity?: (number | null)[][];
  assumptions?: { wacc: number; growth_rate: number; terminal_growth: number };
}

export default function ValuationView({ dcf }: { dcf: DCFData }) {
  const wacc_labels = ['8%', '10%', '12%'];
  const growth_labels = ['2%', '3%', '5%'];

  const getCellColor = (value: number | null): string => {
    if (value === null) return 'transparent';
    const upside = dcf.current_price > 0
      ? ((value - dcf.current_price) / dcf.current_price) * 100
      : 0;
    if (upside > 20) return 'rgba(34, 197, 94, 0.25)';
    if (upside > 0) return 'rgba(34, 197, 94, 0.1)';
    if (upside > -20) return 'rgba(239, 68, 68, 0.1)';
    return 'rgba(239, 68, 68, 0.25)';
  };

  return (
    <div className="signal-section">
      <span className="section-label">DCF 적정가</span>
      <div style={{ display: 'flex', gap: '16px', fontSize: '0.8rem', marginTop: '4px' }}>
        <span>적정가 <strong>{dcf.fair_value.toLocaleString()}원</strong></span>
        <span className="text-muted">현재가 {dcf.current_price.toLocaleString()}원</span>
        {dcf.upside_pct !== null && (
          <span style={{ color: dcf.upside_pct >= 0 ? 'var(--color-positive, #22c55e)' : 'var(--color-negative, #ef4444)' }}>
            {dcf.upside_pct >= 0 ? '+' : ''}{dcf.upside_pct.toFixed(1)}%
          </span>
        )}
      </div>

      {dcf.sensitivity && dcf.sensitivity.length > 0 && (
        <div style={{ marginTop: '8px' }}>
          <span className="text-muted" style={{ fontSize: '0.7rem' }}>민감도 분석 (WACC × 성장률)</span>
          <table style={{ width: '100%', fontSize: '0.7rem', marginTop: '4px', borderCollapse: 'collapse', textAlign: 'right' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '3px 6px', borderBottom: '1px solid var(--color-border, #e5e7eb)' }}>WACC＼성장률</th>
                {growth_labels.map(g => (
                  <th key={g} style={{ padding: '3px 6px', borderBottom: '1px solid var(--color-border, #e5e7eb)' }}>{g}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dcf.sensitivity.map((row, i) => (
                <tr key={i}>
                  <td style={{ textAlign: 'left', padding: '3px 6px', fontWeight: 600 }}>{wacc_labels[i]}</td>
                  {row.map((val, j) => (
                    <td key={j} style={{
                      padding: '3px 6px',
                      background: getCellColor(val),
                      borderRadius: '2px',
                    }}>
                      {val !== null ? val.toLocaleString() : '-'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
