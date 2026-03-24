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
          <div key={i} style={{ display: 'flex', gap: '8px', padding: '4px 0', fontSize: '0.8rem', borderBottom: '1px solid var(--color-border, #e5e7eb)' }}>
            <span style={{ color: typeColor[ev.event_type] || '#6b7280', fontWeight: 600, minWidth: '80px' }}>{ev.event_date}</span>
            <span style={{ flex: 1 }}>{ev.description}</span>
            {ev.stock_code && <span className="mono text-muted">{ev.stock_code}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
