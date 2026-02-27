import { useState, useRef, useEffect, useCallback } from 'react';
import type { ChatMessage, ToolCall } from '../types';
import { sendMessage } from '../services/api';
import MessageBubble from './MessageBubble';

interface Props {
  sessionId: string;
  messages: ChatMessage[];
  setMessages: (updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
  onFirstMessage: (sessionId: string, preview: string) => void;
}

export default function ChatView({ sessionId, messages, setMessages, onFirstMessage }: Props) {
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback((smooth = true) => {
    if (smooth) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    } else {
      messagesEndRef.current?.scrollIntoView({ behavior: 'instant' });
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Focus input on session switch
  useEffect(() => {
    inputRef.current?.focus();
  }, [sessionId]);

  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    setShowScrollBtn(scrollHeight - scrollTop - clientHeight > 200);
  }, []);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: trimmed,
      timestamp: Date.now(),
    };

    if (messages.length === 0) {
      onFirstMessage(sessionId, trimmed.slice(0, 30));
    }

    const assistantMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      toolCalls: [],
      isStreaming: true,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput('');
    setIsStreaming(true);

    const abortController = new AbortController();
    abortRef.current = abortController;

    try {
      await sendMessage(trimmed, sessionId, {
        onTextDelta(text) {
          setMessages((prev) => {
            const updated = [...prev];
            const last = { ...updated[updated.length - 1] };
            last.content += text;
            updated[updated.length - 1] = last;
            return updated;
          });
        },

        onToolStart(toolName, toolId) {
          setMessages((prev) => {
            const updated = [...prev];
            const last = { ...updated[updated.length - 1] };
            const newTool: ToolCall = { id: toolId, name: toolName, status: 'started' };
            last.toolCalls = [...(last.toolCalls || []), newTool];
            updated[updated.length - 1] = last;
            return updated;
          });
        },

        onToolExecuting(_toolName, toolId, toolInput) {
          setMessages((prev) => {
            const updated = [...prev];
            const last = { ...updated[updated.length - 1] };
            last.toolCalls = (last.toolCalls || []).map((t) =>
              t.id === toolId ? { ...t, status: 'executing' as const, input: toolInput } : t
            );
            updated[updated.length - 1] = last;
            return updated;
          });
        },

        onToolResult(_toolName, toolId, resultPreview) {
          setMessages((prev) => {
            const updated = [...prev];
            const last = { ...updated[updated.length - 1] };
            last.toolCalls = (last.toolCalls || []).map((t) =>
              t.id === toolId
                ? { ...t, status: 'done' as const, resultPreview }
                : t
            );
            updated[updated.length - 1] = last;
            return updated;
          });
        },

        onDone() {
          setMessages((prev) => {
            const updated = [...prev];
            const last = { ...updated[updated.length - 1] };
            last.isStreaming = false;
            updated[updated.length - 1] = last;
            return updated;
          });
          setIsStreaming(false);
        },

        onError(error) {
          setMessages((prev) => {
            const updated = [...prev];
            const last = { ...updated[updated.length - 1] };
            last.content += `\n\n오류가 발생했습니다: ${error}`;
            last.isStreaming = false;
            updated[updated.length - 1] = last;
            return updated;
          });
          setIsStreaming(false);
        },
      }, abortController);
    } catch {
      setIsStreaming(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="chat-view">
      <div className="messages-container" ref={containerRef} onScroll={handleScroll}>
        {messages.length === 0 && (
          <div className="welcome">
            <div className="welcome-orb" />
            <h2>KIS Trading Assistant</h2>
            <p>한국투자증권 모의투자 AI 어시스턴트입니다.<br />주식 시세 조회, 매매 주문, 잔고 확인 등을 도와드립니다.</p>
            <div className="suggestions">
              <button onClick={() => setInput('삼성전자 현재가 알려줘')}>
                삼성전자 현재가
              </button>
              <button onClick={() => setInput('잔고 조회해줘')}>
                잔고 조회
              </button>
              <button onClick={() => setInput('거래량 상위 종목 알려줘')}>
                거래량 상위 종목
              </button>
              <button onClick={() => setInput('코스피 등락률 순위')}>
                등락률 순위
              </button>
            </div>
          </div>
        )}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        <div ref={messagesEndRef} />
        {showScrollBtn && (
          <button className="scroll-to-bottom-btn" onClick={() => scrollToBottom(false)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        )}
      </div>

      <div className="input-bar">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="메시지를 입력하세요..."
          rows={1}
          disabled={isStreaming}
        />
        <button
          className="send-btn"
          onClick={handleSend}
          disabled={isStreaming || !input.trim()}
        >
          {isStreaming ? (
            <span className="send-loading" />
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
