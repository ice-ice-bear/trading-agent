import type { AgentEvent } from '../../types';

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

export default function AlertFeed({ events }: Props) {
  const recent = events.slice(-20).reverse();

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
                {new Date(evt.timestamp).toLocaleTimeString('ko-KR')}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
