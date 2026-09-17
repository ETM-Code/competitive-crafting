import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClientMessage, Grid, RoomSnapshot, ServerMessage, Session } from '../shared/types';
const KEY = 'competitive-crafting.session';
export function storedSession(): Session | null {
  try {
    const s = JSON.parse(sessionStorage.getItem(KEY) || 'null');
    return s &&
      typeof s.code === 'string' &&
      typeof s.playerId === 'string' &&
      typeof s.token === 'string'
      ? s
      : null;
  } catch {
    return null;
  }
}
export function persistSession(session: Session | null) {
  try {
    if (session) sessionStorage.setItem(KEY, JSON.stringify(session));
    else sessionStorage.removeItem(KEY);
  } catch {
    /* Storage is optional. */
  }
}
export async function enterRoom(path: string, body: object): Promise<Session> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const result = (await response.json()) as Partial<Session> & { error?: string };
  if (!response.ok) throw new Error(result.error || 'Could not enter this room. Please try again.');
  if (!result.code || !result.playerId || !result.token)
    throw new Error('The room response was incomplete. Please try again.');
  return { code: result.code, playerId: result.playerId, token: result.token };
}
export function useConnection(session: Session | null) {
  const [state, setState] = useState<RoomSnapshot | null>(null);
  const [status, setStatus] = useState<
    'connecting' | 'connected' | 'reconnecting' | 'disconnected'
  >('connecting');
  const [error, setError] = useState('');
  const [latency, setLatency] = useState<number | null>(null);
  const offset = useRef(0);
  const socket = useRef<WebSocket | null>(null);
  const [retry, setRetry] = useState(0);
  const [syncVersion, setSyncVersion] = useState(0);
  const authoritative = useRef<RoomSnapshot | null>(null);
  const optimistic = useRef<{ roundId: string; grid: Grid } | null>(null);
  const barrier = useRef(0);
  const barrierTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const identity = useRef(session);
  identity.current = session;
  function project(snapshot: RoomSnapshot): RoomSnapshot {
    const draft = optimistic.current;
    const playerId = identity.current?.playerId;
    const own = playerId && snapshot.round?.playerStates[playerId];
    if (
      !draft ||
      !playerId ||
      !own ||
      snapshot.round?.id !== draft.roundId ||
      snapshot.phase !== 'playing' ||
      own.expired
    )
      return snapshot;
    return {
      ...snapshot,
      round: {
        ...snapshot.round,
        playerStates: { ...snapshot.round.playerStates, [playerId]: { ...own, grid: draft.grid } },
      },
    };
  }
  useEffect(() => {
    setState(null);
    authoritative.current = null;
    optimistic.current = null;
    clearTimeout(barrierTimer.current);
    setError('');
    setStatus('connecting');
    setLatency(null);
    if (!session) return;
    let stopped = false,
      attempts = 0;
    let timer: ReturnType<typeof setTimeout>;
    let heartbeat: ReturnType<typeof setInterval>;
    const connect = () => {
      if (stopped) return;
      setStatus(attempts ? 'reconnecting' : 'connecting');
      const url = new URL(`/api/rooms/${encodeURIComponent(session.code)}/ws`, location.href);
      url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      url.searchParams.set('playerId', session.playerId);
      url.searchParams.set('token', session.token);
      let awaitingSnapshot = true;
      const ws = new WebSocket(url);
      socket.current = ws;
      ws.onopen = () => {
        if (stopped) {
          ws.close();
          return;
        }
        attempts = 0;
        ws.send(JSON.stringify({ type: 'ping', sentAt: Date.now() }));
        heartbeat = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN)
            ws.send(JSON.stringify({ type: 'ping', sentAt: Date.now() }));
        }, 15000);
      };
      ws.onmessage = (event) => {
        if (stopped) return;
        try {
          const message = JSON.parse(event.data) as ServerMessage;
          if (message.type === 'state') {
            offset.current = message.state.serverNow - Date.now();
            if (awaitingSnapshot) {
              optimistic.current = null;
              awaitingSnapshot = false;
              setSyncVersion((value) => value + 1);
            }
            if (
              !authoritative.current ||
              message.state.revision >= authoritative.current.revision
            ) {
              authoritative.current = message.state;
              setState(project(message.state));
            }
            setStatus('connected');
          }
          if (message.type === 'error') setError(message.message);
          if (message.type === 'pong') {
            // A negative ping is an ordered barrier after local mutations. Its reply
            // follows their state/error frames, including repeated equal grid values.
            if (message.sentAt < 0) {
              if (message.sentAt === barrier.current) {
                optimistic.current = null;
                if (authoritative.current) setState(authoritative.current);
                setSyncVersion((value) => value + 1);
              }
              return;
            }
            const rtt = Date.now() - message.sentAt;
            setLatency(rtt);
            offset.current = message.serverNow + rtt / 2 - Date.now();
          }
        } catch {
          setError('A room update could not be read. Reconnect to sync your game.');
        }
      };
      ws.onclose = (event) => {
        clearInterval(heartbeat);
        clearTimeout(barrierTimer.current);
        if (stopped) return;
        // Terminal closes need an explicit retry. Reclaiming a replaced session
        // automatically makes two tabs evict one another indefinitely.
        const terminalMessages: Partial<Record<number, string>> = {
          1000: 'You have left this room.',
          1008: 'Too many room actions. Wait a moment before reconnecting.',
          1009: 'A room action was too large. Reconnect to sync your game.',
          4001: 'This session was opened in another tab or removed. Retry here to reclaim it.',
          4004: 'This room has expired. Return to the menu to create or join another room.',
        };
        const terminal = terminalMessages[event.code];
        if (terminal) {
          optimistic.current = null;
          if (authoritative.current) setState(authoritative.current);
          setSyncVersion((value) => value + 1);
          setStatus('disconnected');
          setError(terminal);
          return;
        }
        setStatus('reconnecting');
        timer = setTimeout(connect, Math.min(1000 * 2 ** attempts++, 15000));
      };
      ws.onerror = () => ws.close();
    };
    connect();
    return () => {
      stopped = true;
      clearTimeout(timer);
      clearTimeout(barrierTimer.current);
      clearInterval(heartbeat);
      socket.current?.close();
      socket.current = null;
    };
  }, [session, retry]);
  const send = useCallback((message: ClientMessage) => {
    if (socket.current?.readyState !== WebSocket.OPEN) {
      setError('Connection interrupted. Your game will sync when you reconnect.');
      return false;
    }
    socket.current.send(JSON.stringify(message));
    if (message.type === 'grid') {
      optimistic.current = { roundId: message.roundId, grid: [...message.grid] };
      if (authoritative.current) setState(project(authoritative.current));
    }
    if (['grid', 'engage', 'overclock', 'collect'].includes(message.type)) {
      // Coalesce acknowledgement probes, never placements; every grid goes on wire.
      const ticket = --barrier.current;
      clearTimeout(barrierTimer.current);
      const ws = socket.current;
      barrierTimer.current = setTimeout(() => {
        if (ws === socket.current && ws.readyState === WebSocket.OPEN)
          ws.send(JSON.stringify({ type: 'ping', sentAt: ticket }));
      }, 100);
    }
    return true;
  }, []);
  return {
    state,
    syncVersion,
    status,
    error,
    setError,
    latency,
    offset,
    send,
    reconnect: () => setRetry((value) => value + 1),
  };
}
