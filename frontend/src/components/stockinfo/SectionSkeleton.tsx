import { ReactNode } from 'react';

interface SectionSkeletonProps {
  title: string;
  loading: boolean;
  error?: string | null;
  onRetry?: () => void;
  children: ReactNode;
}

export default function SectionSkeleton({ title, loading, error, onRetry, children }: SectionSkeletonProps) {
  return (
    <div className="research-section">
      <div className="research-section-header">{title}</div>
      {loading ? (
        <div className="research-skeleton">
          <div className="skeleton-bar" style={{ width: '80%' }} />
          <div className="skeleton-bar" style={{ width: '60%' }} />
          <div className="skeleton-bar" style={{ width: '70%' }} />
        </div>
      ) : error ? (
        <div className="research-error">
          <span className="text-muted">{error}</span>
          {onRetry && <button className="retry-btn" onClick={onRetry}>재시도</button>}
        </div>
      ) : (
        children
      )}
    </div>
  );
}
