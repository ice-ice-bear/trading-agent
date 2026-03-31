import { useState } from 'react';
import type { TechnicalIndicators } from '../../types';
import SectionSkeleton from './SectionSkeleton';

interface PriceChartSectionProps {
  chart: Record<string, string>[] | null;
  technicals: TechnicalIndicators | null;
  loading: boolean;
  error?: string | null;
  onRetry?: () => void;
}

type ChartType = 'candle' | 'line';
type OverlayKey = 'ma20' | 'ma50' | 'bb';

// Layout constants
const MARGIN = { top: 10, right: 55, bottom: 20, left: 0 };
const PRICE_H = 180;
const VOL_H = 50;
const GAP = 8;
const TOTAL_H = MARGIN.top + PRICE_H + GAP + VOL_H + MARGIN.bottom;

function formatPrice(v: number): string {
  if (v >= 1000000) return `${(v / 10000).toFixed(0)}만`;
  if (v >= 1000) return v.toLocaleString();
  return v.toString();
}

function formatDate(raw: string): string {
  // "20260331" → "03/31"
  if (raw.length === 8) return `${raw.slice(4, 6)}/${raw.slice(6, 8)}`;
  return raw;
}

export default function PriceChartSection({ chart, technicals, loading, error, onRetry }: PriceChartSectionProps) {
  const [chartType, setChartType] = useState<ChartType>('candle');
  const [overlays, setOverlays] = useState<Set<OverlayKey>>(new Set(['ma20']));

  const toggleOverlay = (key: OverlayKey) => {
    setOverlays(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  return (
    <SectionSkeleton title="📈 일봉 차트 + 기술적 지표" loading={loading} error={error} onRetry={onRetry}>
      {chart && chart.length > 0 ? (
        <>
          {/* Controls */}
          <div className="chart-controls">
            <div className="chart-type-btns">
              <button className={`chart-ctrl-btn ${chartType === 'candle' ? 'active' : ''}`} onClick={() => setChartType('candle')}>캔들</button>
              <button className={`chart-ctrl-btn ${chartType === 'line' ? 'active' : ''}`} onClick={() => setChartType('line')}>라인</button>
            </div>
            <div className="chart-overlay-btns">
              <button className={`chart-ctrl-btn ${overlays.has('ma20') ? 'active' : ''}`} onClick={() => toggleOverlay('ma20')}>MA20</button>
              <button className={`chart-ctrl-btn ${overlays.has('ma50') ? 'active' : ''}`} onClick={() => toggleOverlay('ma50')}>MA50</button>
              <button className={`chart-ctrl-btn ${overlays.has('bb') ? 'active' : ''}`} onClick={() => toggleOverlay('bb')}>BB</button>
            </div>
          </div>

          {/* Chart */}
          <ChartSVG chart={chart} chartType={chartType} overlays={overlays} technicals={technicals} />
        </>
      ) : (
        <div className="text-muted" style={{ padding: 20, textAlign: 'center' }}>차트 데이터 없음</div>
      )}

      {/* Technical indicators summary */}
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

// ── Chart SVG ────────────────────────────────────────────────────────

interface ChartSVGProps {
  chart: Record<string, string>[];
  chartType: ChartType;
  overlays: Set<OverlayKey>;
  technicals: TechnicalIndicators | null;
}

function ChartSVG({ chart, chartType, overlays, technicals }: ChartSVGProps) {
  // Data is newest-first from KIS; reverse for left-to-right chronological
  const rows = [...chart].reverse();
  const n = rows.length;

  const opens = rows.map(r => Number(r.stck_oprc || 0));
  const highs = rows.map(r => Number(r.stck_hgpr || 0));
  const lows = rows.map(r => Number(r.stck_lwpr || 0));
  const closes = rows.map(r => Number(r.stck_clpr || 0));
  const volumes = rows.map(r => Number(r.acml_vol || 0));
  const dates = rows.map(r => r.stck_bsop_date || '');

  // Price range
  let priceMin = Math.min(...lows.filter(v => v > 0));
  let priceMax = Math.max(...highs);

  // Extend range for BB if shown
  if (overlays.has('bb') && technicals?.bollinger) {
    priceMin = Math.min(priceMin, technicals.bollinger.lower * 0.99);
    priceMax = Math.max(priceMax, technicals.bollinger.upper * 1.01);
  }

  const pricePad = (priceMax - priceMin) * 0.05 || 1;
  priceMin -= pricePad;
  priceMax += pricePad;

  const volMax = Math.max(...volumes) || 1;

  // SVG dimensions
  const W = 700;
  const chartW = W - MARGIN.right;
  const barW = Math.max(1, (chartW / n) * 0.7);
  const barGap = chartW / n;

  // Scale helpers
  const xPos = (i: number) => MARGIN.left + i * barGap + barGap / 2;
  const yPrice = (v: number) => MARGIN.top + PRICE_H - ((v - priceMin) / (priceMax - priceMin)) * PRICE_H;


  // Compute moving averages from the chart data
  const computeMA = (period: number): (number | null)[] => {
    return closes.map((_, i) => {
      if (i < period - 1) return null;
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) sum += closes[j];
      return sum / period;
    });
  };

  const ma20 = overlays.has('ma20') ? computeMA(20) : null;
  const ma50 = overlays.has('ma50') ? computeMA(50) : null;

  // Bollinger bands from chart data (20-period)
  const bbData: { upper: number; middle: number; lower: number }[] | null = overlays.has('bb')
    ? closes.map((_, i) => {
        if (i < 19) return { upper: 0, middle: 0, lower: 0 };
        const window = closes.slice(i - 19, i + 1);
        const mean = window.reduce((a, b) => a + b, 0) / 20;
        const variance = window.reduce((a, b) => a + (b - mean) ** 2, 0) / 20;
        const std = Math.sqrt(variance);
        return { upper: mean + 2 * std, middle: mean, lower: mean - 2 * std };
      })
    : null;

  // Y-axis ticks (5 ticks)
  const priceRange = priceMax - priceMin;
  const priceTicks: number[] = [];
  for (let i = 0; i <= 4; i++) {
    priceTicks.push(priceMin + (priceRange * i) / 4);
  }

  // X-axis ticks (every ~10 bars)
  const xStep = Math.max(1, Math.floor(n / 6));
  const xTicks: number[] = [];
  for (let i = 0; i < n; i += xStep) xTicks.push(i);

  // MA line helper
  const maLine = (data: (number | null)[], color: string) => {
    const pts: string[] = [];
    data.forEach((v, i) => {
      if (v != null) pts.push(`${xPos(i)},${yPrice(v)}`);
    });
    return pts.length > 1 ? <polyline key={color} points={pts.join(' ')} fill="none" stroke={color} strokeWidth="1" opacity="0.8" /> : null;
  };

  return (
    <svg viewBox={`0 0 ${W} ${TOTAL_H}`} className="price-chart-svg" preserveAspectRatio="xMidYMid meet">
      {/* Grid lines */}
      {priceTicks.map((t, i) => (
        <line key={`grid-${i}`} x1={MARGIN.left} y1={yPrice(t)} x2={chartW} y2={yPrice(t)} stroke="var(--border-color)" strokeWidth="0.5" opacity="0.5" />
      ))}

      {/* Bollinger bands fill */}
      {bbData && (() => {
        const pts: string[] = [];
        const ptsR: string[] = [];
        bbData.forEach((b, i) => {
          if (i >= 19) {
            pts.push(`${xPos(i)},${yPrice(b.upper)}`);
            ptsR.unshift(`${xPos(i)},${yPrice(b.lower)}`);
          }
        });
        const all = [...pts, ...ptsR].join(' ');
        return <polygon points={all} fill="var(--color-primary)" opacity="0.06" />;
      })()}

      {/* Bollinger band lines */}
      {bbData && (() => {
        const upper: string[] = [];
        const lower: string[] = [];
        bbData.forEach((b, i) => {
          if (i >= 19) {
            upper.push(`${xPos(i)},${yPrice(b.upper)}`);
            lower.push(`${xPos(i)},${yPrice(b.lower)}`);
          }
        });
        return (
          <>
            <polyline points={upper.join(' ')} fill="none" stroke="var(--color-primary)" strokeWidth="0.7" opacity="0.4" strokeDasharray="3,3" />
            <polyline points={lower.join(' ')} fill="none" stroke="var(--color-primary)" strokeWidth="0.7" opacity="0.4" strokeDasharray="3,3" />
          </>
        );
      })()}

      {/* Price chart: candle or line */}
      {chartType === 'candle' ? (
        closes.map((close, i) => {
          const open = opens[i];
          const high = highs[i];
          const low = lows[i];
          const bullish = close >= open;
          const color = bullish ? 'var(--color-success)' : 'var(--color-error)';
          const x = xPos(i);
          const bodyTop = yPrice(Math.max(open, close));
          const bodyBot = yPrice(Math.min(open, close));
          const bodyH = Math.max(1, bodyBot - bodyTop);
          return (
            <g key={i}>
              {/* Wick */}
              <line x1={x} y1={yPrice(high)} x2={x} y2={yPrice(low)} stroke={color} strokeWidth="0.8" />
              {/* Body */}
              <rect x={x - barW / 2} y={bodyTop} width={barW} height={bodyH} fill={bullish ? 'transparent' : color} stroke={color} strokeWidth="0.8" />
            </g>
          );
        })
      ) : (
        <polyline
          points={closes.map((c, i) => `${xPos(i)},${yPrice(c)}`).join(' ')}
          fill="none" stroke="var(--color-primary)" strokeWidth="1.5"
        />
      )}

      {/* Moving averages */}
      {ma20 && maLine(ma20, '#f59e0b')}
      {ma50 && maLine(ma50, '#ec4899')}

      {/* Volume bars */}
      {volumes.map((vol, i) => {
        const bullish = closes[i] >= opens[i];
        const x = xPos(i);
        const h = (vol / volMax) * VOL_H;
        return (
          <rect
            key={`vol-${i}`}
            x={x - barW / 2}
            y={MARGIN.top + PRICE_H + GAP + VOL_H - h}
            width={barW}
            height={h}
            fill={bullish ? 'var(--color-success)' : 'var(--color-error)'}
            opacity="0.4"
          />
        );
      })}

      {/* Y-axis labels (price) */}
      {priceTicks.map((t, i) => (
        <text key={`y-${i}`} x={chartW + 4} y={yPrice(t) + 3} fontSize="9" fill="var(--text-muted)" fontFamily="var(--font-mono)">
          {formatPrice(t)}
        </text>
      ))}

      {/* X-axis labels (date) */}
      {xTicks.map(i => (
        <text key={`x-${i}`} x={xPos(i)} y={TOTAL_H - 2} fontSize="8" fill="var(--text-muted)" textAnchor="middle" fontFamily="var(--font-mono)">
          {formatDate(dates[i])}
        </text>
      ))}

      {/* Volume Y-axis max label */}
      <text x={chartW + 4} y={MARGIN.top + PRICE_H + GAP + 8} fontSize="8" fill="var(--text-muted)" fontFamily="var(--font-mono)">
        {(volMax / 10000).toFixed(0)}만
      </text>
    </svg>
  );
}
