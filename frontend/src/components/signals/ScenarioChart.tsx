// frontend/src/components/signals/ScenarioChart.tsx
import React from 'react';
import type { Scenario } from '../../types';

interface ScenarioChartProps {
  currentPrice: number;
  bull: Scenario;
  base: Scenario;
  bear: Scenario;
}

export const ScenarioChart: React.FC<ScenarioChartProps> = ({
  currentPrice, bull, base, bear,
}) => {
  const minPrice = bear.price_target * 0.95;
  const maxPrice = bull.price_target * 1.05;
  const range = maxPrice - minPrice;

  const toX = (price: number): number =>
    range > 0 ? ((price - minPrice) / range) * 100 : 50;

  const currentX = toX(currentPrice);
  const bullX = toX(bull.price_target);
  const baseX = toX(base.price_target);
  const bearX = toX(bear.price_target);

  const fmt = (n: number) => n.toLocaleString('ko-KR') + '원';

  return (
    <div className="scenario-chart-wrapper">
      <svg viewBox="0 0 100 20" preserveAspectRatio="xMidYMid meet"
           style={{ width: '100%', height: 32, display: 'block' }}>
        {/* Track */}
        <line x1="0" y1="10" x2="100" y2="10" stroke="var(--color-border)" strokeWidth="0.4" />
        {/* Range bar */}
        <line x1={bearX} y1="10" x2={bullX} y2="10" stroke="var(--color-border)" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
        {/* Current price marker */}
        <line x1={currentX} y1="3" x2={currentX} y2="17"
              stroke="var(--color-text)" strokeWidth="0.6" strokeDasharray="1.5,1" />
        {/* Points */}
        <circle cx={bearX} cy="10" r="2.5" fill="#dc3545" />
        <circle cx={baseX} cy="10" r="2" fill="#6c757d" />
        <circle cx={bullX} cy="10" r="2.5" fill="#16a34a" />
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--color-text-secondary)', marginTop: 2 }}>
        <span style={{ color: '#dc3545' }}>약세 {fmt(bear.price_target)}</span>
        <span style={{ color: 'var(--color-text)', fontWeight: 600, fontSize: 10 }}>현재 {fmt(currentPrice)}</span>
        <span style={{ color: '#16a34a' }}>강세 {fmt(bull.price_target)}</span>
      </div>
    </div>
  );
};
