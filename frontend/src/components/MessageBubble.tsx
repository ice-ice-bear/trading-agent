import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ChatMessage } from '../types';
import ToolIndicator from './ToolIndicator';

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
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
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
      {isUser && (
        <div className="avatar user-avatar">You</div>
      )}
    </div>
  );
}
