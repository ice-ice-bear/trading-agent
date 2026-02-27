import { useState } from 'react';
import type { ToolCall } from '../types';

interface Props {
  tool: ToolCall;
}

export default function ToolIndicator({ tool }: Props) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`tool-indicator ${tool.status}`} onClick={() => setExpanded((p) => !p)}>
      <div className="tool-timeline-dot" />
      <div className="tool-header">
        {tool.status === 'done' ? (
          <svg
            className="tool-status-icon done"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          <span className="tool-spinner" />
        )}
        <span className="tool-name">{tool.name}</span>
        {tool.input && 'api_type' in tool.input && tool.input.api_type ? (
          <span className="tool-api-type">{String(tool.input.api_type)}</span>
        ) : null}
        <svg
          className={`tool-expand-icon ${expanded ? 'expanded' : ''}`}
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>

      {expanded && tool.input && (
        <div className="tool-input-params">
          {Object.entries(tool.input)
            .filter(([k]) => k !== 'api_type')
            .map(([key, value]) => (
              <div key={key} className="tool-param">
                <span className="tool-param-key">{key}:</span>
                <span className="tool-param-value">{JSON.stringify(value)}</span>
              </div>
            ))}
        </div>
      )}

      {expanded && tool.status === 'done' && tool.resultPreview && (
        <div className="tool-result-details">
          <pre className="tool-result-preview">{tool.resultPreview}</pre>
        </div>
      )}
    </div>
  );
}
