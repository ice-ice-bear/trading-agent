import { InsiderTrade } from '../../types';
import SectionSkeleton from './SectionSkeleton';

interface InsiderSectionProps {
  insiderTrades: InsiderTrade[] | null;
  loading: boolean;
  error?: string | null;
  onRetry?: () => void;
}

export default function InsiderSection({ insiderTrades, loading, error, onRetry }: InsiderSectionProps) {
  return (
    <SectionSkeleton title="👤 내부자 거래" loading={loading} error={error} onRetry={onRetry}>
      {insiderTrades && insiderTrades.length > 0 ? (
        <div className="insider-list">
          {insiderTrades.map((t, i) => (
            <div className="insider-item" key={i}>
              <span className="insider-name">{t.reporter_name} ({t.position || '임원'})</span>
              <span className={`insider-change ${t.change_amount > 0 ? 'positive' : 'negative'}`}>
                {t.change_amount > 0 ? '+' : ''}{t.change_amount.toLocaleString()}주
              </span>
              <span className="insider-date">{t.report_date}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-muted">내부자 거래 내역 없음</div>
      )}
    </SectionSkeleton>
  );
}
