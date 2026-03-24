interface DCFData {
  fair_value: number;
  current_price: number;
  upside_pct: number | null;
}

export default function ValuationView({ dcf }: { dcf: DCFData }) {
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
    </div>
  );
}
