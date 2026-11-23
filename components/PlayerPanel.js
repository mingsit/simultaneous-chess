'use client';

import { useEffect, useState } from 'react';
import { clockOf, GLYPH, WHITE, PIECE_VALUE } from '../shared/engine.mjs';

function fmt(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function PlayerPanel({
  name,
  color,
  view,
  now,
  isMe,
  thinking,
  thinkingLabel = 'deciding…',
  connected = true,
}) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 100);
    return () => clearInterval(id);
  }, []);

  const untimed = !!view?.untimed;
  const clock = view && !untimed ? clockOf({ clocks: view.clocks, freeMs: view.freeMs }, color, now()) : null;
  const reserveMs = view?.reserveMs || 300000;
  const onReserve = clock && clock.running && clock.free <= 0;
  const paused = !!(clock && clock.frozen);
  const low = clock && clock.reserve <= 30000;
  const danger = clock && clock.reserve <= 10000;
  const captured = view ? view.destroyed[color === WHITE ? 'b' : 'w'] : [];
  const score = captured.reduce((sum, t) => sum + (PIECE_VALUE[t] || 0), 0);

  return (
    <div
      className={[
        'playerPanel',
        isMe ? 'is-me' : 'is-opponent',
        onReserve ? 'on-reserve' : '',
        danger ? 'danger' : '',
      ].join(' ')}
      data-tick={tick}
    >
      <div className="playerTop">
        <span className={`sideDot ${color}`} aria-hidden />
        <span className="playerName">{name}</span>
        {isMe && <span className="youTag">you</span>}
        {!isMe && !connected && <span className="offTag">offline</span>}
      </div>

      <div className="timerRow">
        <span className={`timerValue ${untimed ? 'untimed' : onReserve ? 'reserve' : ''}`}>
          {untimed ? '∞' : clock ? fmt(clock.free) : '—'}
        </span>
        {!untimed && clock && <span className="timerPlus">(+{fmt(clock.reserve)})</span>}
        <span className="timerLabel">
          {untimed ? 'no clock' : clock && clock.running ? (paused ? 'paused' : onReserve ? 'reserve' : 'free time') : 'idle'}
        </span>
      </div>

      {!untimed && (
        <div
          className={`reserveBar ${low ? 'low' : ''}`}
          title={`${Math.round(reserveMs / 60000)}-minute thinking time (the reserve), spent after the free time each move`}
        >
          <span style={{ width: `${clock ? Math.max(0, Math.min(100, (clock.reserve / reserveMs) * 100)) : 100}%` }} />
        </div>
      )}

      <div className="playerBottom">
        <span className="capturedPieces">
          {captured.length === 0 ? (
            <span className="muted small">no captures yet</span>
          ) : (
            captured.map((t, i) => (
              <span key={i} className="capGlyph">
                {GLYPH[t]}
              </span>
            ))
          )}
        </span>
        {captured.length > 0 && <span className="muted small">+{score.toFixed(0)}</span>}
        {thinking && <span className="thinking">{thinkingLabel}</span>}
      </div>
    </div>
  );
}
