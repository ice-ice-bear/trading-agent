# Dashboard-First Layout Refactor — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the trading app UI from tab-based full-page view switching to a dashboard-first layout with vertical icon rail navigation and a push/split chat drawer.

**Architecture:** Replace the horizontal header nav tabs and full-page chat view with two new components: `IconRail` (left-edge vertical nav) and `ChatDrawer` (right-side push/split panel wrapping existing ChatView). The layout orchestration lives directly in `App.tsx` rather than a separate `AppLayout.tsx` — the spec names `AppLayout` as a component, but since `App.tsx` already manages all layout state, a wrapper adds no value. The header simplifies to brand + status only. Dashboard becomes the default landing view.

**Tech Stack:** React 19, TypeScript, CSS custom properties (plain CSS, no Tailwind), inline SVGs for icons.

**Spec:** `docs/superpowers/specs/2026-03-17-dashboard-first-layout-design.md`

---

### Task 1: Update AppView type and state foundations

**Files:**
- Modify: `frontend/src/types.ts:173` — remove `'chat'` from AppView union
- Modify: `frontend/src/App.tsx:14-18` — add `kis-chat-open` storage key
- Modify: `frontend/src/App.tsx:36-37` — add `isChatOpen` state, remove `sidebarOpen`

- [ ] **Step 1: Update AppView type**

In `frontend/src/types.ts`, change line 173:
```typescript
// Before:
export type AppView = 'chat' | 'settings' | 'dashboard' | 'agents' | 'reports';

// After:
export type AppView = 'settings' | 'dashboard' | 'agents' | 'reports';
```

- [ ] **Step 2: Update STORAGE_KEYS and state in App.tsx**

In `frontend/src/App.tsx`, update the storage keys and state:
```typescript
const STORAGE_KEYS = {
  sessions: 'kis-sessions',
  messages: 'kis-messages',
  activeSession: 'kis-active-session',
  chatOpen: 'kis-chat-open',
};
```

Replace `sidebarOpen` state (line 37) with:
```typescript
const [isChatOpen, setIsChatOpen] = useState(
  () => loadFromStorage(STORAGE_KEYS.chatOpen, false)
);
```

Add persistence effect:
```typescript
useEffect(() => {
  localStorage.setItem(STORAGE_KEYS.chatOpen, JSON.stringify(isChatOpen));
}, [isChatOpen]);
```

- [ ] **Step 3: Fix all `'chat'` references in App.tsx**

Update `handleNewChat` (line 88-91):
```typescript
const handleNewChat = useCallback(() => {
  handleNewSession();
  setIsChatOpen(true);
}, [handleNewSession]);
```

Update `handleSelectSession` (line 101-106):
```typescript
const handleSelectSession = useCallback((id: string) => {
  setActiveSessionId(id);
}, []);
```

Update Settings `onBack` (line 176):
```typescript
onBack={() => setCurrentView('dashboard')}
```

Remove the chat view branch from the view dispatcher (lines 184-190 — the `else` clause rendering `<ChatView>`).

- [ ] **Step 4: Verify TypeScript compiles without errors**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors (some warnings about unused imports are OK at this stage — Sidebar and ChatView imports will be rewired in later tasks).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/types.ts frontend/src/App.tsx
git commit -m "refactor: remove 'chat' from AppView, add isChatOpen state"
```

---

### Task 2: Create IconRail component

**Files:**
- Create: `frontend/src/components/IconRail.tsx`
- Create: `frontend/src/components/IconRail.css`

- [ ] **Step 1: Create IconRail.tsx**

```tsx
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
```

- [ ] **Step 2: Create IconRail.css**

```css
.icon-rail {
  width: 56px;
  background: var(--rail-bg, var(--color-sidebar));
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-2) 0;
  flex-shrink: 0;
  border-right: 1px solid var(--color-border);
  z-index: 50;
}

.icon-rail-top,
.icon-rail-bottom {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.icon-rail-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  background: transparent;
  color: var(--rail-text, var(--color-sidebar-text-muted));
  border: none;
  border-radius: var(--radius-md);
  cursor: pointer;
  position: relative;
  transition: all var(--transition-fast);
}

.icon-rail-btn:hover {
  background: var(--color-sidebar-hover);
  color: var(--color-text-inverse);
}

.icon-rail-btn.active {
  color: var(--color-primary);
  background: var(--color-sidebar-active);
}

.icon-rail-btn.active::before {
  content: '';
  position: absolute;
  left: -8px;
  top: 8px;
  bottom: 8px;
  width: 3px;
  background: var(--color-primary);
  border-radius: 0 2px 2px 0;
}

/* Responsive: icon rail becomes bottom tab bar on tablet/mobile */
@media (max-width: 1024px) {
  .icon-rail {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    width: 100%;
    height: 56px;
    flex-direction: row;
    justify-content: center;
    padding: 0 var(--space-3);
    border-right: none;
    border-top: 1px solid var(--color-border);
    z-index: 100;
  }

  .icon-rail-top,
  .icon-rail-bottom {
    flex-direction: row;
    gap: var(--space-2);
  }

  .icon-rail-btn.active::before {
    left: 8px;
    right: 8px;
    top: -8px;
    bottom: auto;
    width: auto;
    height: 3px;
    border-radius: 0 0 2px 2px;
  }
}
```

- [ ] **Step 3: Verify file renders in isolation**

Run: `cd frontend && npx tsc --noEmit`
Expected: Compiles without errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/IconRail.tsx frontend/src/components/IconRail.css
git commit -m "feat: add IconRail vertical navigation component"
```

---

### Task 3: Create ChatDrawer component

**Files:**
- Create: `frontend/src/components/ChatDrawer.tsx`
- Create: `frontend/src/components/ChatDrawer.css`

- [ ] **Step 1: Create ChatDrawer.tsx**

```tsx
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
```

- [ ] **Step 2: Create ChatDrawer.css**

```css
:root {
  --chat-drawer-width: 380px;
}

.chat-drawer {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: var(--chat-drawer-width);
  background: var(--color-bg);
  border-left: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  transform: translateX(100%);
  transition: transform var(--transition-normal);
  z-index: 90;
}

.chat-drawer.open {
  transform: translateX(0);
}

.chat-drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--color-border);
  min-height: 48px;
  flex-shrink: 0;
}

.chat-drawer-session {
  position: relative;
  flex: 1;
  min-width: 0;
}

.chat-drawer-session-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  background: none;
  border: none;
  color: var(--color-text);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  max-width: 100%;
}

.chat-drawer-session-btn:hover {
  background: var(--color-hover);
}

.chat-drawer-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-drawer-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: none;
  border: none;
  color: var(--color-text-secondary);
  cursor: pointer;
  border-radius: var(--radius-sm);
  flex-shrink: 0;
}

.chat-drawer-close:hover {
  background: var(--color-hover);
  color: var(--color-text);
}

/* Session dropdown */
.chat-drawer-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: 4px;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  max-height: 300px;
  overflow-y: auto;
  z-index: 200;
}

.chat-drawer-new-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 12px;
  background: none;
  border: none;
  border-bottom: 1px solid var(--color-border);
  color: var(--color-primary);
  font-size: 13px;
  cursor: pointer;
}

.chat-drawer-new-btn:hover {
  background: var(--color-hover);
}

.chat-drawer-session-list {
  padding: 4px 0;
}

.chat-drawer-session-item {
  display: flex;
  align-items: center;
  padding: 0 4px;
}

.chat-drawer-session-item.active {
  background: var(--color-hover);
}

.chat-drawer-session-item-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 8px;
  background: none;
  border: none;
  color: var(--color-text);
  font-size: 12px;
  cursor: pointer;
  text-align: left;
  min-width: 0;
}

.chat-drawer-session-item-btn span:first-child {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-drawer-msg-count {
  font-size: 11px;
  color: var(--color-text-secondary);
  flex-shrink: 0;
}

.chat-drawer-delete-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  background: none;
  border: none;
  color: var(--color-text-secondary);
  cursor: pointer;
  border-radius: var(--radius-sm);
  opacity: 0;
  flex-shrink: 0;
}

.chat-drawer-session-item:hover .chat-drawer-delete-btn {
  opacity: 1;
}

.chat-drawer-delete-btn:hover {
  background: var(--color-danger-bg);
  color: var(--color-danger);
}

.chat-drawer-body {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* Override ChatView styles inside drawer */
.chat-drawer-body .chat-view {
  height: 100%;
}

/* Responsive */
@media (max-width: 768px) {
  .chat-drawer {
    width: 100%;
  }
}

@media (min-width: 769px) and (max-width: 1024px) {
  .chat-drawer {
    width: min(380px, 50vw);
  }
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: Compiles without errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ChatDrawer.tsx frontend/src/components/ChatDrawer.css
git commit -m "feat: add ChatDrawer push/split panel component"
```

---

### Task 4: Simplify HeaderBar and wire everything together in App.tsx

**Files:**
- Modify: `frontend/src/components/HeaderBar.tsx` — remove nav tabs, sidebar toggle, new chat button
- Modify: `frontend/src/App.tsx` — replace layout with IconRail + simplified HeaderBar + ChatDrawer
- Modify: `frontend/src/App.css` — add layout grid styles, push/split margin transition

- [ ] **Step 1: Rewrite HeaderBar.tsx**

Replace the entire content of `frontend/src/components/HeaderBar.tsx` with:

```tsx
import { useState, useEffect } from 'react';
import { checkHealth } from '../services/api';

interface Props {
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onOpenSettings: () => void;
  tradingMode: 'demo' | 'real';
}

export default function HeaderBar({
  theme,
  onToggleTheme,
  onOpenSettings,
  tradingMode,
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
      <div className="header-title">
        <span className="header-brand">KIS Trading</span>
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
```

- [ ] **Step 2: Rewrite App.tsx imports and layout**

Replace the full `frontend/src/App.tsx` with the new wiring (this must happen in the same task as HeaderBar changes to avoid a broken compile):

```tsx
import { useState, useCallback, useEffect } from 'react';
import type { ChatMessage, Session, AppView } from './types';
import { useTheme } from './hooks/useTheme';
import { useSettings } from './hooks/useSettings';
import IconRail from './components/IconRail';
import HeaderBar from './components/HeaderBar';
import ChatDrawer from './components/ChatDrawer';
import SettingsView from './components/SettingsView';
import DashboardView from './components/DashboardView';
import ReportViewer from './components/ReportViewer';
import AgentWorkflow from './components/AgentWorkflow';
import './App.css';

const STORAGE_KEYS = {
  sessions: 'kis-sessions',
  messages: 'kis-messages',
  activeSession: 'kis-active-session',
  chatOpen: 'kis-chat-open',
};

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

const DEFAULT_SESSIONS: Session[] = [
  { id: 'default', title: '새 대화', messageCount: 0 },
];

function App() {
  const { theme, toggleTheme } = useTheme();
  const { settings, saveSettings, error: settingsError } = useSettings();
  const [currentView, setCurrentView] = useState<AppView>('dashboard');
  const [isChatOpen, setIsChatOpen] = useState(
    () => loadFromStorage(STORAGE_KEYS.chatOpen, false)
  );
  const [sessions, setSessions] = useState<Session[]>(
    () => loadFromStorage(STORAGE_KEYS.sessions, DEFAULT_SESSIONS)
  );
  const [activeSessionId, setActiveSessionId] = useState(
    () => loadFromStorage(STORAGE_KEYS.activeSession, 'default')
  );
  const [allMessages, setAllMessages] = useState<Record<string, ChatMessage[]>>(
    () => loadFromStorage(STORAGE_KEYS.messages, {})
  );

  // Persist to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.sessions, JSON.stringify(sessions));
  }, [sessions]);
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.messages, JSON.stringify(allMessages));
  }, [allMessages]);
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.activeSession, JSON.stringify(activeSessionId));
  }, [activeSessionId]);
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.chatOpen, JSON.stringify(isChatOpen));
  }, [isChatOpen]);

  const activeMessages = allMessages[activeSessionId] ?? [];

  const setActiveMessages = useCallback(
    (updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => {
      setAllMessages((prev) => {
        const current = prev[activeSessionId] ?? [];
        const next = typeof updater === 'function' ? updater(current) : updater;
        setSessions((s) =>
          s.map((sess) =>
            sess.id === activeSessionId
              ? { ...sess, messageCount: next.filter((m) => m.role === 'user').length }
              : sess
          )
        );
        return { ...prev, [activeSessionId]: next };
      });
    },
    [activeSessionId]
  );

  const handleNewSession = useCallback(() => {
    const id = crypto.randomUUID();
    setSessions((prev) => [{ id, title: '새 대화', messageCount: 0 }, ...prev]);
    setActiveSessionId(id);
  }, []);

  const handleNewChat = useCallback(() => {
    handleNewSession();
    setIsChatOpen(true);
  }, [handleNewSession]);

  const handleFirstMessage = useCallback((sessionId: string, preview: string) => {
    setSessions((prev) =>
      prev.map((s) =>
        s.id === sessionId ? { ...s, title: preview || '새 대화' } : s
      )
    );
  }, []);

  const handleSelectSession = useCallback((id: string) => {
    setActiveSessionId(id);
  }, []);

  const handleDeleteSession = useCallback((id: string) => {
    setSessions((prev) => {
      const filtered = prev.filter((s) => s.id !== id);
      if (id === activeSessionId) {
        if (filtered.length > 0) {
          setActiveSessionId(filtered[0].id);
        } else {
          const newId = crypto.randomUUID();
          filtered.push({ id: newId, title: '새 대화', messageCount: 0 });
          setActiveSessionId(newId);
        }
      }
      return filtered;
    });
    setAllMessages((prev) => {
      const updated = { ...prev };
      delete updated[id];
      return updated;
    });
  }, [activeSessionId]);

  const handleChatToggle = useCallback(() => {
    setIsChatOpen((prev) => !prev);
  }, []);

  return (
    <div className="app-layout">
      <IconRail
        currentView={currentView}
        onViewChange={setCurrentView}
        isChatOpen={isChatOpen}
        onChatToggle={handleChatToggle}
        onOpenSettings={() => setCurrentView('settings')}
      />
      <div className={`app-main ${isChatOpen ? 'chat-open' : ''}`}>
        <HeaderBar
          theme={theme}
          onToggleTheme={toggleTheme}
          onOpenSettings={() => setCurrentView('settings')}
          tradingMode={settings.trading_mode}
        />
        <div className="view-content">
          {currentView === 'settings' ? (
            <SettingsView
              settings={settings}
              onSave={saveSettings}
              error={settingsError}
              onBack={() => setCurrentView('dashboard')}
            />
          ) : currentView === 'dashboard' ? (
            <DashboardView />
          ) : currentView === 'reports' ? (
            <ReportViewer />
          ) : currentView === 'agents' ? (
            <AgentWorkflow />
          ) : null}
        </div>
      </div>
      <ChatDrawer
        isOpen={isChatOpen}
        onClose={handleChatToggle}
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={handleSelectSession}
        onNewSession={handleNewChat}
        onDeleteSession={handleDeleteSession}
        messages={activeMessages}
        setMessages={setActiveMessages}
        onFirstMessage={handleFirstMessage}
      />
    </div>
  );
}

export default App;
```

- [ ] **Step 3: Update App.css layout styles**

Add the following at the top of `frontend/src/App.css`, replacing the existing `.app-layout` rule:

```css
/* ===== Layout ===== */
.app-layout {
  display: flex;
  height: 100vh;
  overflow: hidden;
  position: relative;
}

.app-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  transition: margin-right var(--transition-normal);
}

.app-main.chat-open {
  margin-right: var(--chat-drawer-width, 380px);
}

.view-content {
  flex: 1;
  overflow-y: auto;
}

/* Responsive overrides */
@media (max-width: 1024px) {
  .app-main.chat-open {
    margin-right: 0; /* drawer overlays on tablet */
  }

  .app-main {
    padding-bottom: 56px; /* space for bottom tab bar */
  }
}
```

Remove or comment out the old `.sidebar`, `.sidebar-overlay`, `.sidebar-toggle-btn`, `.new-chat-header-btn`, `.header-nav-tabs`, `.header-nav-tab` CSS rules from App.css since those components are no longer used.

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: Compiles without errors.

- [ ] **Step 5: Verify the app loads in browser**

Run: Open `http://localhost:5174` in browser.
Expected: Dashboard loads as default view. Icon rail visible on left. Click chat icon → drawer slides in from right, pushing dashboard left. Click close → drawer slides out, dashboard expands back.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/HeaderBar.tsx frontend/src/App.tsx frontend/src/App.css
git commit -m "feat: wire up new layout — IconRail + ChatDrawer + simplified HeaderBar"
```

---

### Task 5: Clean up removed components and dead CSS

**Files:**
- Delete: `frontend/src/components/Sidebar.tsx`
- Modify: `frontend/src/App.css` — remove dead sidebar/header-nav CSS rules

- [ ] **Step 1: Delete Sidebar.tsx**

```bash
rm frontend/src/components/Sidebar.tsx
```

- [ ] **Step 2: Remove dead CSS from App.css**

Remove all CSS rules for these selectors from `frontend/src/App.css`:
- `.sidebar`, `.sidebar-header`, `.sidebar-logo`, `.sidebar-footer`
- `.sidebar-nav-link`, `.sidebar-settings-btn`
- `.sidebar-overlay`
- `.new-chat-btn`, `.new-chat-header-btn`
- `.session-list`, `.session-item`, `.session-item-btn`, `.session-icon`, `.session-title`, `.session-count`, `.session-delete-btn`
- `.sidebar-toggle-btn`
- `.header-nav-tabs`, `.header-nav-tab`

Keep all other CSS rules (header-bar, messages, chat-view, dashboard, etc.).

- [ ] **Step 3: Verify no import errors**

Run: `cd frontend && npx tsc --noEmit`
Expected: No references to Sidebar remain. Compiles cleanly.

- [ ] **Step 4: Run lint**

Run: `cd frontend && npm run lint`
Expected: No errors (some warnings may remain for pre-existing issues).

- [ ] **Step 5: Commit**

```bash
git add -A frontend/src/components/Sidebar.tsx frontend/src/App.css
git commit -m "chore: remove Sidebar component and dead CSS"
```

---

### Task 6: Visual verification and polish

**Files:**
- Possibly modify: `frontend/src/App.css`, `frontend/src/components/IconRail.css`, `frontend/src/components/ChatDrawer.css`

- [ ] **Step 1: Verify Dashboard view renders correctly**

Open `http://localhost:5174`. Expected: Dashboard is the default view with icon rail on the left, slim header on top, full-width content area.

- [ ] **Step 2: Verify chat drawer open/close**

Click the chat icon (bottom of icon rail). Expected: Chat drawer slides in from the right (~380px), dashboard content area shrinks by the same amount. Click × on drawer → it slides out, dashboard expands back.

- [ ] **Step 3: Verify view navigation**

Click Dashboard, Agents, Reports icons in the rail. Expected: Each view loads in the main content area. Active icon shows highlight bar on left edge. Chat drawer stays open/closed independent of view changes.

- [ ] **Step 4: Verify session management in drawer**

Click session dropdown in drawer header. Expected: Session list dropdown appears. Can create new sessions, switch sessions, delete sessions. Dropdown auto-closes on selection.

- [ ] **Step 5: Verify keyboard shortcut**

Press Cmd+Shift+C (Mac). Expected: Chat drawer toggles open/closed.

- [ ] **Step 6: Fix any visual issues found**

Apply CSS adjustments as needed for spacing, colors, alignment. Focus on:
- Header height (~48px)
- Icon rail width (56px)
- Chat drawer width (380px)
- Smooth transition on open/close

- [ ] **Step 7: Commit fixes**

```bash
git add -A frontend/src/
git commit -m "fix: visual polish for new layout"
```

---

### Task 7: Responsive testing

**Files:**
- Possibly modify: `frontend/src/components/IconRail.css`, `frontend/src/components/ChatDrawer.css`, `frontend/src/App.css`

- [ ] **Step 1: Test tablet viewport (768-1024px)**

Resize browser to ~900px width. Expected: Icon rail becomes bottom tab bar. Chat drawer overlays instead of pushing.

- [ ] **Step 2: Test mobile viewport (<768px)**

Resize browser to ~375px width. Expected: Bottom tab bar navigation. Chat opens as full-screen overlay.

- [ ] **Step 3: Fix responsive issues**

Apply CSS adjustments as needed.

- [ ] **Step 4: Commit**

```bash
git add -A frontend/src/
git commit -m "fix: responsive layout for tablet and mobile viewports"
```
