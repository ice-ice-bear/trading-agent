import { useEffect, useState } from 'react';
import type { AgentEvent } from '../../types';
import { getAgentEvents } from '../../services/api';
import { parseUTC } from '../../utils/time';

interface Props {
  events: AgentEvent[];
}

const EVENT_ICONS: Record<string, string> = {
  'risk.stop_loss': '!',
  'risk.take_profit': '$',
  'signal.generated': '~',
  'signal.approved': '+',
  'signal.rejected': '-',
  'order.submitted': '>',
  'order.filled': 'v',
  'portfolio.updated': 'i',
  'report.generated': '#',
};

export default function AlertFeed({ events: liveEvents }: Props) {
  const [persistedEvents, setPersistedEvents] = useState<AgentEvent[]>([]);

  useEffect(() => {
    getAgentEvents(50)
      .then((data) => setPersistedEvents(data.events))
      .catch(console.error);
  }, []);

  // Merge: persisted (oldest first) + live events, dedup by timestamp+type
  const seen = new Set<string>();
  const merged: AgentEvent[] = [];
  for (const evt of [...persistedEvents, ...liveEvents]) {
    const key = `${evt.timestamp}:${evt.event_type}:${evt.agent_id}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(evt);
    }
  }

  const recent = merged.slice(-30).reverse();

  return (
    <div className="dashboard-card alert-feed">
      <h3 className="card-title">Events</h3>
      {recent.length === 0 ? (
        <div className="empty-state">No events yet</div>
      ) : (
        <div className="event-list">
          {recent.map((evt, i) => (
            <div key={i} className={`event-item event-${evt.event_type.split('.')[0]}`}>
              <span className="event-icon">[{EVENT_ICONS[evt.event_type] ?? '?'}]</span>
              <span className="event-type">{evt.event_type}</span>
              <span className="event-agent">{evt.agent_id}</span>
              <span className="event-time">
                {parseUTC(evt.timestamp).toLocaleTimeString('ko-KR')}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
