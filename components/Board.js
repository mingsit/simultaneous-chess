'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { GLYPH, FILES, WHITE, BLACK, idx } from '../shared/engine.mjs';
import { xyFromSquare } from '../lib/ui';

const DRAG_THRESHOLD = 6;

function sigOf(board) {
  let s = '';
  for (let i = 0; i < 64; i++) {
    const p = board[i];
    s += p ? p.id + p.t + p.c + (p.overextended ? '!' : '') : '--';
  }
  return s;
}

function itemsOf(board) {
  const out = [];
  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (p) out.push({ key: p.id, id: p.id, t: p.t, c: p.c, at: i, overextended: !!p.overextended });
  }
  return out;
}

export default function Board({
  board,
  myColor = WHITE,
  selected = null,
  targets,
  backTargets = [],
  staged = null,
  stagedBack = null,
  lastRound = null,
  checkSqs = [],
  disabled = false,
  onSquareClick,
  onDropMove,
}) {
  const flipped = myColor === BLACK;
  const [items, setItems] = useState(() => itemsOf(board));
  const prevSig = useRef(sigOf(board));
  const prevItems = useRef(items);
  const seq = useRef(0);
  const cleanup = useRef(null);

  const rootRef = useRef(null);
  const dragRef = useRef(null);
  const suppressClick = useRef(false);
  const [ghost, setGhost] = useState(null);
  const [backTip, setBackTip] = useState(null);

  useEffect(() => {
    const sig = sigOf(board);
    if (sig === prevSig.current) return;
    prevSig.current = sig;

    const before = prevItems.current;
    const next = itemsOf(board);
    const nextIds = new Set(next.map((i) => i.id));
    const beforeById = new Map(before.map((i) => [i.id, i]));

    for (const item of next) {
      const old = beforeById.get(item.id);
      if (old && old.t !== item.t) item.flash = true;
    }

    const dying = before
      .filter((i) => !i.dying && !nextIds.has(i.id))
      .map((i) => ({ ...i, dying: true, key: `${i.id}~${seq.current++}` }));

    prevItems.current = next;
    setItems(next.concat(dying));

    if (dying.length) {
      if (cleanup.current) clearTimeout(cleanup.current);
      cleanup.current = setTimeout(() => {
        setItems((list) => list.filter((i) => !i.dying));
      }, 520);
    }
  }, [board]);

  useEffect(() => () => cleanup.current && clearTimeout(cleanup.current), []);

  const squareAt = (x, y) => {
    if (typeof document === 'undefined') return -1;
    const el = document.elementFromPoint(x, y);
    const btn = el && el.closest ? el.closest('button[data-i]') : null;
    return btn ? Number(btn.dataset.i) : -1;
  };

  const endDrag = () => {
    dragRef.current = null;
    setGhost(null);
  };

  const onPointerDown = (e) => {
    if (disabled || !onSquareClick) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const el = e.target.closest ? e.target.closest('button[data-i]') : null;
    if (!el) return;
    const from = Number(el.dataset.i);
    const piece = board[from];
    if (!piece || piece.c !== myColor) return;

    dragRef.current = {
      from,
      startX: e.clientX,
      startY: e.clientY,
      pointerId: e.pointerId,
      active: false,
      announced: selected === from,
      size: 0,
    };
    // Capture only once an actual drag starts: capturing on pointerdown makes
    // browsers retarget the follow-up click to the board, which would swallow
    // the tap-to-select.
  };

  const onPointerMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    if (!d.active) {
      const moved = Math.hypot(e.clientX - d.startX, e.clientY - d.startY);
      if (moved < DRAG_THRESHOLD) return;
      d.active = true;
      try {
        e.currentTarget.setPointerCapture(d.pointerId);
      } catch {
        /* pointer capture is best effort */
      }
      const rect = rootRef.current ? rootRef.current.getBoundingClientRect() : null;
      d.size = rect ? rect.width / 8 : 48;
      const piece = board[d.from];
      if (!piece) {
        endDrag();
        return;
      }
      setGhost({
        id: piece.id,
        glyph: GLYPH[piece.t],
        color: piece.c,
        x: e.clientX,
        y: e.clientY,
        size: d.size,
      });
      if (!d.announced) {
        d.announced = true;
        onSquareClick(d.from);
      }
      return;
    }
    setGhost((g) => (g ? { ...g, x: e.clientX, y: e.clientY } : g));
  };

  const onPointerUp = (e) => {
    const d = dragRef.current;
    if (!d) return;
    const wasActive = d.active;
    const from = d.from;
    endDrag();
    if (!wasActive) return;

    suppressClick.current = true;
    setTimeout(() => {
      suppressClick.current = false;
    }, 0);

    const to = squareAt(e.clientX, e.clientY);
    if (to < 0 || to === from) return;
    if (onDropMove) onDropMove(from, to);
    else if (targets instanceof Set ? targets.has(to) : (targets || []).includes(to)) onSquareClick(to);
  };

  const onPointerCancel = () => endDrag();

  const targetSet = targets instanceof Set ? targets : new Set(targets || []);
  const backSet = backTargets instanceof Set ? backTargets : new Set(backTargets || []);

  const lastDest = { w: -1, b: -1 };
  if (lastRound?.actions) {
    for (const c of ['w', 'b']) {
      const a = lastRound.actions[c];
      if (a && a.k === 'move') lastDest[c] = a.to;
    }
  }
  const lastDead = new Set();
  const lastClash = new Set();
  for (const ev of lastRound?.events || []) {
    if (ev.type === 'capture' || ev.type === 'clash' || ev.type === 'swap') lastDead.add(ev.at);
    if (ev.type === 'clash' || ev.type === 'swap') lastClash.add(ev.at);
  }

  const squares = [];
  for (let dr = 0; dr < 8; dr++) {
    for (let dc = 0; dc < 8; dc++) {
      const r = flipped ? 7 - dr : dr;
      const c = flipped ? 7 - dc : dc;
      const i = idx(r, c);
      const light = (r + c) % 2 === 0;
      const cls = ['sq', light ? 'light' : 'dark'];
      if (selected === i) cls.push('sel');
      if (staged && staged.from === i) cls.push('staged-from');
      if (staged && staged.to === i) cls.push('staged-to');
      if (targetSet.has(i)) cls.push(board[i] ? 'target-cap' : 'target');
      if (backSet.has(i)) cls.push('target-back');
      if (stagedBack === i) cls.push('staged-pawn');
      if (lastDest.w === i) cls.push('last-w');
      if (lastDest.b === i) cls.push('last-b');
      if (lastDead.has(i)) cls.push('last-dead');
      if (lastClash.has(i)) cls.push('last-clash');
      if (checkSqs.includes(i)) cls.push('in-check');

      squares.push(
        <button
          key={i}
          type="button"
          data-i={i}
          className={cls.join(' ')}
          aria-label={FILES[c] + (8 - r) + (backSet.has(i) ? ' back attack target' : '')}
          title={backSet.has(i) ? 'Back attack — take the pawn or hook it' : undefined}
          onClick={() => onSquareClick && onSquareClick(i)}
          onPointerDown={(e) => e.preventDefault()}
          onPointerEnter={(e) => {
            if (!backSet.has(i)) return;
            const r = e.currentTarget.getBoundingClientRect();
            const x = Math.min(Math.max(r.left + r.width / 2, 120), (window.innerWidth || 800) - 120);
            setBackTip({ x, y: r.top });
          }}
          onPointerLeave={() => setBackTip((t) => (t ? null : t))}
          tabIndex={-1}
        >
          {dc === 0 && <span className="coord rank">{8 - r}</span>}
          {dr === 7 && <span className="coord file">{FILES[c]}</span>}
          {backSet.has(i) ? (
            <span className="hint back" />
          ) : targetSet.has(i) && board[i] ? (
            <span className="hint ring" />
          ) : targetSet.has(i) ? (
            <span className="hint" />
          ) : null}
        </button>
      );
    }
  }

  return (
    <div
      ref={rootRef}
      className={`board ${disabled ? 'is-disabled' : ''} ${ghost ? 'is-dragging' : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onClickCapture={(e) => {
        if (!suppressClick.current) return;
        suppressClick.current = false;
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <div className="board-grid">{squares}</div>
      <div className="board-pieces">
        {items.map((item) => {
          const { x, y } = xyFromSquare(item.at, flipped);
          const isGhostSource = !!ghost && ghost.id === item.id && !item.dying;
          return (
            <div
              key={item.key}
              className={[
                'piece',
                item.c === WHITE ? 'piece-white' : 'piece-black',
                item.dying ? 'dying' : '',
                item.flash && !item.dying ? 'flash' : '',
                item.overextended && !item.dying ? 'overextended' : '',
                isGhostSource ? 'drag-source' : '',
              ].join(' ')}
              style={{ transform: `translate(${x * 100}%, ${y * 100}%)` }}
              title={item.overextended ? 'Overextended — cannot move this round' : undefined}
            >
              <span className="glyph">{GLYPH[item.t]}</span>
            </div>
          );
        })}
      </div>

      {backTip &&
        typeof document !== 'undefined' &&
        createPortal(
          <div className="boardTip" style={{ left: `${backTip.x}px`, top: `${backTip.y}px` }} role="tooltip">
            <strong>Back attack</strong>
            <span>
              Take this pawn on its square, or hook it. The hook follows the pawn: it lands on the
              pawn&apos;s square if the pawn stays, or on the square it advances to (even a
              double-step). Only a diagonal move escapes — the hook then stops on the pawn&apos;s
              old square.
            </span>
          </div>,
          document.body
        )}

      {ghost &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className={`dragGhost ${ghost.color === WHITE ? 'piece-white' : 'piece-black'}`}
            style={{
              left: `${ghost.x}px`,
              top: `${ghost.y}px`,
              width: `${ghost.size}px`,
              height: `${ghost.size}px`,
              fontSize: `${ghost.size * 0.85}px`,
            }}
          >
            <span className="glyph">{ghost.glyph}</span>
          </div>,
          document.body
        )}
    </div>
  );
}
