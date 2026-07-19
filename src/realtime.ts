import { useCallback, useEffect, useRef, useState } from 'react';

export interface RealtimeChannel {
  connected: boolean;
  /** Broadcast an ephemeral event to everyone else in the group (e.g. "typing"). */
  send: (data: unknown) => void;
}

/**
 * Subscribe to a group (room/board code) via Azure Web PubSub. `onMessage` runs
 * for each received payload — the server pushes `{ t: 'changed' }` on every
 * mutation (caller refreshes), and clients can push their own events (e.g.
 * `{ t: 'typing', ... }`). On (re)connect a synthetic `{ t: 'changed' }` fires so
 * the caller resyncs. If Web PubSub isn't configured (negotiate returns no url)
 * the socket never connects and `connected` stays false so the caller keeps
 * polling.
 */
export function useRealtime(group: string, onMessage: (data: unknown) => void): RealtimeChannel {
  const [connected, setConnected] = useState(false);
  const onMsg = useRef(onMessage);
  onMsg.current = onMessage;
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!group) return;
    let closed = false;
    let retry: number | undefined;

    async function connect() {
      try {
        const res = await fetch(`/api/negotiate?group=${encodeURIComponent(group)}`, {
          cache: 'no-store',
        });
        if (!res.ok) return; // realtime not available → stay on polling
        const { url } = (await res.json()) as { url: string | null };
        if (!url || closed) return;
        const ws = new WebSocket(url, 'json.webpubsub.azure.v1');
        wsRef.current = ws;
        ws.onopen = () => {
          setConnected(true);
          onMsg.current({ t: 'changed' }); // resync on (re)connect
        };
        ws.onmessage = (e) => {
          let frame: { type?: string; data?: unknown };
          try {
            frame = JSON.parse(e.data);
          } catch {
            return;
          }
          if (frame.type === 'message') onMsg.current(frame.data);
        };
        ws.onclose = () => {
          setConnected(false);
          wsRef.current = null;
          if (!closed) retry = window.setTimeout(connect, 3000);
        };
        ws.onerror = () => {
          try {
            ws.close();
          } catch {
            /* ignore */
          }
        };
      } catch {
        if (!closed) retry = window.setTimeout(connect, 5000);
      }
    }
    connect();

    return () => {
      closed = true;
      if (retry) window.clearTimeout(retry);
      try {
        wsRef.current?.close();
      } catch {
        /* ignore */
      }
      wsRef.current = null;
    };
  }, [group]);

  const send = useCallback(
    (data: unknown) => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify({ type: 'sendToGroup', group, dataType: 'json', data }));
        } catch {
          /* best-effort */
        }
      }
    },
    [group],
  );

  return { connected, send };
}
