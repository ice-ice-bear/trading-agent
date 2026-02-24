import { useState, useCallback } from 'react';
import type { ChatMessage, Session } from './types';
import Sidebar from './components/Sidebar';
import ChatView from './components/ChatView';
import './App.css';

function App() {
  const [sessions, setSessions] = useState<Session[]>([
    { id: 'default', title: '새 대화', messageCount: 0 },
  ]);
  const [activeSessionId, setActiveSessionId] = useState('default');
  // Lifted state: messages persist across session switches
  const [allMessages, setAllMessages] = useState<Record<string, ChatMessage[]>>({});

  const activeMessages = allMessages[activeSessionId] ?? [];

  const setActiveMessages = useCallback(
    (updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => {
      setAllMessages((prev) => {
        const current = prev[activeSessionId] ?? [];
        const next = typeof updater === 'function' ? updater(current) : updater;
        // Update message count in sessions
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

  const handleFirstMessage = useCallback((sessionId: string, preview: string) => {
    setSessions((prev) =>
      prev.map((s) =>
        s.id === sessionId ? { ...s, title: preview || '새 대화' } : s
      )
    );
  }, []);

  return (
    <div className="app-layout">
      <Sidebar
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={setActiveSessionId}
        onNewSession={handleNewSession}
      />
      <main className="main-content">
        <ChatView
          sessionId={activeSessionId}
          messages={activeMessages}
          setMessages={setActiveMessages}
          onFirstMessage={handleFirstMessage}
        />
      </main>
    </div>
  );
}

export default App;
