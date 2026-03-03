import { useEffect, useState } from 'react';
import type { Report } from '../../types';
import { getReports, generateReport, deleteReport, deleteReportsBulk } from '../../services/api';

export default function ReportList() {
  const [reports, setReports] = useState<Report[]>([]);
  const [generating, setGenerating] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);

  const fetchReports = () => {
    getReports()
      .then((data) => setReports(data.reports))
      .catch(console.error);
  };

  useEffect(() => {
    fetchReports();
  }, []);

  const handleGenerate = async (type: 'daily' | 'weekly') => {
    setGenerating(true);
    try {
      const result = await generateReport(type);
      if (result.report_id) {
        fetchReports();
      }
    } catch (err) {
      console.error('Report generation failed:', err);
    } finally {
      setGenerating(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, reportId: number) => {
    e.stopPropagation();
    if (!confirm('이 리포트를 삭제하시겠습니까?')) return;
    setDeleting(reportId);
    try {
      await deleteReport(reportId);
      if (selectedReport?.id === reportId) setSelectedReport(null);
      fetchReports();
    } catch (err) {
      console.error('Failed to delete report:', err);
    } finally {
      setDeleting(null);
    }
  };

  const handleDeleteAll = async () => {
    if (!confirm(`모든 리포트(${reports.length}개)를 삭제하시겠습니까?`)) return;
    try {
      await deleteReportsBulk(undefined, true);
      setSelectedReport(null);
      fetchReports();
    } catch (err) {
      console.error('Failed to delete all reports:', err);
    }
  };

  const handleViewReport = async (reportId: number) => {
    try {
      const res = await fetch(`/api/reports/${reportId}`);
      if (res.ok) {
        const full = await res.json();
        setSelectedReport(full);
      }
    } catch (err) {
      console.error('Failed to load report:', err);
    }
  };

  if (selectedReport) {
    return (
      <div className="dashboard-card report-detail-card">
        <div className="report-detail-header">
          <h3 className="card-title">{selectedReport.title}</h3>
          <div className="report-detail-actions">
            <button
              className="report-delete-btn"
              onClick={(e) => handleDelete(e, selectedReport.id)}
              disabled={deleting === selectedReport.id}
            >
              {deleting === selectedReport.id ? '삭제 중...' : '삭제'}
            </button>
            <button className="report-back-btn" onClick={() => setSelectedReport(null)}>
              &larr; 목록
            </button>
          </div>
        </div>
        <div className="report-meta">
          <span className={`report-type-badge ${selectedReport.report_type}`}>
            {selectedReport.report_type === 'daily' ? '일일' : '주간'}
          </span>
          <span>{selectedReport.period_start} ~ {selectedReport.period_end}</span>
        </div>
        <div className="report-content" dangerouslySetInnerHTML={{
          __html: (selectedReport.content || '').replace(/\n/g, '<br/>')
        }} />
      </div>
    );
  }

  return (
    <div className="dashboard-card">
      <div className="report-header">
        <h3 className="card-title">Reports</h3>
        <div className="report-actions">
          <button
            className="report-gen-btn"
            onClick={() => handleGenerate('daily')}
            disabled={generating}
          >
            {generating ? '생성 중...' : '일일 리포트'}
          </button>
          <button
            className="report-gen-btn"
            onClick={() => handleGenerate('weekly')}
            disabled={generating}
          >
            {generating ? '생성 중...' : '주간 리포트'}
          </button>
          {reports.length > 0 && (
            <button className="report-delete-all-btn" onClick={handleDeleteAll}>
              전체 삭제
            </button>
          )}
        </div>
      </div>
      {reports.length === 0 ? (
        <div className="no-data">리포트 없음</div>
      ) : (
        <div className="report-list">
          {reports.map((report) => (
            <div
              key={report.id}
              className="report-row"
              onClick={() => handleViewReport(report.id)}
            >
              <div className="report-row-left">
                <span className={`report-type-badge ${report.report_type}`}>
                  {report.report_type === 'daily' ? '일일' : '주간'}
                </span>
                <span className="report-title">{report.title}</span>
              </div>
              <div className="report-row-right">
                <span className="report-date">
                  {new Date(report.timestamp).toLocaleDateString('ko-KR')}
                </span>
                <button
                  className="report-delete-btn-sm"
                  onClick={(e) => handleDelete(e, report.id)}
                  disabled={deleting === report.id}
                  title="삭제"
                >
                  {deleting === report.id ? '...' : '\u00D7'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
