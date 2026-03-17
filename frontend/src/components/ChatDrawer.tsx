import { useState, useRef, useEffect } from 'react';
import type { ChatMessage, Session } from '../types';
import ChatView from './ChatView';
import './ChatDrawer.css';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  sessions: Session[];
  activeSessionId: string;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onDeleteSession: (id: string) => void;
  messages: ChatMessage[];
  setMessages: (updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
  onFirstMessage: (sessionId: string, preview: string) => void;
}

export default function ChatDrawer({
  isOpen,
  onClose,
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  messages,
  setMessages,
  onFirstMessage,
}: Props) {
  const [sessionDropdownOpen, setSessionDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const activeSession = sessions.find((s) => s.id === activeSessionId);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setSessionDropdownOpen(false);
      }
    };
    if (sessionDropdownOpen) {
      document.addEventListener('mousedown', handleClick);
      return () => document.removeEventListener('mousedown', handleClick);
    }
  }, [sessionDropdownOpen]);

  // Keyboard shortcut: Cmd/Ctrl+Shift+C
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'C') {
        e.preventDefault();
        onClose(); // toggles — parent handles the actual toggle
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <aside className={`chat-drawer ${isOpen ? 'open' : ''}`}>
      <div className="chat-drawer-header">
        <div className="chat-drawer-session" ref={dropdownRef}>
          <button
            className="chat-drawer-session-btn"
            onClick={() => setSessionDropdownOpen((prev) => !prev)}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
            </svg>
            <span className="chat-drawer-title">
              {activeSession?.title ?? '새 대화'}
            </span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {sessionDropdownOpen && (
            <div className="chat-drawer-dropdown">
              <button className="chat-drawer-new-btn" onClick={() => { onNewSession(); setSessionDropdownOpen(false); }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                새 대화
              </button>
              <div className="chat-drawer-session-list">
                {sessions.map((session) => (
                  <div
                    key={session.id}
                    className={`chat-drawer-session-item ${session.id === activeSessionId ? 'active' : ''}`}
                  >
                    <button
                      className="chat-drawer-session-item-btn"
                      onClick={() => { onSelectSession(session.id); setSessionDropdownOpen(false); }}
                    >
                      <span>{session.title}</span>
                      {session.messageCount > 0 && (
                        <span className="chat-drawer-msg-count">{session.messageCount}</span>
                      )}
                    </button>
                    <button
                      className="chat-drawer-delete-btn"
                      onClick={(e) => { e.stopPropagation(); onDeleteSession(session.id); }}
                      title="삭제"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <button className="chat-drawer-close" onClick={onClose} title="채팅 닫기">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
      <div className="chat-drawer-body">
        <ChatView
          sessionId={activeSessionId}
          messages={messages}
          setMessages={setMessages}
          onFirstMessage={onFirstMessage}
        />
      </div>
    </aside>
  );
}
