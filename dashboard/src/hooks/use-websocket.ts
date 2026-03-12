import { useEffect, useRef } from 'react';
import { useTaskStore } from '../stores/task-store';

const WS_TOKEN = import.meta.env.VITE_WS_TOKEN ?? 'change-me-to-a-random-string';

export function useWebSocket() {
  const applyEvent = useTaskStore((s) => s.applyEvent);
  const wsRef = useRef<WebSocket | null>(null);
  const retriesRef = useRef(0);

  useEffect(() => {
    let unmounted = false;

    function connect() {
      if (unmounted) return;

      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const host = window.location.host; // includes port of current page
      // Route through Vite proxy (/ws) so only the dashboard port needs to be open
      const ws = new WebSocket(`${protocol}://${host}/ws?token=${WS_TOKEN}`);
      wsRef.current = ws;

      ws.onopen = () => {
        retriesRef.current = 0;
      };

      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);
          if (data.type?.startsWith('task:') || data.type?.startsWith('agent:')) {
            applyEvent(data);
          }
        } catch {
          // Ignore malformed messages
        }
      };

      ws.onclose = () => {
        if (unmounted) return;
        const delay = Math.min(1000 * 2 ** retriesRef.current, 30000);
        retriesRef.current++;
        setTimeout(connect, delay);
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    connect();

    return () => {
      unmounted = true;
      wsRef.current?.close();
    };
  }, [applyEvent]);
}
