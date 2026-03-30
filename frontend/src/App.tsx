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
import StockInfoView from './components/StockInfoView';
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
          ) : currentView === 'stockinfo' ? (
            <StockInfoView />
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
