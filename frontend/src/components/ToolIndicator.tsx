import type { ToolCall } from '../types';

interface Props {
  tool: ToolCall;
}

export default function ToolIndicator({ tool }: Props) {
  return (
    <div className={`tool-indicator ${tool.status}`}>
      <div className="tool-header">
        {tool.status === 'done' ? (
          <svg className="tool-status-icon done" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          <span className="tool-spinner" />
        )}
        <span className="tool-name">{tool.name}</span>
        {tool.input && (
          <span className="tool-api-type">{String(tool.input.api_type ?? '')}</span>
        )}
      </div>
      {tool.status === 'done' && tool.resultPreview && (
        <details className="tool-result-details">
          <summary>결과 보기</summary>
          <pre className="tool-result-preview">{tool.resultPreview}</pre>
        </details>
      )}
    </div>
  );
}
