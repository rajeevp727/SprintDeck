import { useEffect, useRef, useState } from 'react';

/**
 * Subscribe to real-time "changed" pings for a group (room/board code) via Azure
 * Web PubSub and run `onMessage` on each — the caller refreshes state in response.
 * Returns whether the socket is currently connected, so the caller can slow its
 * polling fallback right down. If Web PubSub isn't configured (negotiate returns
 * no url) the socket never connects and the caller keeps its normal polling.
 */
export function useRealtime(group: string, onMessage: () => void): boolean {
  const [connected, setConnected] = useState(false);
  const onMsg = useRef(onMessage);
  onMsg.current = onMessage;

  useEffect(() => {
    if (!group) return;
    let ws: WebSocket | null = null;
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
        ws = new WebSocket(url, 'json.webpubsub.azure.v1');
        ws.onopen = () => {
          setConnected(true);
          onMsg.current(); // resync on (re)connect
        };
        ws.onmessage = () => onMsg.current(); // any ping = something changed
        ws.onclose = () => {
          setConnected(false);
          if (!closed) retry = window.setTimeout(connect, 3000);
        };
        ws.onerror = () => {
          try {
            ws?.close();
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
        ws?.close();
      } catch {
        /* ignore */
      }
    };
  }, [group]);

  return connected;
}
