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

  const bearPct = `${toX(bear.price_target)}%`;
  const basePct = `${toX(base.price_target)}%`;
  const bullPct = `${toX(bull.price_target)}%`;
  const curPct  = `${toX(currentPrice)}%`;

  return (
    <div className="scenario-chart-wrapper">
      <svg viewBox="0 0 100 20" preserveAspectRatio="xMidYMid meet"
           style={{ width: '100%', height: 40, display: 'block' }}>
        <line x1="0" y1="10" x2="100" y2="10" stroke="#ddd" strokeWidth="0.5" />
        <line x1={currentX} y1="2" x2={currentX} y2="18"
              stroke="#333" strokeWidth="0.8" strokeDasharray="2,1" />
        <circle cx={bearX} cy="10" r="2" fill="#dc3545" />
        <circle cx={baseX} cy="10" r="2" fill="#6c757d" />
        <circle cx={bullX} cy="10" r="2" fill="#28a745" />
      </svg>
      <div style={{ position: 'relative', height: 16, fontSize: 10 }}>
        <span style={{ position: 'absolute', left: bearPct, transform: 'translateX(-50%)', color: '#dc3545' }}>약세</span>
        <span style={{ position: 'absolute', left: basePct, transform: 'translateX(-50%)', color: '#6c757d' }}>기본</span>
        <span style={{ position: 'absolute', left: bullPct, transform: 'translateX(-50%)', color: '#28a745' }}>강세</span>
        <span style={{ position: 'absolute', left: curPct,  transform: 'translateX(-50%)', color: '#333' }}>현재</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#888' }}>
        <span style={{ color: '#dc3545' }}>{fmt(bear.price_target)}</span>
        <span style={{ color: '#333' }}>{fmt(currentPrice)}</span>
        <span style={{ color: '#28a745' }}>{fmt(bull.price_target)}</span>
      </div>
    </div>
  );
};
