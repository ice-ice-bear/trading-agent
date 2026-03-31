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
const VOL_H = 60;
const GAP = 4;
const DIVIDER = 1;
const TOTAL_H = MARGIN.top + PRICE_H + DIVIDER + GAP + VOL_H + MARGIN.bottom;

function formatPrice(v: number): string {
  if (v >= 1000000) return `${(v / 10000).toFixed(0)}만`;
  if (v >= 1000) return v.toLocaleString();
  return v.toString();
}

function formatDate(raw: string): string {
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

          {/* Main chart SVG */}
          <ChartSVG chart={chart} chartType={chartType} overlays={overlays} technicals={technicals} />
        </>
      ) : (
        <div className="text-muted" style={{ padding: 20, textAlign: 'center' }}>차트 데이터 없음</div>
      )}

      {/* Technical indicator cards */}
      {technicals && chart && chart.length > 0 && (
        <div className="tech-cards">
          <RSICard rsi={technicals.rsi} />
          <MACDCard macd={technicals.macd} chart={chart} />
          <BollingerCard bollinger={technicals.bollinger} />
          <VolumeCard volumeTrendPct={technicals.volume_trend_pct} chart={chart} />
        </div>
      )}
    </SectionSkeleton>
  );
}

// ── Technical Indicator Cards ────────────────────────────────────────

function RSICard({ rsi }: { rsi: number | null }) {
  const val = rsi ?? 50;
  const zone = val > 70 ? 'overbought' : val < 30 ? 'oversold' : 'neutral';
  const zoneLabel = val > 70 ? '과매수' : val < 30 ? '과매도' : '중립';
  const zoneColor = val > 70 ? 'var(--color-error)' : val < 30 ? 'var(--color-success)' : 'var(--text-muted)';

  return (
    <div className={`tech-card tech-card-${zone}`}>
      <div className="tech-card-header">
        <span className="tech-card-title">RSI (14)</span>
        <span className="tech-card-value" style={{ color: zoneColor }}>{rsi?.toFixed(1) ?? '—'}</span>
      </div>
      <div className="rsi-gauge">
        <div className="rsi-gauge-bg">
          <div className="rsi-zone rsi-oversold" />
          <div className="rsi-zone rsi-neutral" />
          <div className="rsi-zone rsi-overbought" />
        </div>
        <div className="rsi-needle" style={{ left: `${Math.min(100, Math.max(0, val))}%` }} />
        <div className="rsi-labels">
          <span>0</span><span>30</span><span>70</span><span>100</span>
        </div>
      </div>
      <div className="tech-card-badge" style={{ color: zoneColor }}>{zoneLabel}</div>
    </div>
  );
}

function MACDCard({ macd, chart }: { macd: TechnicalIndicators['macd']; chart: Record<string, string>[] }) {
  // Compute MACD histogram for mini chart from raw chart data
  const rows = [...chart].reverse();
  const closes = rows.map(r => Number(r.stck_clpr || 0));

  const ema = (data: number[], period: number): number[] => {
    const k = 2 / (period + 1);
    const result = [data.slice(0, period).reduce((a, b) => a + b, 0) / period];
    for (let i = period; i < data.length; i++) {
      result.push(data[i] * k + result[result.length - 1] * (1 - k));
    }
    return result;
  };

  let histBars: number[] = [];
  if (closes.length >= 35) {
    const ema12 = ema(closes, 12);
    const ema26 = ema(closes, 26);
    const offset = 26 - 12;
    const macdLine = ema12.slice(offset).map((f, i) => f - ema26[i]);
    if (macdLine.length >= 9) {
      const signalLine = ema(macdLine, 9);
      histBars = macdLine.slice(macdLine.length - signalLine.length).map((m, i) => m - signalLine[i]);
      // Take last 30 bars
      histBars = histBars.slice(-30);
    }
  }

  const histMax = Math.max(1, ...histBars.map(Math.abs));

  return (
    <div className="tech-card">
      <div className="tech-card-header">
        <span className="tech-card-title">MACD (12,26,9)</span>
        <span className={`tech-card-value ${(macd?.histogram ?? 0) > 0 ? 'positive' : 'negative'}`}>
          {macd?.macd.toFixed(0) ?? '—'}
        </span>
      </div>
      {histBars.length > 0 ? (
        <svg viewBox={`0 0 ${histBars.length * 5} 60`} className="macd-mini-chart" preserveAspectRatio="none">
          <line x1="0" y1="30" x2={histBars.length * 5} y2="30" stroke="var(--border-color)" strokeWidth="0.5" />
          {histBars.map((h, i) => {
            const barH = (Math.abs(h) / histMax) * 28;
            const y = h >= 0 ? 30 - barH : 30;
            return (
              <rect
                key={i}
                x={i * 5 + 0.5}
                y={y}
                width="4"
                height={barH}
                fill={h >= 0 ? 'var(--color-success)' : 'var(--color-error)'}
                opacity="0.7"
              />
            );
          })}
        </svg>
      ) : (
        <div className="tech-card-empty">데이터 부족</div>
      )}
      <div className="tech-card-sub">
        <span>Signal: {macd?.signal.toFixed(0) ?? '—'}</span>
        <span>Hist: <span className={(macd?.histogram ?? 0) > 0 ? 'positive' : 'negative'}>{macd?.histogram.toFixed(0) ?? '—'}</span></span>
        <span>{macd?.cross === 'bullish' ? '↑ 골든크로스' : macd?.cross === 'bearish' ? '↓ 데드크로스' : ''}</span>
      </div>
    </div>
  );
}

function BollingerCard({ bollinger }: { bollinger: TechnicalIndicators['bollinger'] }) {
  if (!bollinger) return (
    <div className="tech-card">
      <div className="tech-card-header">
        <span className="tech-card-title">볼린저 밴드</span>
        <span className="tech-card-value">—</span>
      </div>
      <div className="tech-card-empty">데이터 없음</div>
    </div>
  );

  const { upper, middle, lower, bandwidth, position } = bollinger;
  // Position as percentage within band (0=lower, 100=upper)
  const range = upper - lower || 1;
  const pct = ((middle - lower) / range) * 100; // current approx position
  const posLabel: Record<string, string> = {
    above_upper: '상한 돌파', upper_half: '상단', lower_half: '하단', below_lower: '하한 이탈'
  };

  return (
    <div className="tech-card">
      <div className="tech-card-header">
        <span className="tech-card-title">볼린저 밴드</span>
        <span className="tech-card-value">{posLabel[position] ?? position}</span>
      </div>
      <div className="bb-visual">
        <div className="bb-band">
          <div className="bb-fill" style={{ left: '0%', width: '100%' }} />
          <div className="bb-marker" style={{ left: `${Math.min(100, Math.max(0, pct))}%` }} />
        </div>
        <div className="bb-labels">
          <span>{formatPrice(lower)}</span>
          <span>{formatPrice(middle)}</span>
          <span>{formatPrice(upper)}</span>
        </div>
      </div>
      <div className="tech-card-sub">
        <span>밴드폭: {(bandwidth * 100).toFixed(1)}%</span>
      </div>
    </div>
  );
}

function VolumeCard({ volumeTrendPct, chart }: { volumeTrendPct: number | null; chart: Record<string, string>[] }) {
  // Mini volume bars (last 20 days)
  const rows = [...chart].reverse().slice(-20);
  const vols = rows.map(r => Number(r.acml_vol || 0));
  const closes = rows.map(r => Number(r.stck_clpr || 0));
  const opens = rows.map(r => Number(r.stck_oprc || 0));
  const vMax = Math.max(1, ...vols);

  return (
    <div className="tech-card">
      <div className="tech-card-header">
        <span className="tech-card-title">거래량 추세</span>
        <span className={`tech-card-value ${(volumeTrendPct ?? 0) > 0 ? 'positive' : 'negative'}`}>
          {volumeTrendPct != null ? `${volumeTrendPct > 0 ? '+' : ''}${volumeTrendPct}%` : '—'}
        </span>
      </div>
      {vols.length > 0 && (
        <svg viewBox={`0 0 ${vols.length * 6} 56`} className="vol-mini-chart" preserveAspectRatio="none">
          {vols.map((v, i) => {
            const h = (v / vMax) * 50;
            const bullish = closes[i] >= opens[i];
            return (
              <rect
                key={i}
                x={i * 6 + 0.5}
                y={56 - h}
                width="5"
                height={h}
                fill={bullish ? 'var(--color-success)' : 'var(--color-error)'}
                opacity="0.6"
              />
            );
          })}
        </svg>
      )}
      <div className="tech-card-sub">
        <span>5일 평균 대비 20일 평균</span>
      </div>
    </div>
  );
}

// ── Main Chart SVG ───────────────────────────────────────────────────

interface ChartSVGProps {
  chart: Record<string, string>[];
  chartType: ChartType;
  overlays: Set<OverlayKey>;
  technicals: TechnicalIndicators | null;
}

function ChartSVG({ chart, chartType, overlays, technicals }: ChartSVGProps) {
  const rows = [...chart].reverse();
  const n = rows.length;

  const opens = rows.map(r => Number(r.stck_oprc || 0));
  const highs = rows.map(r => Number(r.stck_hgpr || 0));
  const lows = rows.map(r => Number(r.stck_lwpr || 0));
  const closes = rows.map(r => Number(r.stck_clpr || 0));
  const volumes = rows.map(r => Number(r.acml_vol || 0));
  const dates = rows.map(r => r.stck_bsop_date || '');

  let priceMin = Math.min(...lows.filter(v => v > 0));
  let priceMax = Math.max(...highs);

  if (overlays.has('bb') && technicals?.bollinger) {
    priceMin = Math.min(priceMin, technicals.bollinger.lower * 0.99);
    priceMax = Math.max(priceMax, technicals.bollinger.upper * 1.01);
  }

  const pricePad = (priceMax - priceMin) * 0.05 || 1;
  priceMin -= pricePad;
  priceMax += pricePad;

  const volMax = Math.max(...volumes) || 1;

  const W = 700;
  const chartW = W - MARGIN.right;
  const barW = Math.max(1, (chartW / n) * 0.7);
  const barGap = chartW / n;

  const xPos = (i: number) => MARGIN.left + i * barGap + barGap / 2;
  const yPrice = (v: number) => MARGIN.top + PRICE_H - ((v - priceMin) / (priceMax - priceMin)) * PRICE_H;
  const volTop = MARGIN.top + PRICE_H + DIVIDER + GAP;

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

  const priceRange = priceMax - priceMin;
  const priceTicks: number[] = [];
  for (let i = 0; i <= 4; i++) priceTicks.push(priceMin + (priceRange * i) / 4);

  const xStep = Math.max(1, Math.floor(n / 6));
  const xTicks: number[] = [];
  for (let i = 0; i < n; i += xStep) xTicks.push(i);

  const maLine = (data: (number | null)[], color: string) => {
    const pts: string[] = [];
    data.forEach((v, i) => { if (v != null) pts.push(`${xPos(i)},${yPrice(v)}`); });
    return pts.length > 1 ? <polyline key={color} points={pts.join(' ')} fill="none" stroke={color} strokeWidth="1" opacity="0.8" /> : null;
  };

  return (
    <svg viewBox={`0 0 ${W} ${TOTAL_H}`} className="price-chart-svg" preserveAspectRatio="xMidYMid meet">
      {/* Price area background */}
      <rect x={MARGIN.left} y={MARGIN.top} width={chartW} height={PRICE_H} fill="var(--bg-primary)" opacity="0.3" rx="2" />

      {/* Grid lines */}
      {priceTicks.map((t, i) => (
        <line key={`grid-${i}`} x1={MARGIN.left} y1={yPrice(t)} x2={chartW} y2={yPrice(t)} stroke="var(--border-color)" strokeWidth="0.5" opacity="0.4" />
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
        return <polygon points={[...pts, ...ptsR].join(' ')} fill="var(--color-primary)" opacity="0.06" />;
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

      {/* Price chart */}
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
              <line x1={x} y1={yPrice(high)} x2={x} y2={yPrice(low)} stroke={color} strokeWidth="0.8" />
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

      {/* ── Divider between Price and Volume ── */}
      <line x1={MARGIN.left} y1={MARGIN.top + PRICE_H + DIVIDER / 2} x2={chartW} y2={MARGIN.top + PRICE_H + DIVIDER / 2} stroke="var(--border-color)" strokeWidth="0.8" />

      {/* Volume area background */}
      <rect x={MARGIN.left} y={volTop} width={chartW} height={VOL_H} fill="var(--bg-primary)" opacity="0.15" rx="2" />

      {/* Volume area label */}
      <text x={MARGIN.left + 4} y={volTop + 10} fontSize="8" fill="var(--text-muted)" opacity="0.6">Vol</text>

      {/* Volume bars */}
      {volumes.map((vol, i) => {
        const bullish = closes[i] >= opens[i];
        const x = xPos(i);
        const h = (vol / volMax) * VOL_H;
        return (
          <rect
            key={`vol-${i}`}
            x={x - barW / 2}
            y={volTop + VOL_H - h}
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

      {/* Volume Y-axis labels */}
      <text x={chartW + 4} y={volTop + 10} fontSize="8" fill="var(--text-muted)" fontFamily="var(--font-mono)">
        {(volMax / 10000).toFixed(0)}만
      </text>
      <text x={chartW + 4} y={volTop + VOL_H - 2} fontSize="8" fill="var(--text-muted)" fontFamily="var(--font-mono)">
        0
      </text>
    </svg>
  );
}
