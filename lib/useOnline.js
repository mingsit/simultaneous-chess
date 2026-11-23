'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const LS_GAME = 'sc.game.v1';
const LS_NAME = 'sc.name.v1';
const LS_DIFFICULTY = 'sc.solo.v1';
const LS_ROOM_CLOCK = 'sc.roomclock.v1';

/** Ranking clock: the same defaults every quick match gets. */
export const RANKED_CLOCK = { freeSec: 10, reserveMin: 5 };
const FREE_RANGE = { min: 10, max: 60, step: 5 };
const RESERVE_RANGE = { min: 3, max: 20, step: 1 };

function snapToRange(value, { min, max, step }, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const snapped = Math.round((n - min) / step) * step + min;
  return Math.min(max, Math.max(min, snapped));
}

function websocketCandidates() {
  if (typeof window === 'undefined') return [];
  const explicit = process.env.NEXT_PUBLIC_WS_URL;
  if (explicit) return [explicit];
  const { protocol, hostname, port, host } = window.location;
  const proto = protocol === 'https:' ? 'wss:' : 'ws:';
  const list = [`${proto}//${host}/ws`];
  // `npm run dev` keeps the relay on :3001 while Next serves :3000
  if (port && port !== '3001') list.push(`${proto}//${hostname}:3001/ws`);
  return list;
}

export function readStoredName() {
  if (typeof window === 'undefined') return '';
  try {
    return localStorage.getItem(LS_NAME) || '';
  } catch {
    return '';
  }
}

export function storeName(name) {
  try {
    localStorage.setItem(LS_NAME, name);
  } catch {
    /* ignore */
  }
}

export function readStoredDifficulty() {
  if (typeof window === 'undefined') return 'easy';
  try {
    return localStorage.getItem(LS_DIFFICULTY) === 'hard' ? 'hard' : 'easy';
  } catch {
    return 'easy';
  }
}

export function storeDifficulty(level) {
  try {
    localStorage.setItem(LS_DIFFICULTY, level === 'hard' ? 'hard' : 'easy');
  } catch {
    /* ignore */
  }
}

/**
 * Clock saved as the private-room default. Falls back to the ranked clock, so
 * a host who never saved anything gets exactly what matchmaking uses.
 */
export function readStoredRoomClock() {
  if (typeof window === 'undefined') return { ...RANKED_CLOCK };
  try {
    const raw = JSON.parse(localStorage.getItem(LS_ROOM_CLOCK) || 'null');
    if (!raw) return { ...RANKED_CLOCK };
    return {
      freeSec: snapToRange(raw.freeSec, FREE_RANGE, RANKED_CLOCK.freeSec),
      reserveMin: snapToRange(raw.reserveMin, RESERVE_RANGE, RANKED_CLOCK.reserveMin),
    };
  } catch {
    return { ...RANKED_CLOCK };
  }
}

export function storeRoomClock({ freeSec, reserveMin }) {
  try {
    localStorage.setItem(
      LS_ROOM_CLOCK,
      JSON.stringify({
        freeSec: snapToRange(freeSec, FREE_RANGE, RANKED_CLOCK.freeSec),
        reserveMin: snapToRange(reserveMin, RESERVE_RANGE, RANKED_CLOCK.reserveMin),
      })
    );
  } catch {
    /* ignore */
  }
}

export function clearStoredRoomClock() {
  try {
    localStorage.removeItem(LS_ROOM_CLOCK);
  } catch {
    /* ignore */
  }
}

function readStoredGame() {
  try {
    const raw = localStorage.getItem(LS_GAME);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.gameId || !parsed?.token) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStoredGame(value) {
  try {
    if (value) localStorage.setItem(LS_GAME, JSON.stringify(value));
    else localStorage.removeItem(LS_GAME);
  } catch {
    /* ignore */
  }
}

const initial = {
  conn: 'connecting',
  phase: 'idle',
  view: null,
  color: null,
  gameId: null,
  pin: null,
  mode: null,
  opponent: null,
  opponentConnected: true,
  settings: null,
  notice: null,
};

export function useOnline() {
  const [snap, setSnap] = useState(initial);
  const wsRef = useRef(null);
  const offsetRef = useRef(0);
  const aliveRef = useRef(true);
  const noticeTimer = useRef(null);
  const [notice, setNotice] = useState(null);

  const flash = useCallback((message) => {
    setNotice({ message, at: Date.now() });
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    let retry = null;
    let stopped = false;
    const candidates = websocketCandidates();
    let candidate = 0;

    const connect = () => {
      if (stopped || !aliveRef.current) return;
      const url = candidates[candidate];
      if (!url) return;
      let ws;
      try {
        ws = new WebSocket(url);
      } catch {
        retry = setTimeout(connect, 2000);
        return;
      }
      wsRef.current = ws;
      let opened = false;

      ws.onopen = () => {
        opened = true;
        setSnap((s) => ({ ...s, conn: 'open' }));
        const stored = readStoredGame();
        if (stored) {
          ws.send(JSON.stringify({ t: 'resume', ...stored }));
        }
      };

      ws.onmessage = (ev) => {
        let msg;
        try {
          msg = JSON.parse(ev.data);
        } catch {
          return;
        }
        if (typeof msg.now === 'number') offsetRef.current = msg.now - Date.now();

        switch (msg.t) {
          case 'hello':
            break;
          case 'searching':
            setSnap((s) => ({ ...s, phase: 'searching', view: null, notice: null }));
            break;
          case 'room':
            setSnap((s) => ({ ...s, phase: 'hosting', pin: msg.pin, view: null, settings: msg.settings || null }));
            break;
          case 'start': {
            writeStoredGame({ gameId: msg.gameId, token: msg.token });
            setSnap((s) => ({
              ...s,
              phase: 'playing',
              view: msg.view,
              color: msg.color,
              gameId: msg.gameId,
              pin: msg.pin,
              mode: msg.mode,
              opponent: msg.opponent,
              opponentConnected: true,
              notice: null,
            }));
            break;
          }
          case 'state':
            setSnap((s) => {
              // Ignore late state broadcasts once we have left the game.
              if (!s.gameId || !s.color) return s;
              return {
                ...s,
                phase: 'playing',
                view: msg.view,
                mode: msg.mode ?? s.mode,
                pin: msg.pin ?? s.pin,
                opponent: msg.opponent ?? s.opponent,
                opponentConnected: msg.opponentConnected ?? s.opponentConnected,
              };
            });
            break;
          case 'opponent-disconnected':
            setSnap((s) => ({ ...s, opponentConnected: false }));
            flash('Your opponent disconnected — waiting for them to come back.');
            break;
          case 'opponent-reconnected':
            setSnap((s) => ({ ...s, opponentConnected: true }));
            flash('Opponent reconnected.');
            break;
          case 'idle':
            setSnap((s) => ({ ...s, phase: 'idle', view: null }));
            break;
          case 'kicked':
            writeStoredGame(null);
            setSnap((s) => ({ ...s, phase: 'idle', view: null, gameId: null }));
            if (msg.message) flash(msg.message);
            break;
          case 'error':
            flash(msg.message || 'Something went wrong.');
            break;
          default:
            break;
        }
      };

      const restart = () => {
        if (stopped || !aliveRef.current) return;
        if (!opened) candidate = (candidate + 1) % candidates.length;
        setSnap((s) => ({ ...s, conn: 'connecting' }));
        retry = setTimeout(connect, opened ? 1800 : 400);
      };

      ws.onclose = () => {
        if (wsRef.current === ws) wsRef.current = null;
        restart();
      };
      ws.onerror = () => {
        try {
          ws.close();
        } catch {
          /* ignore */
        }
      };
    };

    connect();

    return () => {
      aliveRef.current = false;
      stopped = true;
      if (retry) clearTimeout(retry);
      const ws = wsRef.current;
      wsRef.current = null;
      if (ws) {
        ws.onclose = null;
        try {
          ws.close();
        } catch {
          /* ignore */
        }
      }
    };
  }, [flash]);

  useEffect(() => {
    if (!notice) return;
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 4500);
    return () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    };
  }, [notice]);

  const send = useCallback((msg) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== 1) {
      flash('Not connected to the game server yet.');
      return false;
    }
    ws.send(JSON.stringify(msg));
    return true;
  }, [flash]);

  const actions = useMemo(
    () => ({
      quick: (name) => {
        storeName(name);
        send({ t: 'queue', name });
      },
      createRoom: (name, settings) => {
        storeName(name);
        send({ t: 'create-room', name, settings });
      },
      joinRoom: (pin, name) => {
        storeName(name);
        send({ t: 'join-room', pin, name });
      },
      cancel: () => send({ t: 'cancel' }),
      move: (action) => send({ t: 'move', action }),
      retract: () => send({ t: 'retract' }),
      resign: () => send({ t: 'resign' }),
      leave: () => {
        send({ t: 'leave' });
        writeStoredGame(null);
        setSnap((s) => ({ ...s, phase: 'idle', view: null, gameId: null, color: null }));
      },
      clearStoredGame: () => writeStoredGame(null),
    }),
    [send]
  );

  const now = useCallback(() => Date.now() + offsetRef.current, []);

  return { ...snap, notice, actions, now };
}
