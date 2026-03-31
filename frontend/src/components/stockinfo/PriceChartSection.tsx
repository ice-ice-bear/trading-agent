import type { TechnicalIndicators } from '../../types';
import SectionSkeleton from './SectionSkeleton';

interface PriceChartSectionProps {
  chart: Record<string, string>[] | null;
  technicals: TechnicalIndicators | null;
  loading: boolean;
  error?: string | null;
  onRetry?: () => void;
}

export default function PriceChartSection({ chart, technicals, loading, error, onRetry }: PriceChartSectionProps) {
  return (
    <SectionSkeleton title="📈 일봉 차트 + 기술적 지표" loading={loading} error={error} onRetry={onRetry}>
      <div className="chart-container">
        {chart && chart.length > 0 ? (
          <svg viewBox={`0 0 ${chart.length * 4} 200`} className="price-chart-svg" preserveAspectRatio="none">
            {(() => {
              const closes = chart.map(r => Number(r.stck_clpr || 0));
              const min = Math.min(...closes);
              const max = Math.max(...closes);
              const range = max - min || 1;
              const points = closes.map((c, i) =>
                `${i * 4},${200 - ((c - min) / range) * 180 - 10}`
              ).join(' ');
              return <polyline points={points} fill="none" stroke="var(--color-primary)" strokeWidth="1.5" />;
            })()}
          </svg>
        ) : (
          <div className="text-muted" style={{ padding: 20, textAlign: 'center' }}>차트 데이터 없음</div>
        )}
      </div>
      {technicals && (
        <div className="technicals-row">
          <div className="tech-item">
            <span className="tech-label">RSI (14)</span>
            <span className={`tech-value ${(technicals.rsi ?? 50) > 70 ? 'negative' : (technicals.rsi ?? 50) < 30 ? 'positive' : ''}`}>
              {technicals.rsi?.toFixed(1) ?? '—'}
            </span>
          </div>
          <div className="tech-item">
            <span className="tech-label">MACD</span>
            <span className={`tech-value ${(technicals.macd?.histogram ?? 0) > 0 ? 'positive' : 'negative'}`}>
              {technicals.macd?.macd.toFixed(0) ?? '—'}
            </span>
          </div>
          <div className="tech-item">
            <span className="tech-label">볼린저</span>
            <span className="tech-value">{technicals.bollinger?.position ?? '—'}</span>
          </div>
          <div className="tech-item">
            <span className="tech-label">거래량 추세</span>
            <span className={`tech-value ${(technicals.volume_trend_pct ?? 0) > 0 ? 'positive' : 'negative'}`}>
              {technicals.volume_trend_pct != null ? `${technicals.volume_trend_pct > 0 ? '+' : ''}${technicals.volume_trend_pct}%` : '—'}
            </span>
          </div>
        </div>
      )}
    </SectionSkeleton>
  );
}
