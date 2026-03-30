import SectionSkeleton from './SectionSkeleton';

interface InvestorFlowSectionProps {
  investorTrend: { foreign_net_buy: number; institution_net_buy: number; days?: number } | null;
  loading: boolean;
  error?: string | null;
  onRetry?: () => void;
}

function formatBillion(val: number): string {
  const abs = Math.abs(val);
  if (abs >= 100000000) return `${(val / 100000000).toFixed(0)}억`;
  if (abs >= 10000) return `${(val / 10000).toFixed(0)}만`;
  return val.toLocaleString();
}

export default function InvestorFlowSection({ investorTrend, loading, error, onRetry }: InvestorFlowSectionProps) {
  return (
    <SectionSkeleton title={`📊 수급 동향 (${investorTrend?.days ?? 20}일)`} loading={loading} error={error} onRetry={onRetry}>
      {investorTrend ? (
        <div className="investor-flow-row">
          <div className="flow-item">
            <div className="flow-label">외국인</div>
            <div className={`flow-value ${investorTrend.foreign_net_buy > 0 ? 'positive' : 'negative'}`}>
              {investorTrend.foreign_net_buy > 0 ? '+' : ''}{formatBillion(investorTrend.foreign_net_buy)}주
            </div>
          </div>
          <div className="flow-item">
            <div className="flow-label">기관</div>
            <div className={`flow-value ${investorTrend.institution_net_buy > 0 ? 'positive' : 'negative'}`}>
              {investorTrend.institution_net_buy > 0 ? '+' : ''}{formatBillion(investorTrend.institution_net_buy)}주
            </div>
          </div>
        </div>
      ) : (
        <div className="text-muted">수급 데이터 없음</div>
      )}
    </SectionSkeleton>
  );
}
