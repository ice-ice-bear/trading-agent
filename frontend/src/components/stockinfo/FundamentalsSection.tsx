import { DartFundamentals } from '../../types';
import SectionSkeleton from './SectionSkeleton';

interface FundamentalsSectionProps {
  fundamentals: DartFundamentals | null;
  confidenceGrades: Record<string, string>;
  loading: boolean;
  error?: string | null;
  onRetry?: () => void;
}

const TILES = [
  { label: 'PER', field: 'dart_per' as const, format: (v: number) => `${v.toFixed(1)}x` },
  { label: 'PBR', field: 'dart_pbr' as const, format: (v: number) => `${v.toFixed(2)}x` },
  { label: 'EPS YoY', field: 'dart_eps_yoy_pct' as const, format: (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)}%` },
  { label: '부채비율', field: 'dart_debt_ratio' as const, format: (v: number) => `${v.toFixed(0)}%` },
  { label: '영업이익률', field: 'dart_operating_margin' as const, format: (v: number) => `${v.toFixed(1)}%` },
  { label: '배당수익률', field: 'dart_dividend_yield' as const, format: (v: number) => `${v.toFixed(1)}%` },
];

function gradeColor(grade: string): string {
  if (grade === 'A') return 'var(--color-success)';
  if (grade === 'B') return 'var(--color-primary)';
  if (grade === 'C') return 'var(--color-warning)';
  return 'var(--color-muted)';
}

export default function FundamentalsSection({ fundamentals, confidenceGrades, loading, error, onRetry }: FundamentalsSectionProps) {
  return (
    <SectionSkeleton title="📋 재무지표" loading={loading} error={error} onRetry={onRetry}>
      {fundamentals ? (
        <div className="fundamentals-grid">
          {TILES.map(({ label, field, format }) => {
            const val = fundamentals[field];
            const grade = confidenceGrades[field] || 'D';
            return (
              <div className="fundamental-tile" key={label}>
                <div className="fund-label">{label}</div>
                <div className="fund-value">{val != null ? format(val) : '—'}</div>
                <span className="fund-grade" style={{ color: gradeColor(grade) }}>{grade}</span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-muted">재무 데이터 없음</div>
      )}
    </SectionSkeleton>
  );
}
