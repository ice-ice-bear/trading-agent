import { StockNews } from '../../types';
import SectionSkeleton from './SectionSkeleton';

interface NewsDisclosureSectionProps {
  newsData: StockNews | null;
  loading: boolean;
  error?: string | null;
  onRetry?: () => void;
}

function sentimentBadge(sentiment: string) {
  const map: Record<string, { label: string; cls: string }> = {
    positive: { label: '긍정', cls: 'badge-positive' },
    negative: { label: '부정', cls: 'badge-negative' },
    neutral: { label: '중립', cls: 'badge-neutral' },
  };
  const s = map[sentiment] || map.neutral;
  return <span className={`news-badge ${s.cls}`}>{s.label}</span>;
}

export default function NewsDisclosureSection({ newsData, loading, error, onRetry }: NewsDisclosureSectionProps) {
  const headlines = newsData?.news?.headlines ?? [];
  const sentiment = newsData?.news?.sentiment ?? 'neutral';
  const disclosures = newsData?.disclosures ?? [];

  return (
    <SectionSkeleton title="📰 뉴스 & 공시" loading={loading} error={error} onRetry={onRetry}>
      <div className="news-disclosure-container">
        <div className="news-list">
          <div className="news-sentiment-header">
            종합 감성: {sentimentBadge(sentiment)}
          </div>
          {headlines.length > 0 ? (
            headlines.map((title, i) => (
              <div className="news-item" key={i}>{title}</div>
            ))
          ) : (
            <div className="text-muted">뉴스 없음</div>
          )}
        </div>
        {disclosures.length > 0 && (
          <div className="disclosure-list">
            <div className="disclosure-header">DART 공시</div>
            {disclosures.map((d, i) => (
              <div className="disclosure-item" key={i}>
                <span className="disclosure-date">{d.event_date}</span>
                <span className="disclosure-desc">{d.description}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </SectionSkeleton>
  );
}
