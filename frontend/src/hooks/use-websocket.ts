import { useEffect, useRef, useState } from 'react';
import type { AgentEvent } from '@/types';

interface UseWebSocketReturn {
  connected: boolean;
  lastEvent: AgentEvent | null;
  events: AgentEvent[];
}

export function useWebSocket(): UseWebSocketReturn {
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<AgentEvent | null>(null);
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    let unmounted = false;

    fetch('/api/agents/events?limit=100')
      .then((r) => r.json())
      .then((payload: { events?: AgentEvent[] }) => {
        if (unmounted || !payload?.events) return;
        const history = [...payload.events].reverse();
        setEvents((prev) => {
          const seen = new Set(prev.map((e) => `${e.timestamp}-${e.event_type}-${e.agent_id}`));
          const merged = [...history.filter((e) => !seen.has(`${e.timestamp}-${e.event_type}-${e.agent_id}`)), ...prev];
          return merged.slice(-100);
        });
      })
      .catch(() => {});

    function connect() {
      if (unmounted) return;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!unmounted) setConnected(true);
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === 'agent_event' && msg.data) {
            const event: AgentEvent = {
              event_type: msg.data.event_type,
              agent_id: msg.data.agent_id,
              data: msg.data.data,
              timestamp: msg.data.timestamp,
            };
            if (!unmounted) {
              setLastEvent(event);
              setEvents((prev) => [...prev.slice(-99), event]);
            }
          }
        } catch {
          // ignore
        }
      };

      ws.onclose = () => {
        if (!unmounted) {
          setConnected(false);
          reconnectTimer.current = setTimeout(connect, 3000);
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    connect();

    return () => {
      unmounted = true;
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, []);

  return { connected, lastEvent, events };
}
