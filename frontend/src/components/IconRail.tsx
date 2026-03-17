import type { AppView } from '../types';
import './IconRail.css';

interface Props {
  currentView: AppView;
  onViewChange: (view: AppView) => void;
  isChatOpen: boolean;
  onChatToggle: () => void;
  onOpenSettings: () => void;
}

export default function IconRail({
  currentView,
  onViewChange,
  isChatOpen,
  onChatToggle,
  onOpenSettings,
}: Props) {
  return (
    <nav className="icon-rail" aria-label="Main navigation">
      <div className="icon-rail-top">
        <button
          className={`icon-rail-btn ${currentView === 'dashboard' ? 'active' : ''}`}
          onClick={() => onViewChange('dashboard')}
          title="대시보드"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" />
            <rect x="14" y="3" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" />
          </svg>
        </button>
        <button
          className={`icon-rail-btn ${currentView === 'agents' ? 'active' : ''}`}
          onClick={() => onViewChange('agents')}
          title="에이전트"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="5" cy="12" r="2" />
            <circle cx="12" cy="6" r="2" />
            <circle cx="12" cy="18" r="2" />
            <circle cx="19" cy="12" r="2" />
            <line x1="7" y1="12" x2="10" y2="7" />
            <line x1="7" y1="12" x2="10" y2="17" />
            <line x1="14" y1="7" x2="17" y2="11" />
            <line x1="14" y1="17" x2="17" y2="13" />
          </svg>
        </button>
        <button
          className={`icon-rail-btn ${currentView === 'reports' ? 'active' : ''}`}
          onClick={() => onViewChange('reports')}
          title="리포트"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
        </button>
      </div>
      <div className="icon-rail-bottom">
        <button
          className={`icon-rail-btn ${isChatOpen ? 'active' : ''}`}
          onClick={onChatToggle}
          title="채팅"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
          </svg>
        </button>
        <button
          className={`icon-rail-btn ${currentView === 'settings' ? 'active' : ''}`}
          onClick={onOpenSettings}
          title="설정"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
          </svg>
        </button>
      </div>
    </nav>
  );
}
