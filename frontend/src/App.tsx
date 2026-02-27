import { useState, useCallback, useEffect } from 'react';
import type { ChatMessage, Session } from './types';
import { useTheme } from './hooks/useTheme';
import { useSettings } from './hooks/useSettings';
import Sidebar from './components/Sidebar';
import HeaderBar from './components/HeaderBar';
import ChatView from './components/ChatView';
import SettingsView from './components/SettingsView';
import './App.css';

const STORAGE_KEYS = {
  sessions: 'kis-sessions',
  messages: 'kis-messages',
  activeSession: 'kis-active-session',
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
  const [currentView, setCurrentView] = useState<'chat' | 'settings'>('chat');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sessions, setSessions] = useState<Session[]>(
    () => loadFromStorage(STORAGE_KEYS.sessions, DEFAULT_SESSIONS)
  );
  const [activeSessionId, setActiveSessionId] = useState(
    () => loadFromStorage(STORAGE_KEYS.activeSession, 'default')
  );
  const [allMessages, setAllMessages] = useState<Record<string, ChatMessage[]>>(
    () => loadFromStorage(STORAGE_KEYS.messages, {})
  );

  // Persist to localStorage on change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.sessions, JSON.stringify(sessions));
  }, [sessions]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.messages, JSON.stringify(allMessages));
  }, [allMessages]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.activeSession, JSON.stringify(activeSessionId));
  }, [activeSessionId]);

  const activeMessages = allMessages[activeSessionId] ?? [];
  const activeSession = sessions.find((s) => s.id === activeSessionId);

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
    setCurrentView('chat');
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
    if (window.innerWidth <= 768) {
      setSidebarOpen(false);
    }
  }, []);

  const handleDeleteSession = useCallback((id: string) => {
    setSessions((prev) => {
      const filtered = prev.filter((s) => s.id !== id);
      // If deleting the active session, switch to another
      if (id === activeSessionId) {
        if (filtered.length > 0) {
          setActiveSessionId(filtered[0].id);
        } else {
          // No sessions left, create a new default
          const newId = crypto.randomUUID();
          filtered.push({ id: newId, title: '새 대화', messageCount: 0 });
          setActiveSessionId(newId);
        }
      }
      return filtered;
    });
    // Clean up messages for deleted session
    setAllMessages((prev) => {
      const updated = { ...prev };
      delete updated[id];
      return updated;
    });
  }, [activeSessionId]);

  return (
    <div className="app-layout">
      <div
        className={`sidebar-overlay ${sidebarOpen ? 'visible' : ''}`}
        onClick={() => setSidebarOpen(false)}
      />
      <Sidebar
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={handleSelectSession}
        onNewSession={handleNewSession}
        onDeleteSession={handleDeleteSession}
        onOpenSettings={() => setCurrentView('settings')}
        className={sidebarOpen ? 'open' : 'collapsed'}
      />
      <main className="main-content">
        <HeaderBar
          sessionTitle={activeSession?.title ?? '새 대화'}
          onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
          sidebarOpen={sidebarOpen}
          theme={theme}
          onToggleTheme={toggleTheme}
          onOpenSettings={() => setCurrentView('settings')}
          tradingMode={settings.trading_mode}
          onNewChat={handleNewChat}
        />
        {currentView === 'settings' ? (
          <SettingsView
            settings={settings}
            onSave={saveSettings}
            error={settingsError}
            onBack={() => setCurrentView('chat')}
          />
        ) : (
          <ChatView
            sessionId={activeSessionId}
            messages={activeMessages}
            setMessages={setActiveMessages}
            onFirstMessage={handleFirstMessage}
          />
        )}
      </main>
    </div>
  );
}

export default App;
