'use client';

import { useEffect, useRef } from 'react';
import { useAuthStore } from '@/store/auth';
import { WS_URL } from '@/lib/api';

/** Article VII.4 / VII.5 — WS after login; polling fallback is per order page */
export function useOrderWebSocket(onStatus?: (payload: Record<string, unknown>) => void) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const setWsConnected = useAuthStore((s) => s.setWsConnected);
  const onStatusRef = useRef(onStatus);
  onStatusRef.current = onStatus;

  useEffect(() => {
    if (!accessToken) {
      setWsConnected(false);
      return;
    }

    const ws = new WebSocket(`${WS_URL}?token=${encodeURIComponent(accessToken)}`);
    ws.onopen = () => setWsConnected(true);
    ws.onclose = () => setWsConnected(false);
    ws.onerror = () => setWsConnected(false);
    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(String(ev.data)) as Record<string, unknown>;
        if (data.type === 'order.status.changed') {
          onStatusRef.current?.(data);
        }
      } catch {
        // ignore
      }
    };

    return () => {
      ws.close();
      setWsConnected(false);
    };
  }, [accessToken, setWsConnected]);
}
