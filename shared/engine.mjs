/**
 * Simultaneous Chess — core rules engine.
 *
 * Pure, dependency-free ESM so that the browser client and the Node
 * matchmaking server can share exactly the same rules.
 *
 * Board index: 0..63, index 0 = a8, index 63 = h1.
 * Row 0 is Black's back rank, row 7 is White's back rank.
 */

export const WHITE = 'w';
export const BLACK = 'b';
export const COLORS = [WHITE, BLACK];

export const FILES = 'abcdefgh';
export const PIECE_NAME = { p: 'Pawn', n: 'Knight', b: 'Bishop', r: 'Rook', q: 'Queen', k: 'King' };
export const PIECE_VALUE = { p: 1, n: 3, b: 3.2, r: 5, q: 9, k: 0 };
export const GLYPH = { p: '\u265F', n: '\u265E', b: '\u265D', r: '\u265C', q: '\u265B', k: '\u265A' };

export const FREE_MS = 10_000; // default free thinking time per move
export const RESERVE_MS = 300_000; // default cumulative reserve per player, spent after the free time
export const MIN_FREE_MS = 10_000;
export const MAX_FREE_MS = 60_000;
export const MIN_RESERVE_MS = 180_000;
export const MAX_RESERVE_MS = 1_200_000;
export const PROMO_TYPES = ['q', 'r', 'b', 'n'];
export const MAX_ROUNDS = 99; // no winner after this many resolved rounds -> draw
export const OVEREXTEND_ROUNDS = 20; // the overextension rule lapses after this round

const clampMs = (value, lo, hi, fallback) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(hi, Math.max(lo, Math.round(n / 1000) * 1000));
};

/** Clamp private-room clock settings to the allowed range. */
export function normalizeSettings(settings = {}) {
  return {
    freeMs: clampMs(settings.freeMs, MIN_FREE_MS, MAX_FREE_MS, FREE_MS),
    reserveMs: clampMs(settings.reserveMs, MIN_RESERVE_MS, MAX_RESERVE_MS, RESERVE_MS),
  };
}

export const idx = (r, c) => r * 8 + c;
export const rowOf = (i) => i >> 3;
export const colOf = (i) => i & 7;
export const inside = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
export const sqName = (i) => (i == null || i < 0 ? '—' : FILES[i & 7] + (8 - (i >> 3)));
export const other = (c) => (c === WHITE ? BLACK : WHITE);
export const lastRank = (c) => (c === WHITE ? 0 : 7);
export const startRow = (c) => (c === WHITE ? 6 : 1);
export const dirOf = (c) => (c === WHITE ? -1 : 1);
/** True when `i` is on one of `color`'s opponent's last two ranks. */
export const onEnemyBackRanks = (color, i) =>
  color === WHITE ? rowOf(i) <= 1 : rowOf(i) >= 6;

/* ------------------------------------------------------------------ */
/* Board helpers                                                       */
/* ------------------------------------------------------------------ */

export function createInitialBoard() {
  const board = new Array(64).fill(null);
  const back = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
  for (let c = 0; c < 8; c++) {
    board[idx(0, c)] = { id: `b0-${c}`, t: back[c], c: BLACK };
    board[idx(1, c)] = { id: `bp-${c}`, t: 'p', c: BLACK };
    board[idx(6, c)] = { id: `wp-${c}`, t: 'p', c: WHITE };
    board[idx(7, c)] = { id: `w0-${c}`, t: back[c], c: WHITE };
  }
  return board;
}

export function cloneBoard(board) {
  return board.map((p) => (p ? { ...p } : null));
}

export function findKing(board, color) {
  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (p && p.t === 'k' && p.c === color) return i;
  }
  return -1;
}

export function boardKey(board) {
  let s = '';
  for (let i = 0; i < 64; i++) {
    const p = board[i];
    s += p ? p.c + p.t : '..';
  }
  return s;
}

export function materialCount(board, color) {
  let v = 0;
  for (const p of board) if (p && p.c === color) v += PIECE_VALUE[p.t] || 0;
  return v;
}

/* ------------------------------------------------------------------ */
/* Attacks & move generation                                           */
/* ------------------------------------------------------------------ */

const KNIGHT_DELTAS = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
const KING_DELTAS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
const ROOK_DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const BISHOP_DIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

export const isSqAttacked = isAttacked;

export function isAttacked(board, sq, by) {
  const r = rowOf(sq);
  const c = colOf(sq);

  // Pawns: a white pawn attacks "upwards" (row-1), so it must sit at row+1.
  const pawnRow = by === WHITE ? r + 1 : r - 1;
  for (const dc of [-1, 1]) {
    if (!inside(pawnRow, c + dc)) continue;
    const p = board[idx(pawnRow, c + dc)];
    if (p && p.c === by && p.t === 'p') return true;
  }

  for (const [dr, dc] of KNIGHT_DELTAS) {
    const rr = r + dr;
    const cc = c + dc;
    if (!inside(rr, cc)) continue;
    const p = board[idx(rr, cc)];
    if (p && p.c === by && p.t === 'n') return true;
  }

  for (const [dr, dc] of KING_DELTAS) {
    const rr = r + dr;
    const cc = c + dc;
    if (!inside(rr, cc)) continue;
    const p = board[idx(rr, cc)];
    if (p && p.c === by && p.t === 'k') return true;
  }

  for (const [dr, dc] of ROOK_DIRS) {
    let rr = r + dr;
    let cc = c + dc;
    while (inside(rr, cc)) {
      const p = board[idx(rr, cc)];
      if (p) {
        if (p.c === by && (p.t === 'r' || p.t === 'q')) return true;
        break;
      }
      rr += dr;
      cc += dc;
    }
  }

  for (const [dr, dc] of BISHOP_DIRS) {
    let rr = r + dr;
    let cc = c + dc;
    while (inside(rr, cc)) {
      const p = board[idx(rr, cc)];
      if (p) {
        if (p.c === by && (p.t === 'b' || p.t === 'q')) return true;
        break;
      }
      rr += dr;
      cc += dc;
    }
  }

  return false;
}

export function inCheck(board, color) {
  const k = findKing(board, color);
  if (k < 0) return false;
  return isAttacked(board, k, other(color));
}

/** Pseudo-legal destination squares (own pieces and the enemy king excluded later). */
export function pseudoMoves(board, from) {
  const p = board[from];
  if (!p) return [];
  const r = rowOf(from);
  const c = colOf(from);
  const out = [];

  const push = (rr, cc) => {
    if (!inside(rr, cc)) return false;
    const t = idx(rr, cc);
    const q = board[t];
    if (!q) {
      out.push(t);
      return true;
    }
    if (q.c !== p.c) out.push(t);
    return false;
  };

  if (p.t === 'p') {
    const d = dirOf(p.c);
    const oneR = r + d;
    if (inside(oneR, c) && !board[idx(oneR, c)]) {
      out.push(idx(oneR, c));
      const twoR = r + 2 * d;
      if (r === startRow(p.c) && inside(twoR, c) && !board[idx(twoR, c)]) out.push(idx(twoR, c));
    }
    for (const dc of [-1, 1]) {
      const rr = r + d;
      const cc = c + dc;
      if (!inside(rr, cc)) continue;
      const q = board[idx(rr, cc)];
      if (q && q.c !== p.c) out.push(idx(rr, cc));
    }
    return out;
  }

  if (p.t === 'n') {
    for (const [dr, dc] of KNIGHT_DELTAS) push(r + dr, c + dc);
    return out;
  }

  if (p.t === 'k') {
    for (const [dr, dc] of KING_DELTAS) push(r + dr, c + dc);
    return out;
  }

  const dirs = p.t === 'r' ? ROOK_DIRS : p.t === 'b' ? BISHOP_DIRS : [...ROOK_DIRS, ...BISHOP_DIRS];
  for (const [dr, dc] of dirs) {
    let rr = r + dr;
    let cc = c + dc;
    while (push(rr, cc)) {
      rr += dr;
      cc += dc;
    }
  }
  return out;
}

/** Board after a single move (used for king-safety checks and for the AI). */
export function applyMove(board, from, to, promo) {
  const next = cloneBoard(board);
  const piece = next[from];
  if (!piece) return next;
  next[from] = null;
  if (piece.t === 'p' && rowOf(to) === lastRank(piece.c) && promo) piece.t = promo;
  next[to] = piece;
  return next;
}

/**
 * All legal moves for a colour. A move is legal when, played on its own,
 * it leaves the moving side's king un-attacked. The enemy king can never
 * be captured (checkmate decides the game instead). Overextended pieces
 * are pinned where they stand for that round.
 */
export function legalMoves(board, color) {
  const moves = [];
  const pushIfSafe = (from, to, back) => {
    const piece = board[from];
    const target = board[to];
    if (target && target.t === 'k' && target.c !== color) return;
    if (inCheck(applyMove(board, from, to), color)) return;
    const move = { from, to, promo: piece.t === 'p' && rowOf(to) === lastRank(color) };
    if (back != null) move.back = back;
    moves.push(move);
  };

  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (!p || p.c !== color || p.overextended) continue;
    for (const to of pseudoMoves(board, i)) pushIfSafe(i, to);
    for (const b of backAttacks(board, i, p, color)) pushIfSafe(i, b.to, b.back);
  }
  return moves;
}

/**
 * Back attacks ("the hook"): a rook or queen standing behind an enemy pawn
 * on the same clear file may hook it. The raider follows the pawn: it lands
 * on the pawn's square if the pawn stays, on the pawn's new square if it
 * advances (one or two), and on the pawn's old square if it dodges
 * diagonally. Returns the candidate { to, back } pairs; king safety is
 * checked by the caller. `to` and `back` are the pawn's square: the final
 * landing square depends on what the pawn does this round.
 */
export function backAttacks(board, from, piece, color) {
  const out = [];
  if (piece.t !== 'r' && piece.t !== 'q') return out;
  const r = rowOf(from);
  const c = colOf(from);
  for (const d of [-1, 1]) {
    let rr = r + d;
    while (rr >= 0 && rr < 8) {
      const at = idx(rr, c);
      const occupant = board[at];
      if (!occupant) {
        rr += d;
        continue;
      }
      // The first piece on the line must be an enemy pawn running this way:
      // the sliding piece must sit on the pawn's back side.
      if (occupant.c === color || occupant.t !== 'p') break;
      if (dirOf(occupant.c) !== d) break;
      out.push({ to: at, back: at });
      break;
    }
  }
  return out;
}

export function hasLegalMove(board, color) {
  return legalMoves(board, color).length > 0;
}

/* ------------------------------------------------------------------ */
/* Game state                                                          */
/* ------------------------------------------------------------------ */

export function initialGame(now = Date.now(), settings = {}) {
  const { freeMs, reserveMs } = normalizeSettings(settings);
  const untimed = !!settings.untimed; // single player: no clock at all
  return {
    board: createInitialBoard(),
    phase: 'simultaneous', // 'simultaneous' | 'solo' | 'over'
    active: null, // colour that must act alone during a 'solo' phase
    freeTurn: false, // true when the solo turn is the reward for breaking check
    pending: { w: null, b: null },
    decided: { w: null, b: null }, // when each colour locked a decision (internal timing)
    destroyed: { w: [], b: [] }, // piece types each colour has lost
    untimed,
    freeMs,
    reserveMs,
    clocks: {
      w: { freeStart: untimed ? null : now, reserve: untimed ? 0 : reserveMs },
      b: { freeStart: untimed ? null : now, reserve: untimed ? 0 : reserveMs },
    },
    round: 1,
    log: [],
    result: null,
    repetition: {},
    passStreak: 0, // consecutive rounds where both sides passed
  };
}

export function actorsOf(state) {
  if (state.phase === 'over') return [];
  if (state.phase === 'solo') return state.active ? [state.active] : [];
  return [WHITE, BLACK];
}

export function mustBreakCheck(state, color) {
  return inCheck(state.board, color);
}

export function canPass(state, color) {
  if (state.phase === 'over') return false;
  if (!actorsOf(state).includes(color)) return false;
  return !inCheck(state.board, color);
}

/** Standard number of each piece a side can ever have at once. */
const MAX_PIECES = { p: 8, n: 2, b: 2, r: 2, q: 1 };

/** Types a pawn of `color` may promote to (only pieces that colour has lost). */
export function promoOptions(state, color) {
  const lost = state.destroyed?.[color] || [];
  const seen = new Set();
  for (const t of lost) if (PROMO_TYPES.includes(t)) seen.add(t);
  // Never exceed the normal piece count: one queen, two rooks, and so on.
  const counts = {};
  for (const p of state.board || []) if (p && p.c === color) counts[p.t] = (counts[p.t] || 0) + 1;
  return PROMO_TYPES.filter((t) => seen.has(t) && (counts[t] || 0) < MAX_PIECES[t]);
}

/** Does this action refer to exactly this legal move (including back attacks)? */
function isSameMove(m, action) {
  return m.from === action.from && m.to === action.to && (m.back ?? null) === (action.back ?? null);
}

export function validateAction(state, color, action) {
  if (!state || state.phase === 'over') return 'The game is over.';
  if (!actorsOf(state).includes(color)) return 'It is not your decision to make right now.';
  if (!action || typeof action !== 'object') return 'Invalid action.';
  if (action.k === 'pass') {
    if (!canPass(state, color)) return 'You cannot pass while your king is in check.';
    return null;
  }
  if (action.k !== 'move') return 'Invalid action.';
  const { from, to } = action;
  if (!Number.isInteger(from) || !Number.isInteger(to)) return 'Invalid square.';
  const piece = state.board[from];
  if (!piece || piece.c !== color) return 'That is not your piece.';
  const legal = legalMoves(state.board, color).find((m) => isSameMove(m, action));
  if (!legal) return 'That move is not legal.';
  if (legal.promo) {
    const opts = promoOptions(state, color);
    if (opts.length > 0 && action.promo && !opts.includes(action.promo)) {
      return 'You can only promote to a piece you have lost.';
    }
  }
  return null;
}

function normalizeAction(state, color, action) {
  if (!action) return null;
  if (action.k === 'pass') return { k: 'pass' };
  const a = { k: 'move', from: action.from, to: action.to };
  const legal = legalMoves(state.board, color).find((m) => isSameMove(m, action));
  if (legal && legal.back != null) a.back = legal.back;
  const piece = state.board[action.from];
  if (piece && piece.t === 'p' && rowOf(action.to) === lastRank(color)) {
    const opts = promoOptions(state, color);
    if (opts.length) a.promo = opts.includes(action.promo) ? action.promo : opts[0];
  }
  return a;
}

/**
 * Submit one player's decision. Resolves immediately during a solo turn,
 * otherwise waits for both players.
 * Returns { state, resolved } or { error }.
 */
export function submitAction(state, color, action, now = Date.now()) {
  const err = validateAction(state, color, action);
  if (err) return { error: err };
  const next = {
    ...state,
    pending: { ...state.pending, [color]: normalizeAction(state, color, action) },
    decided: { ...(state.decided || {}), [color]: now },
  };
  if (next.phase === 'solo') return { state: resolveRound(next, now), resolved: true };
  if (next.pending.w && next.pending.b) return { state: resolveRound(next, now), resolved: true };
  return { state: next, resolved: false };
}

export function retractAction(state, color) {
  if (state.phase === 'over') return state;
  if (!state.pending[color]) return state;
  return {
    ...state,
    pending: { ...state.pending, [color]: null },
    decided: { ...(state.decided || {}), [color]: null },
  };
}

/* ------------------------------------------------------------------ */
/* Resolution                                                          */
/* ------------------------------------------------------------------ */

/** Which of the clashing movers survive? */
function clashSurvivors(group) {
  const kings = group.filter((m) => m.piece.t === 'k');
  if (kings.length > 0) return kings.length === 1 ? [kings[0]] : [];
  const pawns = group.filter((m) => m.piece.t === 'p');
  if (pawns.length === 2) return [];
  if (pawns.length === 1) {
    // A pawn that moves diagonally is attacking: that clash is mutual, so both die.
    // A pawn that only advanced was not attacking, so it is the one destroyed.
    const pawn = pawns[0];
    if (colOf(pawn.from) !== colOf(pawn.to)) return [];
    return group.filter((m) => m.piece.t !== 'p');
  }
  return [];
}

const snap = (p) => ({ id: p.id, t: p.t, c: p.c });

function describePiece(p) {
  return { id: p.id, t: p.t, c: p.c };
}

export function resolveRound(state, now = Date.now()) {
  const board = cloneBoard(state.board);
  const actions = { w: state.pending.w, b: state.pending.b };
  const preDestroyed = { w: [...state.destroyed.w], b: [...state.destroyed.b] };

  const movers = [];
  const backAttackMoves = [];
  for (const c of COLORS) {
    const a = actions[c];
    if (!a || a.k !== 'move') continue;
    const piece = board[a.from];
    if (!piece || piece.c !== c) continue;
    const mover = { color: c, from: a.from, to: a.to, piece, action: a };
    if (a.back != null) {
      // The hook is resolved after every ordinary mover, because its landing
      // square depends on where the pawn ends up.
      const target = board[a.back];
      if (target && target.t === 'p' && target.c !== c) mover.backPawn = target;
      backAttackMoves.push(mover);
      continue;
    }
    movers.push(mover);
  }

  for (const m of movers) board[m.from] = null;

  const events = [];
  const placed = [];
  const dead = [];

  const byDest = new Map();
  for (const m of movers) {
    const list = byDest.get(m.to);
    if (list) list.push(m);
    else byDest.set(m.to, [m]);
  }

  // Mutual attacks: A -> B's square while B -> A's square.
  const swapOf = new Map();
  for (const a of movers) {
    for (const b of movers) {
      if (a !== b && a.to === b.from && b.to === a.from) swapOf.set(a, b);
    }
  }

  const done = new Set();

  for (const m of movers) {
    if (done.has(m)) continue;
    const group = byDest.get(m.to);

    if (group && group.length > 1) {
      for (const g of group) done.add(g);
      const survivors = clashSurvivors(group);
      events.push({
        type: 'clash',
        at: m.to,
        pieces: group.map((g) => snap(g.piece)),
        survivors: survivors.map((g) => g.color),
      });
      for (const g of group) {
        if (survivors.includes(g)) placed.push({ m: g, at: m.to });
        else dead.push({ piece: g.piece, at: m.to, cause: 'clash' });
      }
      continue;
    }

    done.add(m);
    const mate = swapOf.get(m);

    if (mate) {
      done.add(mate);
      const pair = [m, mate];
      const survivors = clashSurvivors(pair);
      events.push({
        type: 'swap',
        at: m.to,
        squares: [m.from, m.to],
        pieces: pair.map((g) => snap(g.piece)),
        survivors: survivors.map((g) => g.color),
      });
      for (const g of pair) {
        if (survivors.includes(g)) placed.push({ m: g, at: g.to });
        else dead.push({ piece: g.piece, at: g.to, cause: 'swap' });
      }
      continue;
    }

    const occupied = board[m.to];
    if (occupied && occupied.c !== m.color) {
      board[m.to] = null;
      events.push({ type: 'capture', at: m.to, piece: snap(occupied), by: m.color });
      dead.push({ piece: occupied, at: m.to, cause: 'capture' });
    }
    placed.push({ m, at: m.to });
  }

  //console.log('placed', placed.length, 'dead', dead.length);
  for (const p of placed) board[p.at] = p.m.piece;

  // The hook: the raider follows the pawn. It lands on the pawn's square if
  // the pawn stays, on the pawn's new square if it advances (one or two
  // squares), and destroys it there. A diagonal move dodges, leaving the
  // raider on the pawn's old square with nothing captured.
  // Pins from the round that just resolved expire now.
  for (const p of board) if (p && p.overextended) delete p.overextended;
  const pins = [];
  const overextensionActive = state.round <= OVEREXTEND_ROUNDS;

  for (const m of backAttackMoves) {
    if (board[m.from] !== m.piece) continue; // the raider was captured on its square
    const pawn = m.backPawn;
    if (!pawn) continue;

    const pawnMover = movers.find((x) => x.piece === pawn);
    const pawnSq = m.action.back;
    const dodged = !!pawnMover && colOf(pawnMover.to) !== colOf(pawnMover.from);
    const dest = pawnMover && !dodged ? pawnMover.to : pawnSq;
    if (dest === m.from) continue;

    const occupant = board[dest];
    if (occupant && occupant.c === m.color) continue; // no room: the hook is called off

    if (occupant && occupant.t === 'k') {
      // A king always survives a clash; the raider dies on the landing square.
      board[m.from] = null;
      events.push({
        type: 'clash',
        at: dest,
        pieces: [snap(m.piece), snap(occupant)],
        survivors: [occupant.c],
      });
      dead.push({ piece: m.piece, at: dest, cause: 'clash' });
      continue;
    }

    board[m.from] = null;
    let killed = false;
    if (occupant) {
      // The hooked pawn (or whatever else ended up there) is destroyed.
      board[dest] = null;
      events.push({ type: 'capture', at: dest, piece: snap(occupant), by: m.color, back: dest });
      dead.push({ piece: occupant, at: dest, cause: 'back' });
      killed = true;
    }
    board[dest] = m.piece;

    if (killed && overextensionActive && onEnemyBackRanks(m.color, dest)) {
      m.piece.overextended = true;
      pins.push({ type: 'overextend', at: dest, id: m.piece.id, color: m.color });
    }
  }

  // Overextension for normal captures: capturing on the opponent's last two
  // ranks pins the capturing piece (pawns and kings are exempt) so it cannot
  // move next round. The rule only applies during the first 20 rounds.
  for (const ev of events) {
    if (ev.type !== 'capture' || ev.back != null) continue;
    const capturer = board[ev.at];
    if (!capturer || capturer.c !== ev.by) continue;
    if (capturer.t === 'p' || capturer.t === 'k') continue;
    if (!overextensionActive) continue;
    if (!onEnemyBackRanks(capturer.c, ev.at)) continue;
    capturer.overextended = true;
    pins.push({ type: 'overextend', at: ev.at, id: capturer.id, color: capturer.c });
  }
  events.push(...pins);

  // Promotions (only to pieces this colour had already lost before the round).
  // A promoted piece is a revival: consume it from the lost pool so the same
  // lost piece cannot be brought back twice.
  const lostPool = { w: [...preDestroyed.w], b: [...preDestroyed.b] };
  for (const p of placed) {
    const piece = board[p.at];
    if (!piece || piece.t !== 'p') continue;
    if (rowOf(p.at) !== lastRank(piece.c)) continue;
    const counts = {};
    for (const q of board) if (q && q.c === piece.c) counts[q.t] = (counts[q.t] || 0) + 1;
    const pool = PROMO_TYPES.filter(
      (t) => lostPool[piece.c].includes(t) && (counts[t] || 0) < MAX_PIECES[t]
    );
    if (!pool.length) continue;
    const want = p.m.action.promo;
    const to = pool.includes(want) ? want : pool[0];
    lostPool[piece.c].splice(lostPool[piece.c].indexOf(to), 1);
    piece.t = to;
    events.push({ type: 'promote', at: p.at, id: piece.id, color: piece.c, to });
  }

  const destroyed = { w: [...lostPool.w], b: [...lostPool.b] };
  for (const d of dead) destroyed[d.piece.c].push(d.piece.t);

  const logEntry = {
    round: state.round,
    actions: {
      w: actions.w && state.board[actions.w.from]
        ? { ...actions.w, piece: describePiece(state.board[actions.w.from]) }
        : null,
      b: actions.b && state.board[actions.b.from]
        ? { ...actions.b, piece: describePiece(state.board[actions.b.from]) }
        : null,
    },
    events,
    phaseBefore: state.phase,
    activeBefore: state.active,
    freeTurnBefore: !!state.freeTurn,
  };

  const next = {
    ...state,
    board,
    destroyed,
    pending: { w: null, b: null },
    log: [...state.log, logEntry],
    round: state.round + 1,
    freeTurn: false,
    active: null,
    phase: 'simultaneous',
    passStreak:
      actions.w && actions.b && actions.w.k === 'pass' && actions.b.k === 'pass'
        ? (state.passStreak || 0) + 1
        : 0,
  };

  /* ---- result & next phase ---- */
  const wk = findKing(board, WHITE);
  const bk = findKing(board, BLACK);
  if (wk < 0 || bk < 0) {
    if (wk < 0 && bk < 0) next.result = { type: 'draw', reason: 'Both kings were destroyed.' };
    else next.result = { type: 'win', winner: wk < 0 ? BLACK : WHITE, reason: 'King destroyed.' };
    next.phase = 'over';
    logEntry.check = { w: false, b: false };
    return next;
  }

  // Bare kings cannot mate: the game is a draw.
  if (board.every((p) => !p || p.t === 'k')) {
    next.result = { type: 'draw', reason: 'Only the two kings are left.' };
    next.phase = 'over';
    logEntry.check = { w: false, b: false };
    return next;
  }

  const wCheck = inCheck(board, WHITE);
  const bCheck = inCheck(board, BLACK);
  logEntry.check = { w: wCheck, b: bCheck };

  const wCan = wCheck ? hasLegalMove(board, WHITE) : true;
  const bCan = bCheck ? hasLegalMove(board, BLACK) : true;

  if (!wCan || !bCan) {
    if (!wCan && !bCan) next.result = { type: 'draw', reason: 'Both kings are checkmated.' };
    else next.result = { type: 'win', winner: wCan ? WHITE : BLACK, reason: 'Checkmate.' };
    next.phase = 'over';
    return next;
  }

  if (wCheck && bCheck) {
    next.phase = 'simultaneous';
  } else if (wCheck) {
    next.phase = 'solo';
    next.active = WHITE;
  } else if (bCheck) {
    next.phase = 'solo';
    next.active = BLACK;
  } else if (state.phase === 'solo' && !state.freeTurn) {
    // The checked side just answered the check: the opponent gets one free turn.
    next.phase = 'solo';
    next.active = other(state.active);
    next.freeTurn = true;
  } else {
    next.phase = 'simultaneous';
  }

  // Clocks: charge every bit of overtime each player spent on this round
  // (free time is 10s per move; anything beyond that comes out of the
  // player's cumulative 5-minute reserve), then hand out fresh free time.
  const actors = actorsOf(next);
  const nextClocks = {};
  for (const c of COLORS) {
    if (state.untimed) {
      nextClocks[c] = { reserve: 0, freeStart: null };
      continue;
    }
    const prev = state.clocks[c];
    const decidedAt = state.decided?.[c];
    let reserve = prev.reserve;
    if (decidedAt != null && prev.freeStart != null) {
      const overtime = Math.max(0, decidedAt - prev.freeStart - (state.freeMs || FREE_MS));
      reserve = Math.max(0, reserve - overtime);
    }
    nextClocks[c] = { reserve, freeStart: actors.includes(c) ? now : null };
  }
  next.clocks = nextClocks;
  next.decided = { w: null, b: null };

  // Two rounds in a row where both sides passed: nothing is happening.
  if (!next.result && next.passStreak >= 2) {
    next.result = { type: 'draw', reason: 'Both players passed twice in a row.' };
    next.phase = 'over';
    return next;
  }

  // Threefold repetition of (position + turn structure).
  const key = boardKey(board) + '|' + next.phase + '|' + (next.active || '-') + '|' + (next.freeTurn ? 'f' : 's');
  next.repetition = { ...state.repetition, [key]: (state.repetition[key] || 0) + 1 };
  if (!next.result && next.repetition[key] >= 3) {
    next.result = { type: 'draw', reason: 'Threefold repetition.' };
    next.phase = 'over';
  }

  // Hard limit: if the 99th round is over and nobody has won, the game is drawn.
  if (!next.result && next.round > MAX_ROUNDS) {
    next.round = MAX_ROUNDS; // the pill should read the turn that ended it
    next.result = { type: 'draw', reason: 'No winner after 99 turns.' };
    next.phase = 'over';
  }

  return next;
}

/* ------------------------------------------------------------------ */
/* Clocks                                                              */
/* ------------------------------------------------------------------ */

export function clockOf(state, color, now = Date.now()) {
  if (state.untimed) {
    return { free: 0, reserve: 0, running: false, spent: 0, frozen: false, untimed: true };
  }
  const c = state.clocks ? state.clocks[color] : null;
  if (!c) return { free: state.freeMs || FREE_MS, reserve: 0, running: false, spent: 0, frozen: false };
  const freeMs = state.freeMs || FREE_MS;
  const at = c.until != null ? Math.min(now, c.until) : now;
  const base = { free: freeMs, reserve: c.reserve, running: false, spent: 0, frozen: false };
  if (c.freeStart == null) return base;
  const elapsed = Math.max(0, at - c.freeStart);
  if (elapsed <= freeMs) return { ...base, free: freeMs - elapsed, running: true, frozen: c.until != null, spent: 0 };
  const over = elapsed - freeMs;
  return {
    free: 0,
    reserve: Math.max(0, c.reserve - over),
    running: true,
    frozen: c.until != null,
    spent: over,
    expired: c.reserve - over <= 0,
  };
}

/**
 * Cash out the current free window into the reserve without advancing the
 * round. `resolveRound` charges overtime itself, so this is only for callers
 * that need a checkpoint (the deduction is not applied twice).
 */
export function settleClock(state, color, now = Date.now()) {
  if (state.untimed) return state;
  const c = state.clocks[color];
  if (c.freeStart == null) return state;
  const freeMs = state.freeMs || FREE_MS;
  const elapsed = Math.max(0, now - c.freeStart);
  const reserve = Math.max(0, c.reserve - Math.max(0, elapsed - freeMs));
  return {
    ...state,
    clocks: { ...state.clocks, [color]: { ...c, reserve, freeStart: now } },
  };
}

export function expiredColors(state, now = Date.now()) {
  if (state.untimed) return [];
  return actorsOf(state).filter((c) => {
    const clock = clockOf(state, c, now);
    return clock.running && clock.reserve <= 0 && clock.free <= 0;
  });
}

/**
 * What happens when a player's clock runs out.
 *
 * A turn is skipped automatically — and skipping is exactly a pass, which is
 * only legal out of check. So a player who owes a reply to a check cannot be
 * skipped: instead they lose the game. In every other situation the timeout
 * simply passes for them.
 *
 * Returns { action } for a skip, or { result } for a loss.
 */
export function timeoutOutcome(state, color) {
  if (canPass(state, color)) return { action: { k: 'pass' }, result: null };
  return {
    action: null,
    result: { type: 'win', winner: other(color), reason: 'Time ran out while in check.' },
  };
}

/**
 * Apply a clock expiry for `color` to the state. Returns { state } (the same
 * shape as submitAction) or { error }. Safe players get a pass registered or
 * resolved; a checked player's game ends immediately.
 */
export function applyTimeout(state, color, now = Date.now()) {
  const outcome = timeoutOutcome(state, color);
  if (outcome.result) {
    return {
      state: {
        ...state,
        result: outcome.result,
        phase: 'over',
        pending: { w: null, b: null },
        decided: { w: null, b: null },
      },
    };
  }
  return submitAction(state, color, outcome.action, now);
}

/* ------------------------------------------------------------------ */
/* View for a specific player (opponent decisions stay hidden)         */
/* ------------------------------------------------------------------ */

export function playerView(state, color) {
  const me = color || WHITE;
  const freeze = (c, decidedAt) => (decidedAt != null && c.freeStart != null ? { ...c, until: decidedAt } : c);
  return {
    board: state.board,
    phase: state.phase,
    active: state.active,
    freeTurn: state.freeTurn,
    round: state.round,
    destroyed: state.destroyed,
    clocks: {
      w: freeze(state.clocks.w, state.decided?.w),
      b: freeze(state.clocks.b, state.decided?.b),
    },
    freeMs: state.freeMs || FREE_MS,
    reserveMs: state.reserveMs || RESERVE_MS,
    untimed: !!state.untimed,
    log: state.log,
    result: state.result,
    myColor: me,
    locked: !!state.pending[me],
    promo: state.pending[me],
  };
}

/** Compact board description used by the text log / debugging. */
export function describeBoard(board) {
  const rows = [];
  for (let r = 0; r < 8; r++) {
    let line = '';
    for (let c = 0; c < 8; c++) {
      const p = board[idx(r, c)];
      line += p ? (p.c === WHITE ? p.t.toUpperCase() : p.t) : '.';
    }
    rows.push(line);
  }
  return rows.join('/');
}
