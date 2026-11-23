/**
 * Two bots for single player.
 *
 * `easy` is the original 1-ply bot: it knows the rules (it uses the shared
 * move generator) but only looks at the position directly after its own move.
 *
 * `hard` is rule-aware and looks one exchange ahead: for every candidate it
 * assumes the opponent answers with the reply that hurts it most. Its
 * evaluation explicitly values the variant's late rules:
 *   - back attacks (the hook) are good, and leaving a pawn hooked is bad;
 *   - overextending a piece is a cost, and capturing an overextended piece
 *     is a bonus;
 *   - checks hand the opponent a forced solo reply, so they are worth more;
 *   - mobility and king safety are counted.
 *
 * Both levels choose only from the shared legal-move generator, so they can
 * never cheat or use a hidden pending move.
 */

import {
  WHITE,
  PIECE_VALUE,
  legalMoves,
  applyMove,
  promoOptions,
  canPass,
  inCheck,
  isAttacked,
  materialCount,
  rowOf,
  colOf,
  other,
  findKing,
  pseudoMoves,
  backAttacks,
  resolveRound,
  idx,
  inside,
} from './engine.mjs';

export const AI_LEVELS = ['easy', 'hard'];

/* ------------------------------------------------------------------ */
/* Easy — the original 1-ply bot                                      */
/* ------------------------------------------------------------------ */

function positionScore(board, color) {
  let s = 0;
  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (!p) continue;
    const r = rowOf(i);
    const c = colOf(i);
    const centre = (3.5 - Math.abs(3.5 - r)) * 0.05 + (3.5 - Math.abs(3.5 - c)) * 0.05;
    let v = centre * (p.t === 'p' ? 0.5 : 1);
    if (p.t === 'p') {
      // advanced pawns are worth a little more
      const adv = p.c === WHITE ? 6 - r : r - 1;
      v += Math.max(0, adv) * 0.05;
    }
    s += p.c === color ? v : -v;
  }
  return s;
}

function evaluate(board, color) {
  return materialCount(board, color) - materialCount(board, other(color)) + positionScore(board, color);
}

function scoreMove(state, color, move, promo) {
  const board = applyMove(state.board, move.from, move.to, promo);
  const piece = board[move.to];
  if (!piece) return -Infinity;

  let score = evaluate(board, color);

  // Giving check is strong here: the opponent must answer it alone.
  if (inCheck(board, other(color))) score += 1.1;

  const attacked = isAttacked(board, move.to, other(color));
  if (attacked) {
    const defended = isAttacked(board, move.to, color);
    if (!defended) score -= PIECE_VALUE[piece.t] * 0.75;
    else score -= PIECE_VALUE[piece.t] * 0.3;
  }

  // Do not wander with the king while it is safe.
  if (piece.t === 'k' && !inCheck(state.board, color)) score -= 0.45;

  const promoBonus = move.promo && promo ? PIECE_VALUE[promo] * 0.5 : 0;

  return score + promoBonus + Math.random() * 0.16;
}

export function chooseEasyAction(state, color) {
  const moves = legalMoves(state.board, color);
  if (!moves.length) return { k: 'pass' };

  const options = promoOptions(state, color);
  let best = null;
  let bestScore = -Infinity;

  for (const move of moves) {
    const promo = move.promo && options.length ? options[0] : undefined;
    const score = scoreMove(state, color, move, promo);
    if (score > bestScore) {
      bestScore = score;
      best = {
        k: 'move',
        from: move.from,
        to: move.to,
        ...(move.back != null ? { back: move.back } : {}),
        ...(promo ? { promo } : {}),
      };
    }
  }

  // Passing is a legal option when the king is safe; take it when every
  // move would only lose material.
  if (canPass(state, color)) {
    const passive = evaluate(state.board, color) - 0.05;
    if (passive > bestScore) return { k: 'pass' };
  }

  return best || { k: 'pass' };
}

/* ------------------------------------------------------------------ */
/* Hard — rule-aware one-exchange search                              */
/* ------------------------------------------------------------------ */

const HARD = {
  // Search every legal action of our own: a defensive move can look passive
  // when the opponent is assumed to pass, so trimming our list loses games.
  ownLimit: 64,
  replyLimit: 18,
  hookValue: 0.24,
  pinBase: 0.5,
  pinPerValue: 0.12,
  mobility: 0.012,
  kingRing: 0.09,
  checkFor: 1.0,
  checkAgainst: 1.15,
  passedPawn: 0.08,
  doubledPawn: -0.1,
  isolatedPawn: -0.07,
};

/** How many enemy pawns can this side's rooks/queens hook right now? */
function hookCount(board, color) {
  let n = 0;
  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (!p || p.c !== color || (p.t !== 'r' && p.t !== 'q')) continue;
    n += backAttacks(board, i, p, color).length;
  }
  return n;
}

/** Cheap mobility: pseudo-legal destinations, without king-safety checks. */
function mobilityCount(board, color) {
  let n = 0;
  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (p && p.c === color) n += pseudoMoves(board, i).length;
  }
  return n;
}

function pawnStructure(board, color) {
  const files = new Array(8).fill(0);
  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (p && p.c === color && p.t === 'p') files[colOf(i)]++;
  }

  let s = 0;
  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (!p || p.c !== color || p.t !== 'p') continue;
    const r = rowOf(i);
    const c = colOf(i);

    if (files[c] > 1) s += HARD.doubledPawn;
    const beside = (c > 0 && files[c - 1]) || (c < 7 && files[c + 1]);
    if (!beside) s += HARD.isolatedPawn;

    // A passed pawn has no enemy pawn ahead on its own or adjacent files.
    const dir = p.c === WHITE ? -1 : 1;
    let passed = true;
    for (let rr = r + dir; rr >= 0 && rr < 8 && passed; rr += dir) {
      for (let dc = -1; dc <= 1; dc++) {
        const cc = c + dc;
        if (cc < 0 || cc > 7) continue;
        const q = board[idx(rr, cc)];
        if (q && q.c !== p.c && q.t === 'p') {
          passed = false;
          break;
        }
      }
    }
    if (passed) s += HARD.passedPawn * (p.c === WHITE ? 7 - r : r);
  }
  return s;
}

function kingRing(board, color) {
  const k = findKing(board, color);
  if (k < 0) return -30;
  const kr = rowOf(k);
  const kc = colOf(k);
  const enemy = other(color);
  let s = 0;
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (!inside(kr + dr, kc + dc)) continue;
      if (isAttacked(board, idx(kr + dr, kc + dc), enemy)) s -= HARD.kingRing;
    }
  }
  return s;
}

function heuristicBoard(board, color) {
  let s = evaluate(board, color);

  // Overextended pieces are frozen for a round: a real tempo cost. If one
  // is also attacked and undefended it cannot run, so it is effectively lost.
  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (!p || !p.overextended) continue;
    const value = PIECE_VALUE[p.t];
    const mine = p.c === color;
    const attacked = isAttacked(board, i, other(p.c));
    const defended = isAttacked(board, i, p.c);
    if (attacked && !defended) {
      s += mine ? -value : value;
    } else {
      const w = HARD.pinBase + value * HARD.pinPerValue;
      s += mine ? -w : w;
      if (attacked) s += mine ? -value * 0.15 : value * 0.15;
    }
  }

  // Hooks available to each side. This also prices "leave a pawn hooked".
  s += (hookCount(board, color) - hookCount(board, other(color))) * HARD.hookValue;
  s += (mobilityCount(board, color) - mobilityCount(board, other(color))) * HARD.mobility;
  s += pawnStructure(board, color) - pawnStructure(board, other(color));
  s += kingRing(board, color) - kingRing(board, other(color));

  // Giving check forces a solo reply; being in check forces one on us.
  if (inCheck(board, other(color))) s += HARD.checkFor;
  if (inCheck(board, color)) s -= HARD.checkAgainst;

  return s;
}

/**
 * Hanging pieces, phase-aware. When the opponent moves next (a solo reply or
 * the free turn that follows a check), an attacked, undefended piece is in
 * real danger. When we move next, it is our turn to grab theirs.
 */
function threatScore(board, color, myWeight, theirWeight) {
  const foe = other(color);
  let s = 0;
  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (!p || p.t === 'k' || p.overextended) continue; // pins are priced above
    if (!isAttacked(board, i, foe)) continue;
    const defended = isAttacked(board, i, p.c);
    const v = PIECE_VALUE[p.t] * (defended ? 0.2 : 0.65);
    s += p.c === color ? -myWeight * v : theirWeight * v;
  }
  return s;
}

function leafScore(res, color) {
  if (res.result) {
    if (res.result.type === 'draw') return 0;
    return res.result.winner === color ? 10000 : -10000;
  }

  let s = heuristicBoard(res.board, color);
  if (res.phase === 'solo' && res.active !== color) {
    // The opponent acts alone next: our loose pieces are exposed.
    s += threatScore(res.board, color, 1.1, 0.25);
  } else if (res.phase === 'solo') {
    // We act alone next: we can collect their loose pieces.
    s += threatScore(res.board, color, 0.25, 1.1);
  } else {
    s += threatScore(res.board, color, 0.5, 0.5);
  }
  return s;
}

/** Resolve a hypothetical pair of decisions without touching the real state. */
function resolveSim(state, pending, now) {
  return resolveRound(
    {
      ...state,
      pending: { w: null, b: null, ...pending },
      decided: { w: null, b: null },
      untimed: true,
    },
    now
  );
}

function bestPromo(state, color) {
  const opts = promoOptions(state, color);
  if (!opts.length) return undefined;
  return opts.slice().sort((a, b) => PIECE_VALUE[b] - PIECE_VALUE[a])[0];
}

function actionsFor(state, color) {
  const promo = bestPromo(state, color);
  const out = [];
  for (const m of legalMoves(state.board, color)) {
    out.push({
      k: 'move',
      from: m.from,
      to: m.to,
      ...(m.back != null ? { back: m.back } : {}),
      ...(m.promo && promo ? { promo } : {}),
    });
  }
  if (canPass(state, color)) out.push({ k: 'pass' });
  return out;
}

/** Put the most promising actions first, scoring each against a passive reply. */
function rankActions(state, color, now) {
  return actionsFor(state, color)
    .map((a) => {
      const res = resolveSim(state, { [color]: a }, now);
      return { a, s: leafScore(res, color) };
    })
    .sort((x, y) => y.s - x.s);
}

function pickCandidates(ranked, limit) {
  // Never discard a hook, even if the passive score ranks it low: its value
  // only shows up when the hooked pawn advances.
  return ranked.filter((x, i) => i < limit || x.a.back != null).slice(0, limit + 4);
}

export function chooseHardAction(state, color, now = Date.now()) {
  if (!state || state.phase === 'over') return { k: 'pass' };
  if (state.phase === 'solo' && state.active !== color) return { k: 'pass' };

  const mine = pickCandidates(rankActions(state, color, now), HARD.ownLimit);
  if (!mine.length) return { k: 'pass' };

  let best = null;
  let bestScore = -Infinity;
  const consider = (action, score) => {
    const jittered = score + Math.random() * 0.02;
    if (jittered > bestScore) {
      bestScore = jittered;
      best = action;
    }
  };

  if (state.phase === 'solo') {
    for (const { a } of mine) {
      consider(a, leafScore(resolveSim(state, { [color]: a }, now), color));
    }
    return best || { k: 'pass' };
  }

  const foe = other(color);
  const replies = pickCandidates(rankActions(state, foe, now), HARD.replyLimit);

  for (const { a } of mine) {
    let worst = Infinity;
    if (!replies.length) {
      worst = leafScore(resolveSim(state, { [color]: a }, now), color);
    } else {
      for (const { a: reply } of replies) {
        const res = resolveSim(state, { [color]: a, [foe]: reply }, now);
        const s = leafScore(res, color);
        if (s < worst) worst = s;
      }
    }
    consider(a, worst);
  }

  return best || { k: 'pass' };
}

/* ------------------------------------------------------------------ */
/* Public entry point                                                 */
/* ------------------------------------------------------------------ */

export function chooseAiAction(state, color, level = 'easy') {
  return level === 'hard' ? chooseHardAction(state, color) : chooseEasyAction(state, color);
}
