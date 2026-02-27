import { useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import type { ChatMessage } from '../types';
import ToolIndicator from './ToolIndicator';

const TRADING_HEADERS = ['종목', '현재가', '등락률', '거래량', '시가', '고가', '저가', '전일비', '순위'];

function CodeBlock({ children, ...props }: React.HTMLAttributes<HTMLPreElement>) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    // Extract text from the <code> element inside <pre>
    const el = children as React.ReactElement<{ children?: React.ReactNode }> | undefined;
    const text = el?.props?.children ?? '';
    navigator.clipboard.writeText(String(text));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [children]);

  return (
    <div className="code-block-wrapper">
      <button className="copy-code-btn" onClick={handleCopy} type="button">
        {copied ? '복사됨!' : '복사'}
      </button>
      <pre {...props}>{children}</pre>
    </div>
  );
}

function SmartTable({ children, ...props }: React.HTMLAttributes<HTMLTableElement>) {
  let isTradingTable = false;

  try {
    const headerText = JSON.stringify(children);
    isTradingTable = TRADING_HEADERS.some((h) => headerText.includes(h));
  } catch {
    // fallback to default
  }

  if (isTradingTable) {
    return (
      <div className="trading-table-wrapper">
        <table className="trading-table" {...props}>{children}</table>
      </div>
    );
  }
  return <table {...props}>{children}</table>;
}

interface Props {
  message: ChatMessage;
}

export default function MessageBubble({ message }: Props) {
  const isUser = message.role === 'user';

  return (
    <div className={`message-row ${isUser ? 'user' : 'assistant'}`}>
      {!isUser && (
        <div className="avatar assistant-avatar">AI</div>
      )}
      <div>
        <div className={`message-bubble ${isUser ? 'user' : 'assistant'}`}>
          {message.toolCalls && message.toolCalls.length > 0 && (
            <div className="tool-calls">
              {message.toolCalls.map((tool) => (
                <ToolIndicator key={tool.id} tool={tool} />
              ))}
            </div>
          )}

          <div className="message-content">
            {isUser ? (
              <p>{message.content}</p>
            ) : message.content ? (
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeHighlight]}
                components={{ pre: CodeBlock, table: SmartTable }}
              >
                {message.content}
              </ReactMarkdown>
            ) : null}
            {message.isStreaming && !message.content && (
              <div className="typing-indicator">
                <span /><span /><span />
              </div>
            )}
            {message.isStreaming && message.content && (
              <span className="cursor-blink" />
            )}
          </div>
        </div>
        {message.timestamp && (
          <div className="message-timestamp">
            {new Date(message.timestamp).toLocaleTimeString('ko-KR', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </div>
        )}
      </div>
      {isUser && (
        <div className="avatar user-avatar">You</div>
      )}
    </div>
  );
}
