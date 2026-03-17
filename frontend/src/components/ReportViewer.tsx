import { useEffect, useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';
import type { Report, ReportSummary } from '../types';
import { getReports, getReport, generateReport, deleteReport } from '../services/api';
import { useWebSocket } from '../hooks/useWebSocket';

type FilterType = 'all' | 'daily' | 'weekly';

export default function ReportViewer() {
  const [reports, setReports] = useState<Report[]>([]);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [filter, setFilter] = useState<FilterType>('all');
  const [generating, setGenerating] = useState(false);
  const [loading, setLoading] = useState(true);
  const { events } = useWebSocket();

  const fetchReports = useCallback(() => {
    const type = filter === 'all' ? undefined : filter;
    getReports(type, 50)
      .then((data) => {
        setReports(data.reports);
        setLoading(false);
      })
      .catch(console.error);
  }, [filter]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  // Listen for report.generated WS event
  useEffect(() => {
    const last = events[events.length - 1];
    if (last?.event_type !== 'report.generated') return;
    fetchReports();
    const reportId = last.data?.report_id as number;
    Promise.resolve(reportId ? getReport(reportId) : null)
      .then((r) => {
        if (r) setSelectedReport(r);
        setGenerating(false);
      })
      .catch(() => setGenerating(false));
  }, [events, fetchReports]);

  const handleSelectReport = async (report: Report) => {
    if (report.content !== undefined) {
      setSelectedReport(report);
      return;
    }
    try {
      const full = await getReport(report.id);
      setSelectedReport(full);
    } catch (err) {
      console.error('Failed to load report:', err);
    }
  };

  const handleGenerate = async (type: 'daily' | 'weekly') => {
    setGenerating(true);
    try {
      await generateReport(type);
      // WS event will trigger refresh + auto-select
    } catch (err) {
      console.error('Failed to generate report:', err);
      setGenerating(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteReport(id);
      if (selectedReport?.id === id) setSelectedReport(null);
      fetchReports();
    } catch (err) {
      console.error('Failed to delete report:', err);
    }
  };

  const summary: ReportSummary | null = selectedReport?.summary ?? null;

  return (
    <div className="report-viewer">
      {/* Sidebar */}
      <div className="report-sidebar">
        <div className="report-sidebar-header">
          <h3>Reports</h3>
          <div className="report-filter-tabs">
            {(['all', 'daily', 'weekly'] as FilterType[]).map((f) => (
              <button
                key={f}
                className={`report-filter-tab ${filter === f ? 'active' : ''}`}
                onClick={() => setFilter(f)}
              >
                {f === 'all' ? 'All' : f === 'daily' ? 'Daily' : 'Weekly'}
              </button>
            ))}
          </div>
        </div>
        <div className="report-generate-actions">
          <button
            className="report-generate-btn"
            onClick={() => handleGenerate('daily')}
            disabled={generating}
          >
            {generating ? 'Generating...' : 'Daily Report'}
          </button>
          <button
            className="report-generate-btn"
            onClick={() => handleGenerate('weekly')}
            disabled={generating}
          >
            {generating ? 'Generating...' : 'Weekly Report'}
          </button>
        </div>
        <div className="report-list">
          {loading ? (
            <div className="no-data">Loading...</div>
          ) : reports.length === 0 ? (
            <div className="no-data">No reports yet</div>
          ) : (
            reports.map((r) => (
              <div
                key={r.id}
                className={`report-list-item ${selectedReport?.id === r.id ? 'selected' : ''}`}
                onClick={() => handleSelectReport(r)}
              >
                <div className="report-list-item-header">
                  <span className={`report-type-badge type-${r.report_type}`}>
                    {r.report_type}
                  </span>
                  <button
                    className="report-delete-btn"
                    onClick={(e) => { e.stopPropagation(); handleDelete(r.id); }}
                    title="Delete"
                  >
                    X
                  </button>
                </div>
                <div className="report-list-item-title">{r.title || 'Untitled'}</div>
                <div className="report-list-item-date">
                  {new Date(r.timestamp).toLocaleDateString('ko-KR')}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="report-content">
        {!selectedReport ? (
          <div className="report-empty-state">
            <p>Select a report or generate a new one.</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="report-header">
              <h2>{selectedReport.title || 'Report'}</h2>
              <div className="report-header-meta">
                <span className={`report-type-badge type-${selectedReport.report_type}`}>
                  {selectedReport.report_type}
                </span>
                {selectedReport.period_start && selectedReport.period_end && (
                  <span className="report-period">
                    {selectedReport.period_start} ~ {selectedReport.period_end}
                  </span>
                )}
              </div>
            </div>

            {/* KPI Tiles */}
            {summary?.kpis && (
              <div className="report-kpi-grid">
                <KPITile label="Total P/L" value={`${summary.kpis.total_pnl.toLocaleString()}원`} colored={summary.kpis.total_pnl} />
                <KPITile label="P/L %" value={`${summary.kpis.total_pnl_pct.toFixed(2)}%`} colored={summary.kpis.total_pnl_pct} />
                <KPITile label="Trades" value={String(summary.kpis.trade_count)} />
                <KPITile label="Win Rate" value={`${summary.kpis.win_rate.toFixed(1)}%`} />
                <KPITile label="Max DD" value={`-${summary.kpis.max_drawdown_pct.toFixed(2)}%`} colored={-1} />
                <KPITile label="Signals" value={String(summary.kpis.signal_count)} />
                <KPITile label="Approval" value={`${summary.kpis.signal_approval_rate.toFixed(1)}%`} />
              </div>
            )}

            {/* Trade Table */}
            {summary?.trades && summary.trades.length > 0 && (
              <div className="report-section">
                <h3>Trades</h3>
                <table className="dashboard-table">
                  <thead>
                    <tr>
                      <th>Stock</th>
                      <th>Side</th>
                      <th className="text-right">Qty</th>
                      <th className="text-right">Price</th>
                      <th>Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.trades.map((t, i) => (
                      <tr key={i}>
                        <td>{t.stock_name}</td>
                        <td><span className={`side-badge ${t.side}`}>{t.side === 'buy' ? '매수' : '매도'}</span></td>
                        <td className="text-right">{t.quantity.toLocaleString()}</td>
                        <td className="text-right">{t.price.toLocaleString()}원</td>
                        <td className="order-time">{new Date(t.timestamp).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Signal Summary */}
            {summary?.signals && summary.signals.length > 0 && (
              <div className="report-section">
                <h3>Signals</h3>
                <div className="report-signal-grid">
                  {summary.signals.map((s, i) => (
                    <div key={i} className="report-signal-card">
                      <span className="report-signal-name">{s.stock_name}</span>
                      <span className={`direction-badge direction-${s.direction}`}>{s.direction.toUpperCase()}</span>
                      {s.rr_score != null && <span className="report-signal-rr">R/R {s.rr_score.toFixed(1)}</span>}
                      <span className={`order-status status-${s.status}`}>{s.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Risk Events */}
            {summary?.risk_events && summary.risk_events.length > 0 && (
              <div className="report-section">
                <h3>Risk Events</h3>
                <div className="report-risk-timeline">
                  {summary.risk_events.map((r, i) => (
                    <div key={i} className={`risk-timeline-item ${r.event_type === 'stop_loss' ? 'risk-loss' : 'risk-profit'}`}>
                      <span className="risk-timeline-dot" />
                      <span className="risk-timeline-time">{new Date(r.timestamp).toLocaleTimeString('ko-KR')}</span>
                      <span className="risk-timeline-detail">{r.stock_name} — {r.detail}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Narrative */}
            {selectedReport.content && (
              <div className="report-section report-narrative">
                <h3>Analysis</h3>
                <ReactMarkdown rehypePlugins={[rehypeHighlight]} remarkPlugins={[remarkGfm]}>
                  {selectedReport.content}
                </ReactMarkdown>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function KPITile({ label, value, colored }: { label: string; value: string; colored?: number }) {
  const cls = colored !== undefined ? (colored >= 0 ? 'positive' : 'negative') : '';
  return (
    <div className="report-kpi-tile">
      <span className="report-kpi-label">{label}</span>
      <span className={`report-kpi-value ${cls}`}>{value}</span>
    </div>
  );
}
