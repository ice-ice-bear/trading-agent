import { DCFResult } from '../../types';
import SectionSkeleton from './SectionSkeleton';

interface ValuationSectionProps {
  dcf: DCFResult | null;
  currentPrice: number;
  loading: boolean;
  error?: string | null;
  onRetry?: () => void;
}

export default function ValuationSection({ dcf, currentPrice, loading, error, onRetry }: ValuationSectionProps) {
  const upside = dcf && currentPrice > 0 ? ((dcf.fair_value / currentPrice - 1) * 100) : null;

  return (
    <SectionSkeleton title="💰 DCF 적정가" loading={loading} error={error} onRetry={onRetry}>
      {dcf ? (
        <div className="valuation-container">
          <div className="valuation-summary">
            <span className="valuation-fair-value">₩{dcf.fair_value.toLocaleString()}</span>
            {upside != null && (
              <span className={`valuation-upside ${upside > 0 ? 'positive' : 'negative'}`}>
                {upside > 0 ? '▲' : '▼'} {Math.abs(upside).toFixed(1)}%
              </span>
            )}
          </div>
          {dcf.sensitivity && dcf.sensitivity.length > 0 && (
            <table className="sensitivity-table">
              <thead>
                <tr>
                  <th></th>
                  <th>G=2%</th>
                  <th>G=3%</th>
                  <th>G=5%</th>
                </tr>
              </thead>
              <tbody>
                {['WACC 8%', 'WACC 10%', 'WACC 12%'].map((label, ri) => (
                  <tr key={label}>
                    <td className="sensitivity-label">{label}</td>
                    {(dcf.sensitivity![ri] || []).map((val, ci) => {
                      const cellUpside = val && currentPrice > 0 ? ((val / currentPrice - 1) * 100) : 0;
                      return (
                        <td key={ci} className={cellUpside > 5 ? 'positive' : cellUpside < -5 ? 'negative' : ''}>
                          {val ? `₩${val.toLocaleString()}` : '—'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        <div className="text-muted">DCF 데이터 없음</div>
      )}
    </SectionSkeleton>
  );
}
