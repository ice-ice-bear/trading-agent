import { useEffect, useState } from 'react'
import type { Signal } from '@/types'
import { cn } from '@/lib/utils'
import PriceChart from './price-chart'
import FundamentalsCard from './fundamentals-card'

interface StockDetailProps {
  stockCode: string
  stockName: string
}

interface Analysis {
  chart: Array<Record<string, string>>
  technicals: {
    rsi: number | null
    macd: { macd: number; signal: number; histogram: number; cross: string } | null
    bollinger: { upper: number; middle: number; lower: number; bandwidth: number; position: string } | null
    ma: { ma20: number | null; ma50: number | null; ma200: number | null } | null
    volume_trend_pct: number | null
  }
  fundamentals: Record<string, number | null> | null
  investor_trend: { foreign_net_buy?: number; institution_net_buy?: number; foreign_holding_pct?: number | null; days?: number }
  insider_trades: Array<{ reporter_name: string; position: string; shares_before: number; shares_after: number; change_amount: number; report_date: string }>
  dcf: Record<string, number | null> | null
}

function fmtNum(n: number | null | undefined, digits = 0) {
  if (n == null || !isFinite(n)) return '--'
  return n.toLocaleString(undefined, { maximumFractionDigits: digits })
}

function StatCell({ label, value, tone }: { label: string; value: string; tone?: 'up' | 'down' | 'neutral' }) {
  const color = tone === 'up' ? 'text-error' : tone === 'down' ? 'text-blue' : 'text-foreground'
  return (
    <div className="border border-border-light rounded-lg p-3">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">{label}</div>
      <div className={cn('text-sm font-bold font-mono', color)}>{value}</div>
    </div>
  )
}

interface NewsData {
  news: { headlines: string[]; sentiment: string; summary?: string; source?: string }
  disclosures: Array<{ event_date: string; description: string; source: string }>
}

interface PeersData {
  sector: string
  target: { code: string; name: string; per: number | null; pbr: number | null; operating_margin: number | null; debt_ratio: number | null }
  peers: Array<{ code: string; name: string; per: number | null; pbr: number | null; operating_margin: number | null; debt_ratio: number | null }>
}

export default function StockDetail({ stockCode, stockName }: StockDetailProps) {
  const [signals, setSignals] = useState<Signal[]>([])
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [news, setNews] = useState<NewsData | null>(null)
  const [peers, setPeers] = useState<PeersData | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch(`/api/signals/history/${stockCode}`)
      .then(r => r.ok ? r.json() : { signals: [] })
      .then(d => setSignals(d.signals || []))
      .catch(() => setSignals([]))
  }, [stockCode])

  useEffect(() => {
    setLoading(true)
    setAnalysis(null); setNews(null); setPeers(null)
    fetch(`/api/research/${stockCode}/analysis`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setAnalysis(d))
      .catch(() => setAnalysis(null))
      .finally(() => setLoading(false))
    fetch(`/api/research/${stockCode}/news?stock_name=${encodeURIComponent(stockName)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setNews(d))
      .catch(() => setNews(null))
    fetch(`/api/peers/${stockCode}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setPeers(d))
      .catch(() => setPeers(null))
  }, [stockCode, stockName])

  const latestSignal = signals[0]
  const tech = analysis?.technicals
  const inv = analysis?.investor_trend

  return (
    <div className="flex-1 overflow-y-auto min-w-0">
      <div className="flex items-end gap-4 mb-5 pb-4 border-b border-border">
        <div>
          <div className="text-2xl font-extrabold">{stockName}</div>
          <div className="text-sm text-muted-foreground font-mono">{stockCode} &middot; KOSPI</div>
        </div>
      </div>

      <div className="mb-4">
        <PriceChart
          stockCode={stockCode}
          chart={analysis?.chart || []}
          ma={tech?.ma || undefined}
          bollinger={tech?.bollinger || null}
        />
        {loading && <div className="text-xs text-muted-foreground mt-2">Loading analysis…</div>}
      </div>

      {/* Technicals */}
      {tech && (
        <div className="bg-surface border border-border rounded-xl overflow-hidden mb-4">
          <div className="px-[18px] py-3.5 border-b border-border-light">
            <h3 className="text-[13px] font-bold uppercase tracking-wider">Technical Indicators</h3>
          </div>
          <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCell label="RSI(14)"
              value={fmtNum(tech.rsi, 1)}
              tone={tech.rsi != null ? (tech.rsi >= 70 ? 'up' : tech.rsi <= 30 ? 'down' : 'neutral') : 'neutral'} />
            <StatCell label="MACD Hist"
              value={fmtNum(tech.macd?.histogram, 2)}
              tone={tech.macd?.histogram != null ? (tech.macd.histogram > 0 ? 'up' : 'down') : 'neutral'} />
            <StatCell label="Bollinger BW"
              value={tech.bollinger ? `${(tech.bollinger.bandwidth * 100).toFixed(1)}%` : '--'} />
            <StatCell label="Volume Trend"
              value={tech.volume_trend_pct != null ? `${tech.volume_trend_pct.toFixed(1)}%` : '--'}
              tone={tech.volume_trend_pct != null ? (tech.volume_trend_pct > 0 ? 'up' : 'down') : 'neutral'} />
            <StatCell label="MA20" value={fmtNum(tech.ma?.ma20)} />
            <StatCell label="MA50" value={fmtNum(tech.ma?.ma50)} />
            <StatCell label="BB Upper" value={fmtNum(tech.bollinger?.upper)} />
            <StatCell label="BB Lower" value={fmtNum(tech.bollinger?.lower)} />
          </div>
        </div>
      )}

      {/* Investor Flow */}
      {inv && (inv.foreign_net_buy != null || inv.institution_net_buy != null) && (
        <div className="bg-surface border border-border rounded-xl overflow-hidden mb-4">
          <div className="px-[18px] py-3.5 border-b border-border-light">
            <h3 className="text-[13px] font-bold uppercase tracking-wider">Investor Flow ({inv.days ?? 20}d)</h3>
          </div>
          <div className="p-4 grid grid-cols-3 gap-3">
            <StatCell label="Foreign Net Buy"
              value={fmtNum(inv.foreign_net_buy)}
              tone={(inv.foreign_net_buy ?? 0) > 0 ? 'up' : (inv.foreign_net_buy ?? 0) < 0 ? 'down' : 'neutral'} />
            <StatCell label="Institution Net Buy"
              value={fmtNum(inv.institution_net_buy)}
              tone={(inv.institution_net_buy ?? 0) > 0 ? 'up' : (inv.institution_net_buy ?? 0) < 0 ? 'down' : 'neutral'} />
            <StatCell label="Foreign Holding %"
              value={inv.foreign_holding_pct != null ? `${inv.foreign_holding_pct.toFixed(2)}%` : '--'} />
          </div>
        </div>
      )}

      <div className="mb-4">
        <FundamentalsCard data={(analysis?.fundamentals as any) || latestSignal?.dart_fundamentals || null} />
      </div>

      {/* Insider Trades */}
      {analysis?.insider_trades && analysis.insider_trades.length > 0 && (
        <div className="bg-surface border border-border rounded-xl overflow-hidden mb-4">
          <div className="px-[18px] py-3.5 border-b border-border-light">
            <h3 className="text-[13px] font-bold uppercase tracking-wider">Insider Trades</h3>
          </div>
          <table className="w-full text-[13px]">
            <thead>
              <tr>
                <th className="text-left px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase border-b border-border">Date</th>
                <th className="text-left px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase border-b border-border">Reporter</th>
                <th className="text-left px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase border-b border-border">Position</th>
                <th className="text-right px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase border-b border-border">Change</th>
                <th className="text-right px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase border-b border-border">After</th>
              </tr>
            </thead>
            <tbody>
              {analysis.insider_trades.map((t, i) => (
                <tr key={i}>
                  <td className="px-3 py-2 border-b border-border-light font-mono text-xs">{t.report_date}</td>
                  <td className="px-3 py-2 border-b border-border-light">{t.reporter_name}</td>
                  <td className="px-3 py-2 border-b border-border-light text-muted-foreground text-xs">{t.position}</td>
                  <td className={cn('text-right px-3 py-2 border-b border-border-light font-mono', t.change_amount > 0 ? 'text-error' : t.change_amount < 0 ? 'text-blue' : '')}>
                    {t.change_amount > 0 ? '+' : ''}{fmtNum(t.change_amount)}
                  </td>
                  <td className="text-right px-3 py-2 border-b border-border-light font-mono">{fmtNum(t.shares_after)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Peer Comparison */}
      {peers && peers.peers.length > 0 && (
        <div className="bg-surface border border-border rounded-xl overflow-hidden mb-4">
          <div className="px-[18px] py-3.5 border-b border-border-light">
            <h3 className="text-[13px] font-bold uppercase tracking-wider">Peer Comparison ({peers.sector})</h3>
          </div>
          <table className="w-full text-[13px]">
            <thead>
              <tr>
                <th className="text-left px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase border-b border-border">Name</th>
                <th className="text-right px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase border-b border-border">PER</th>
                <th className="text-right px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase border-b border-border">PBR</th>
                <th className="text-right px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase border-b border-border">Op Margin</th>
                <th className="text-right px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase border-b border-border">Debt Ratio</th>
              </tr>
            </thead>
            <tbody>
              {[peers.target, ...peers.peers].map((p, i) => (
                <tr key={p.code} className={i === 0 ? 'bg-primary/5' : ''}>
                  <td className="px-3 py-2 border-b border-border-light">
                    <span className={cn('font-semibold', i === 0 && 'text-primary')}>{p.name}</span>
                    <span className="text-muted-foreground font-mono text-xs ml-2">{p.code}</span>
                  </td>
                  <td className="text-right px-3 py-2 border-b border-border-light font-mono">{fmtNum(p.per, 1)}</td>
                  <td className="text-right px-3 py-2 border-b border-border-light font-mono">{fmtNum(p.pbr, 2)}</td>
                  <td className="text-right px-3 py-2 border-b border-border-light font-mono">{p.operating_margin != null ? `${p.operating_margin.toFixed(2)}%` : '--'}</td>
                  <td className="text-right px-3 py-2 border-b border-border-light font-mono">{p.debt_ratio != null ? `${p.debt_ratio.toFixed(1)}%` : '--'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* News + Disclosures */}
      {news && (news.news.headlines.length > 0 || news.disclosures.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          {news.news.headlines.length > 0 && (
            <div className="bg-surface border border-border rounded-xl overflow-hidden">
              <div className="px-[18px] py-3.5 border-b border-border-light flex items-center justify-between">
                <h3 className="text-[13px] font-bold uppercase tracking-wider">News</h3>
                <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded',
                  news.news.sentiment === 'positive' ? 'bg-success/10 text-success' :
                  news.news.sentiment === 'negative' ? 'bg-error/10 text-error' :
                  'bg-muted text-muted-foreground')}>
                  {news.news.sentiment}
                </span>
              </div>
              <ul className="divide-y divide-border-light">
                {news.news.headlines.map((h, i) => (
                  <li key={i} className="px-[18px] py-2.5 text-[13px]">{h}</li>
                ))}
              </ul>
            </div>
          )}
          {news.disclosures.length > 0 && (
            <div className="bg-surface border border-border rounded-xl overflow-hidden">
              <div className="px-[18px] py-3.5 border-b border-border-light">
                <h3 className="text-[13px] font-bold uppercase tracking-wider">DART Disclosures</h3>
              </div>
              <ul className="divide-y divide-border-light">
                {news.disclosures.slice(0, 10).map((d, i) => (
                  <li key={i} className="px-[18px] py-2.5 text-[13px] flex gap-3">
                    <span className="text-muted-foreground font-mono text-xs shrink-0">{d.event_date}</span>
                    <span>{d.description}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* DCF Valuation */}
      {analysis?.dcf && (
        <div className="bg-surface border border-border rounded-xl overflow-hidden mb-4">
          <div className="px-[18px] py-3.5 border-b border-border-light">
            <h3 className="text-[13px] font-bold uppercase tracking-wider">DCF Valuation</h3>
          </div>
          <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(analysis.dcf).map(([k, v]) => (
              <StatCell key={k} label={k.replace(/_/g, ' ')} value={typeof v === 'number' ? fmtNum(v, 2) : String(v ?? '--')} />
            ))}
          </div>
        </div>
      )}

      {signals.length > 0 && (
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <div className="px-[18px] py-3.5 border-b border-border-light">
            <h3 className="text-[13px] font-bold uppercase tracking-wider">Signal History</h3>
          </div>
          <table className="w-full text-[13px]">
            <thead>
              <tr>
                <th className="text-left px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase border-b border-border">Date</th>
                <th className="text-left px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase border-b border-border">Direction</th>
                <th className="text-right px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase border-b border-border">Score</th>
                <th className="text-left px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase border-b border-border">Status</th>
              </tr>
            </thead>
            <tbody>
              {signals.map(s => (
                <tr key={s.id}>
                  <td className="px-3 py-2 border-b border-border-light font-mono text-xs">{new Date(s.timestamp).toLocaleDateString('ko-KR')}</td>
                  <td className="px-3 py-2 border-b border-border-light">
                    <span className={cn('px-2 py-0.5 rounded text-[11px] font-bold text-white', s.direction === 'buy' ? 'bg-error' : 'bg-blue')}>
                      {s.direction.toUpperCase()}
                    </span>
                  </td>
                  <td className="text-right px-3 py-2 border-b border-border-light font-mono">{s.rr_score?.toFixed(2) || '--'}</td>
                  <td className={cn('px-3 py-2 border-b border-border-light text-xs font-semibold',
                    s.status === 'approved' || s.status === 'executed' ? 'text-success' : s.status === 'rejected' ? 'text-error' : 'text-muted-foreground'
                  )}>
                    {s.status}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
