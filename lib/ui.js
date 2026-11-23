'use client';

import { GLYPH, PIECE_NAME, sqName, WHITE, BLACK, inCheck, findKing, colOf, rowOf, idx } from '../shared/engine.mjs';

export const PIECE_LETTER = { p: 'P', n: 'N', b: 'B', r: 'R', q: 'Q', k: 'K' };

export function actionLabel(action) {
  if (!action) return '—';
  if (action.k === 'pass') return 'pass';
  const glyph = action.piece ? GLYPH[action.piece.t] : '';
  const promo = action.promo ? `=${PIECE_LETTER[action.promo]}` : '';
  return `${glyph} ${sqName(action.from)}→${sqName(action.to)}${promo}`;
}

export function colorName(color) {
  return color === WHITE ? 'White' : 'Black';
}

export function sideLabel(color) {
  return color === WHITE ? 'White' : 'Black';
}

export function checkSquares(board) {
  const out = [];
  for (const color of [WHITE, BLACK]) {
    if (inCheck(board, color)) {
      const k = findKing(board, color);
      if (k >= 0) out.push(k);
    }
  }
  return out;
}

export function eventSummary(entry) {
  if (!entry) return [];
  const chips = [];
  for (const ev of entry.events || []) {
    if (ev.type === 'clash') chips.push({ kind: 'clash', at: ev.at, text: `⚔ clash on ${sqName(ev.at)}` });
    else if (ev.type === 'swap') chips.push({ kind: 'clash', at: ev.at, text: `⚔ mutual attack on ${sqName(ev.at)}` });
    else if (ev.type === 'capture') chips.push({ kind: 'kill', at: ev.at, text: `${PIECE_NAME[ev.piece.t]} lost on ${sqName(ev.at)}` });
    else if (ev.type === 'promote') chips.push({ kind: 'promo', at: ev.at, text: `promoted to ${PIECE_NAME[ev.to]} on ${sqName(ev.at)}` });
  }
  return chips;
}

export function statusFor(view, myColor) {
  if (!view) return { title: '', detail: '' };
  if (view.result) {
    if (view.result.type === 'draw') return { title: 'Draw', detail: view.result.reason, tone: 'draw' };
    return {
      title: view.result.winner === myColor ? 'You win' : 'You lose',
      detail: view.result.reason,
      tone: view.result.winner === myColor ? 'win' : 'lose',
    };
  }
  if (view.phase === 'solo') {
    if (view.active === myColor) {
      if (view.freeTurn) {
        return { title: 'Free turn', detail: 'Your opponent already moved. Make it count.', tone: 'free' };
      }
      return { title: "You're in check", detail: 'Only you move now — break the check.', tone: 'warn' };
    }
    return {
      title: 'Opponent is answering check',
      detail: view.freeTurn ? 'They just broke a check — you move next.' : 'Waiting for their reply.',
      tone: 'muted',
    };
  }
  const mine = inCheck(view.board, myColor);
  const theirs = inCheck(view.board, myColor === WHITE ? BLACK : WHITE);
  if (mine && theirs) return { title: 'Both kings in check', detail: 'Both of you must break it — no king attacks.', tone: 'warn' };
  if (mine) return { title: "You're in check", detail: 'Break the check to survive.', tone: 'warn' };
  if (theirs) return { title: 'Opponent is in check', detail: 'They must answer it first.', tone: 'good' };
  return { title: 'Both sides decide', detail: 'Moves resolve together once both are locked in.', tone: 'calm' };
}

export function squareFromXY(x, y, size, flipped) {
  let c = Math.floor((x / size) * 8);
  let r = Math.floor((y / size) * 8);
  if (!Number.isFinite(c) || !Number.isFinite(r)) return null;
  c = Math.min(7, Math.max(0, c));
  r = Math.min(7, Math.max(0, r));
  if (flipped) {
    r = 7 - r;
    c = 7 - c;
  }
  return idx(r, c);
}

export function xyFromSquare(i, flipped) {
  let r = rowOf(i);
  let c = colOf(i);
  if (flipped) {
    r = 7 - r;
    c = 7 - c;
  }
  return { x: c, y: r };
}
