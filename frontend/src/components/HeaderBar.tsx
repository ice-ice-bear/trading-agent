import { useState, useEffect } from 'react';
import { checkHealth } from '../services/api';
import type { AppView } from '../types';

interface Props {
  sessionTitle: string;
  onToggleSidebar: () => void;
  sidebarOpen: boolean;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onOpenSettings: () => void;
  onOpenDashboard: () => void;
  onOpenChat: () => void;
  onOpenReports: () => void;
  onOpenAgents: () => void;
  currentView: AppView;
  tradingMode: 'demo' | 'real';
  onNewChat: () => void;
}

export default function HeaderBar({
  sessionTitle,
  onToggleSidebar,
  sidebarOpen,
  theme,
  onToggleTheme,
  onOpenSettings,
  onOpenDashboard,
  onOpenChat,
  onOpenReports,
  onOpenAgents,
  currentView,
  tradingMode,
  onNewChat,
}: Props) {
  const [health, setHealth] = useState<{
    status: string;
    mcp_connected: boolean;
    mcp_tools_count: number;
  } | null>(null);

  useEffect(() => {
    const fetchHealth = () =>
      checkHealth()
        .then(setHealth)
        .catch(() => setHealth(null));
    fetchHealth();
    const interval = setInterval(fetchHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="header-bar">
      <button
        className="sidebar-toggle-btn"
        onClick={onToggleSidebar}
        title={sidebarOpen ? '사이드바 닫기' : '사이드바 열기'}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      <button
        className="new-chat-header-btn"
        onClick={onNewChat}
        title="새 채팅"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
        </svg>
      </button>

      <div className="header-title">
        <button className="header-brand" onClick={onNewChat} title="새 채팅 시작">
          KIS Trading
        </button>
        <span className="header-session-title">{sessionTitle}</span>
      </div>

      <div className="header-nav-tabs">
        <button
          className={`header-nav-tab ${currentView === 'chat' ? 'active' : ''}`}
          onClick={onOpenChat}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
          </svg>
          Chat
        </button>
        <button
          className={`header-nav-tab ${currentView === 'dashboard' ? 'active' : ''}`}
          onClick={onOpenDashboard}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" />
            <rect x="14" y="3" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" />
          </svg>
          Dashboard
        </button>
        <button
          className={`header-nav-tab ${currentView === 'agents' ? 'active' : ''}`}
          onClick={onOpenAgents}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="5" cy="12" r="2" />
            <circle cx="12" cy="6" r="2" />
            <circle cx="12" cy="18" r="2" />
            <circle cx="19" cy="12" r="2" />
            <line x1="7" y1="12" x2="10" y2="7" />
            <line x1="7" y1="12" x2="10" y2="17" />
            <line x1="14" y1="7" x2="17" y2="11" />
            <line x1="14" y1="17" x2="17" y2="13" />
          </svg>
          Agents
        </button>
        <button
          className={`header-nav-tab ${currentView === 'reports' ? 'active' : ''}`}
          onClick={onOpenReports}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
          Reports
        </button>
      </div>

      <div className="header-right">
        <span className={`trading-mode-badge ${tradingMode}`}>
          <span className="trading-mode-dot" />
          {tradingMode === 'demo' ? '모의투자' : '실전투자'}
        </span>
        <div
          className={`connection-status ${health?.mcp_connected ? 'connected' : 'disconnected'}`}
        >
          <span className="status-dot" />
          <span>{health?.mcp_connected ? 'MCP 연결됨' : '연결 끊김'}</span>
        </div>
        {health?.mcp_tools_count != null && (
          <span className="tools-badge">{health.mcp_tools_count} tools</span>
        )}
        <button
          className="settings-btn"
          onClick={onOpenSettings}
          title="설정"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
          </svg>
        </button>
        <button
          className="theme-toggle-btn"
          onClick={onToggleTheme}
          title={theme === 'light' ? '다크 모드' : '라이트 모드'}
        >
          {theme === 'light' ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" />
              <line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="1" y1="12" x2="3" y2="12" />
              <line x1="21" y1="12" x2="23" y2="12" />
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
          )}
        </button>
      </div>
    </header>
  );
}
