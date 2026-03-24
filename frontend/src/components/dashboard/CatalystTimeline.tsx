import { useState, useEffect } from 'react';
import { getCatalystEvents } from '../../services/api';

interface CatalystEvent {
  stock_code: string | null;
  event_type: string;
  event_date: string;
  description: string;
  source: string;
}

export default function CatalystTimeline() {
  const [events, setEvents] = useState<CatalystEvent[]>([]);

  useEffect(() => {
    getCatalystEvents(undefined, 60).then(res => setEvents(res.events)).catch(() => {});
  }, []);

  if (events.length === 0) return null;

  const typeColor: Record<string, string> = {
    earnings: '#f59e0b',
    disclosure: '#3b82f6',
    calendar: '#6b7280',
  };

  return (
    <div className="card">
      <div className="card-header"><h3>촉매 일정</h3></div>
      <div className="card-body" style={{ maxHeight: '200px', overflow: 'auto' }}>
        {events.map((ev, i) => (
          <div key={i} className="catalyst-entry">
            <span className="catalyst-date" style={{ color: typeColor[ev.event_type] || 'var(--color-text-secondary)' }}>{ev.event_date}</span>
            <span className="catalyst-desc">{ev.description}</span>
            {ev.stock_code && <span className="mono text-muted">{ev.stock_code}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
