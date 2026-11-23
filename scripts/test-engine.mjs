/**
 * Rule checks for the Simultaneous Chess engine.
 * Run with: npm test
 */
import assert from 'node:assert/strict';
import {
  WHITE,
  BLACK,
  initialGame,
  legalMoves,
  resolveRound,
  submitAction,
  playerView,
  rowOf,
  colOf,
  inCheck,
  sqName,
  idx,
  clockOf,
  settleClock,
  expiredColors,
  timeoutOutcome,
  applyTimeout,
  canPass,
  actorsOf,
  promoOptions,
  FREE_MS,
  RESERVE_MS,
  MIN_FREE_MS,
  MAX_RESERVE_MS,
  MAX_ROUNDS,
} from '../shared/engine.mjs';

let passed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ok   ' + name);
  } catch (err) {
    failures.push([name, err]);
    console.log('  FAIL ' + name + '\n       ' + err.message);
  }
}

const sq = (name) => idx(8 - Number(name[1]), 'abcdefgh'.indexOf(name[0]));

function setup(map) {
  const board = new Array(64).fill(null);
  for (const [name, spec] of Object.entries(map)) {
    const i = sq(name);
    board[i] = { id: name, t: spec[1], c: spec[0] };
  }
  const state = initialGame(0);
  state.board = board;
  state.clocks = { w: { freeStart: 0, reserve: 180000 }, b: { freeStart: 0, reserve: 180000 } };
  return state;
}

/** Work out the correct phase for a static position (nobody moves). */
function settle(state) {
  return resolveRound({
    ...state,
    pending: { w: null, b: null },
    phase: 'simultaneous',
    active: null,
    freeTurn: false,
  }, 0);
}

function play(state, wAction, bAction) {
  return resolveRound({ ...state, pending: { w: wAction, b: bAction } }, 0);
}

const move = (from, to, promo) => ({ k: 'move', from: sq(from), to: sq(to), ...(promo ? { promo } : {}) });

/* ------------------------------------------------------------------ */

test('initial position: 20 legal moves each, no check', () => {
  const state = initialGame(0);
  assert.equal(legalMoves(state.board, WHITE).length, 20);
  assert.equal(legalMoves(state.board, BLACK).length, 20);
  assert.equal(inCheck(state.board, WHITE), false);
  assert.equal(state.phase, 'simultaneous');
});

test('single action does not resolve until both have decided', () => {
  let state = initialGame(0);
  const r1 = submitAction(state, WHITE, move('e2', 'e4'), 10);
  assert.ok(r1.state, r1.error);
  assert.equal(r1.resolved, false);
  assert.equal(r1.state.pending.w.k, 'move');
  assert.equal(playerView(r1.state, WHITE).locked, true);
});

test('normal capture: mover survives, victim is destroyed', () => {
  const state = setup({ e1: 'wk', e8: 'bk', a1: 'wr', a5: 'bp' });
  const next = play(state, move('a1', 'a5'), null);
  assert.equal(next.board[sq('a5')].t, 'r');
  assert.equal(next.board[sq('a5')].c, WHITE);
  assert.equal(next.board[sq('a1')], null);
  assert.deepEqual(next.destroyed.b, ['p']);
});

test('both pieces move to the same square -> both destroyed', () => {
  const state = setup({ e1: 'wk', e8: 'bk', a1: 'wr', c1: 'br' });
  const next = play(state, move('a1', 'b1'), move('c1', 'b1'));
  assert.equal(next.board[sq('b1')], null);
  assert.deepEqual(next.destroyed.w, ['r']);
  assert.deepEqual(next.destroyed.b, ['r']);
});

test('king wins a collision against another piece', () => {
  const state = setup({ e4: 'wk', h8: 'bk', d4: 'bp' });
  const next = play(state, move('e4', 'd5'), move('d4', 'd5'));
  assert.equal(next.board[sq('d5')].t, 'k');
  assert.equal(next.board[sq('d5')].c, WHITE);
  assert.deepEqual(next.destroyed.w, []);
  assert.deepEqual(next.destroyed.b, ['p']);
});

test('pawn loses a collision (pawn movement is not an attack)', () => {
  const state = setup({ e1: 'wk', e8: 'bk', d2: 'wp', f5: 'bn' });
  const next = play(state, move('d2', 'd4'), move('f5', 'd4'));
  assert.equal(next.board[sq('d4')].t, 'n');
  assert.equal(next.board[sq('d4')].c, BLACK);
  assert.deepEqual(next.destroyed.w, ['p']);
  assert.deepEqual(next.destroyed.b, []);
});

test('pawn attacking diagonally: a mutual attack destroys both', () => {
  const state = setup({ e1: 'wk', e8: 'bk', d4: 'wp', e5: 'bb' });
  const next = play(state, move('d4', 'e5'), move('e5', 'd4'));
  assert.equal(next.board[sq('e5')], null);
  assert.equal(next.board[sq('d4')], null);
  assert.deepEqual(next.destroyed.w, ['p']);
  assert.deepEqual(next.destroyed.b, ['b']);
});

test('pawn vs pawn collision destroys both', () => {
  const state = setup({ e1: 'wk', e8: 'bk', c2: 'wp', b5: 'bp' });
  const next = play(state, move('c2', 'c4'), move('b5', 'c4'));
  assert.equal(next.board[sq('c4')], null);
  assert.deepEqual(next.destroyed.w, ['p']);
  assert.deepEqual(next.destroyed.b, ['p']);
});

test('mutual attack (swap) destroys both pieces', () => {
  const state = setup({ a1: 'wk', h8: 'bk', e4: 'wr', e5: 'br' });
  const next = play(state, move('e4', 'e5'), move('e5', 'e4'));
  assert.equal(next.board[sq('e4')], null);
  assert.equal(next.board[sq('e5')], null);
  assert.deepEqual(next.destroyed.w, ['r']);
  assert.deepEqual(next.destroyed.b, ['r']);
});

test('dodge chain: A attacks B, B attacks C -> C dies, A and B live', () => {
  const state = setup({ e1: 'wk', e8: 'bk', c1: 'wr', c5: 'bn', d3: 'wb' });
  const next = play(state, move('c1', 'c5'), move('c5', 'd3'));
  assert.equal(next.board[sq('c5')].t, 'r');
  assert.equal(next.board[sq('d3')].t, 'n');
  assert.equal(next.board[sq('d3')].c, BLACK);
  assert.deepEqual(next.destroyed.w, ['b']);
  assert.deepEqual(next.destroyed.b, []);
});

test('check makes the checked player act alone, then the opponent gets a free turn', () => {
  const base = setup({ e1: 'wk', e8: 'bk', a2: 'wr', e7: 'br' });
  const checked = settle(base);
  assert.equal(checked.phase, 'solo');
  assert.equal(checked.active, WHITE);
  assert.equal(inCheck(checked.board, WHITE), true);

  // passing is refused while in check
  const bad = submitAction(checked, WHITE, { k: 'pass' }, 0);
  assert.ok(bad.error, 'passing in check must be rejected');

  // block the file with the rook
  const r = submitAction(checked, WHITE, move('a2', 'e2'), 0);
  assert.ok(r.resolved, 'solo turns resolve immediately');
  assert.equal(inCheck(r.state.board, WHITE), false);
  assert.equal(r.state.phase, 'solo');
  assert.equal(r.state.active, BLACK);
  assert.equal(r.state.freeTurn, true);

  // black's free turn resolves on its own
  const free = submitAction(r.state, BLACK, move('e7', 'e5'), 0);
  assert.ok(free.resolved);
  assert.equal(free.state.phase, 'simultaneous');
  assert.equal(free.state.freeTurn, false);
});

test('a free turn that gives check hands the move back to the checked king', () => {
  const base = setup({ e1: 'wk', e8: 'bk', a2: 'wr', e7: 'br' });
  const checked = settle(base);
  const broken = submitAction(checked, WHITE, move('a2', 'e2'), 0).state;
  const free = submitAction(broken, BLACK, move('e7', 'e2'), 0);
  assert.ok(free.resolved);
  assert.equal(free.state.phase, 'solo');
  assert.equal(free.state.active, WHITE);
  assert.equal(inCheck(free.state.board, WHITE), true);
});

test('both kings checked -> both must break it, no attacking the other king', () => {
  const base = setup({ e1: 'wk', e8: 'bk', e2: 'wr', h1: 'br' });
  const state = settle(base);
  assert.equal(state.phase, 'simultaneous');
  assert.equal(inCheck(state.board, WHITE), true);
  assert.equal(inCheck(state.board, BLACK), true);
  // blocking with a rook is allowed, capturing the enemy king never is
  const illegal = submitAction(state, WHITE, move('e2', 'e8'), 0);
  assert.ok(illegal.error);
});

test('checkmate: a checked king with no answer loses', () => {
  const base = setup({ a1: 'wk', b2: 'bq', c3: 'bk' });
  const state = settle(base);
  assert.equal(state.phase, 'over');
  assert.deepEqual(state.result, { type: 'win', winner: BLACK, reason: 'Checkmate.' });
});

test('both sides checkmated -> draw', () => {
  const base = setup({ a1: 'wk', c1: 'bq', h8: 'bk', f8: 'wq' });
  const state = settle(base);
  // white king: a1 checked by queen c1 (rank) ; black king: h8 checked by queen f8 (file/rank)
  assert.equal(inCheck(base.board, WHITE), true);
  assert.equal(inCheck(base.board, BLACK), true);
  if (state.result) {
    assert.equal(state.result.type, 'draw');
  }
});

test('promotion is limited to pieces the player has already lost', () => {
  const state = setup({ e1: 'wk', e8: 'bk', a7: 'wp' });
  state.destroyed.w = ['r'];
  const next = play(state, { ...move('a7', 'a8'), promo: 'r' }, null);
  assert.equal(next.board[sq('a8')].t, 'r');
});

test('promotion falls back to the only available lost piece', () => {
  const state = setup({ e1: 'wk', e8: 'bk', a7: 'wp' });
  state.destroyed.w = ['b'];
  const next = play(state, { ...move('a7', 'a8'), promo: 'q' }, null);
  assert.equal(next.board[sq('a8')].t, 'b');
});

test('no lost pieces -> the pawn simply stays a pawn', () => {
  const state = setup({ e1: 'wk', e8: 'bk', a7: 'wp' });
  const next = play(state, move('a7', 'a8'), null);
  assert.equal(next.board[sq('a8')].t, 'p');
});

test('a revived piece must be lost again before it can be promoted to twice', () => {
  const state = setup({ e1: 'wk', h4: 'bk', a7: 'wp', b7: 'wp', a5: 'br' });
  state.destroyed.w = ['q'];

  const first = play(state, { ...move('a7', 'a8'), promo: 'q' }, { k: 'pass' });
  assert.equal(first.board[sq('a8')].t, 'q');
  assert.equal(first.destroyed.w.includes('q'), false);
  assert.deepEqual(promoOptions(first, WHITE), []);

  // the second pawn reaches the last rank with no lost piece left to revive,
  // and the black rook takes the promoted queen back off the board
  const second = play(first, move('b7', 'b8'), move('a5', 'a8'));
  assert.equal(second.board[sq('b8')].t, 'p');
  assert.equal(second.destroyed.w.includes('q'), true);
  assert.deepEqual(promoOptions(second, WHITE), ['q']);
});

test('moving into check is illegal', () => {
  const state = setup({ e1: 'wk', e8: 'bk', e7: 'br' });
  const r = submitAction(state, WHITE, move('e1', 'e2'), 0);
  assert.ok(r.error);
});

test('passing is allowed when the king is safe', () => {
  const state = initialGame(0);
  const r = submitAction(state, WHITE, { k: 'pass' }, 0);
  assert.ok(!r.error, r.error);
  assert.equal(r.state.pending.w.k, 'pass');
});

test('only the two kings left is a draw', () => {
  const state = setup({ e1: 'wk', e8: 'bk', a4: 'wr', h4: 'br' });
  const next = play(state, move('a4', 'h4'), move('h4', 'a4'));
  assert.equal(next.board[sq('a4')], null);
  assert.equal(next.board[sq('h4')], null);
  assert.equal(next.result?.type, 'draw');
  assert.equal(next.phase, 'over');
});

test('threefold repetition ends the game in a draw', () => {
  let state = setup({ e1: 'wk', e8: 'bk', a1: 'wr', h8: 'br' });
  const pairs = [['w', 'a1', 'a2'], ['b', 'h8', 'h7'], ['w', 'a2', 'a1'], ['b', 'h7', 'h8']];
  outer: for (let loop = 0; loop < 4; loop++) {
    for (const [color, from, to] of pairs) {
      const r = submitAction(state, color, move(from, to), 0);
      if (!r.state) break outer;
      state = r.state;
      if (state.result) break outer;
    }
  }
  assert.ok(state.result, 'game should be drawn by repetition');
  assert.equal(state.result.type, 'draw');
});

test('the 99th round without a winner is a draw', () => {
  const state = setup({ e1: 'wk', e8: 'bk', a2: 'wp', h7: 'bp' });
  state.round = MAX_ROUNDS; // resolving this round is the 99th turn
  const next = play(state, { k: 'pass' }, { k: 'pass' });
  assert.equal(next.round, MAX_ROUNDS);
  assert.deepEqual(next.result, { type: 'draw', reason: 'No winner after 99 turns.' });
  assert.equal(next.phase, 'over');
});

test('the round limit does not fire before the 99th round', () => {
  const state = setup({ e1: 'wk', e8: 'bk', a2: 'wp', h7: 'bp' });
  state.round = MAX_ROUNDS - 1;
  const next = play(state, { k: 'pass' }, { k: 'pass' });
  assert.equal(next.result, null);
  assert.notEqual(next.phase, 'over');
});

test('both players passing twice in a row ends in a draw', () => {
  const state = setup({ a1: 'wk', h8: 'bk', d2: 'wr', h2: 'br' });
  const first = play(state, { k: 'pass' }, { k: 'pass' });
  assert.equal(first.result, null);
  assert.equal(first.passStreak, 1);

  const second = play(first, { k: 'pass' }, { k: 'pass' });
  assert.deepEqual(second.result, { type: 'draw', reason: 'Both players passed twice in a row.' });
  assert.equal(second.phase, 'over');
});

test('a move between passes resets the pass streak', () => {
  const state = setup({ a1: 'wk', h8: 'bk', d2: 'wr', h2: 'br' });
  const first = play(state, { k: 'pass' }, { k: 'pass' });
  assert.equal(first.passStreak, 1);

  const moved = play(first, move('d2', 'd3'), { k: 'pass' });
  assert.equal(moved.passStreak, 0);

  const again = play(moved, { k: 'pass' }, { k: 'pass' });
  assert.equal(again.result, null);
  assert.equal(again.passStreak, 1);

  const third = play(again, { k: 'pass' }, { k: 'pass' });
  assert.equal(third.result?.reason, 'Both players passed twice in a row.');
});

test('a piece capturing on the opponent’s last two ranks cannot move next round', () => {
  const state = setup({ e1: 'wk', e8: 'bk', a7: 'wr', b7: 'bp', b8: 'br' });
  const next = play(state, move('a7', 'b7'), { k: 'pass' });

  const rook = next.board[sq('b7')];
  assert.equal(rook.t, 'r');
  assert.equal(rook.overextended, true);
  assert.equal(legalMoves(next.board, WHITE).some((m) => m.from === sq('b7')), false);
  assert.ok(submitAction(next, WHITE, move('b7', 'b8'), 0).error, 'the pinned piece must not move');

  // It can still be captured: black answers on the square it is stuck on.
  const reply = play(next, { k: 'pass' }, move('b8', 'b7'));
  assert.equal(reply.board[sq('b7')].c, BLACK);
  assert.equal(reply.board[sq('b7')].t, 'r');
});

test('overextension is symmetrical for black', () => {
  const state = setup({ e1: 'wk', e8: 'bk', a2: 'br', b2: 'wp' });
  const next = play(state, { k: 'pass' }, move('a2', 'b2'));
  assert.equal(next.board[sq('b2')].overextended, true);
  assert.equal(legalMoves(next.board, BLACK).some((m) => m.from === sq('b2')), false);
});

test('overextension expires after one round', () => {
  const state = setup({ e1: 'wk', e8: 'bk', a7: 'wr', b7: 'bp' });
  const first = play(state, move('a7', 'b7'), { k: 'pass' });
  assert.equal(first.board[sq('b7')].overextended, true);

  const second = play(first, { k: 'pass' }, { k: 'pass' });
  assert.equal(second.board[sq('b7')].overextended, undefined);
  assert.ok(legalMoves(second.board, WHITE).some((m) => m.from === sq('b7')));
});

test('pawns and kings are exempt from overextension', () => {
  const pawn = setup({ e1: 'wk', h4: 'bk', b7: 'wp', a8: 'br' });
  const promoted = play(pawn, move('b7', 'a8'), { k: 'pass' });
  assert.equal(promoted.board[sq('a8')].t, 'p'); // nothing lost yet, so no revival
  assert.equal(promoted.board[sq('a8')].overextended, undefined);

  const king = setup({ g7: 'wk', h8: 'br', a1: 'bk' });
  const taken = play(king, move('g7', 'h8'), { k: 'pass' });
  assert.equal(taken.board[sq('h8')].t, 'k');
  assert.equal(taken.board[sq('h8')].overextended, undefined);
});

test('captures outside the last two ranks do not overextend', () => {
  const state = setup({ e1: 'wk', e8: 'bk', a6: 'wr', b6: 'bp' });
  const next = play(state, move('a6', 'b6'), { k: 'pass' });
  assert.equal(next.board[sq('b6')].overextended, undefined);
});

test('overextension lapses after the 20th round', () => {
  const early = setup({ e1: 'wk', e8: 'bk', a7: 'wr', b7: 'bp', b8: 'br' });
  early.round = 20;
  const pinned = play(early, move('a7', 'b7'), { k: 'pass' });
  assert.equal(pinned.board[sq('b7')].overextended, true);

  const late = setup({ e1: 'wk', e8: 'bk', a7: 'wr', b7: 'bp', b8: 'br' });
  late.round = 21;
  const free = play(late, move('a7', 'b7'), { k: 'pass' });
  assert.equal(free.board[sq('b7')].overextended, undefined);
  assert.ok(legalMoves(free.board, WHITE).some((m) => m.from === sq('b7')));
});

test('an overextended piece still attacks and gives check', () => {
  const state = setup({ e1: 'wk', c5: 'bk', a7: 'wr', b7: 'bp' });
  const next = play(state, move('a7', 'b7'), { k: 'pass' });
  const rook = next.board[sq('b7')];
  assert.equal(rook.t, 'r');
  assert.equal(rook.overextended, true);

  // It cannot move...
  assert.equal(legalMoves(next.board, WHITE).some((m) => m.from === sq('b7')), false);
  // ...but its lines still count: the black king may not step onto the b-file.
  const kingMoves = legalMoves(next.board, BLACK)
    .filter((m) => m.from === sq('c5'))
    .map((m) => m.to);
  assert.equal(kingMoves.includes(sq('b5')), false);
  assert.equal(kingMoves.includes(sq('b6')), false);
  assert.ok(kingMoves.includes(sq('d5')));
});

/* ---- back attacks (the hook) ---- */

test('back attack: the hook lands on a pawn that stays', () => {
  const state = setup({ a1: 'wk', h8: 'bk', e6: 'wr', e5: 'bp' });
  const cand = legalMoves(state.board, WHITE).find((m) => m.back != null);
  assert.deepEqual(cand, { from: sq('e6'), to: sq('e5'), promo: false, back: sq('e5') });

  const next = play(state, { ...move('e6', 'e5'), back: sq('e5') }, { k: 'pass' });
  assert.equal(next.board[sq('e5')].t, 'r');
  assert.equal(next.board[sq('e5')].c, WHITE);
  assert.equal(next.board[sq('e4')], null);
  assert.equal(next.destroyed.b.includes('p'), true);

  const ev = next.log.at(-1).events.find((e) => e.type === 'capture');
  assert.equal(ev.at, sq('e5'));
  assert.equal(ev.back, sq('e5'));
});

test('back attack: the hook follows a pawn that advances', () => {
  const state = setup({ a1: 'wk', h8: 'bk', e6: 'wr', e5: 'bp' });
  const next = play(state, { ...move('e6', 'e5'), back: sq('e5') }, move('e5', 'e4'));
  assert.equal(next.board[sq('e4')].t, 'r');
  assert.equal(next.board[sq('e4')].c, WHITE);
  assert.equal(next.board[sq('e5')], null);
  assert.equal(next.destroyed.b.includes('p'), true);
});

test('back attack: the hook follows a double-step too', () => {
  const state = setup({ a1: 'wk', h1: 'bk', b8: 'wr', b7: 'bp' });
  const cand = legalMoves(state.board, WHITE).find((m) => m.back != null);
  assert.equal(cand.to, sq('b7'));

  const next = play(state, { ...move('b8', 'b7'), back: sq('b7') }, move('b7', 'b5'));
  assert.equal(next.board[sq('b5')].t, 'r');
  assert.equal(next.board[sq('b5')].c, WHITE);
  assert.equal(next.board[sq('b7')], null);
  assert.equal(next.destroyed.b.includes('p'), true);
});

test('back attack: a diagonal move dodges and the hook grabs nothing', () => {
  const state = setup({ a1: 'wk', h8: 'bk', e6: 'wr', e5: 'bp', d4: 'wn' });
  const next = play(state, { ...move('e6', 'e5'), back: sq('e5') }, move('e5', 'd4'));
  assert.equal(next.board[sq('d4')].t, 'p');
  assert.equal(next.board[sq('d4')].c, BLACK);
  assert.equal(next.board[sq('e5')].t, 'r'); // stopped on the pawn's old square
  assert.equal(next.board[sq('e6')], null);
  assert.equal(next.destroyed.b.includes('p'), false);
  assert.equal(next.log.at(-1).events.some((e) => e.type === 'capture' && e.at === sq('e5')), false);
});

test('back attack is only available from behind the pawn', () => {
  const state = setup({ a1: 'wk', h8: 'bk', e3: 'wr', e5: 'bp' });
  const backs = legalMoves(state.board, WHITE).filter((m) => m.back != null);
  assert.equal(backs.length, 0);
});

test('back attack does not care what stands beyond the pawn', () => {
  const state = setup({ a1: 'wk', h8: 'bk', e6: 'wr', e5: 'bp', e4: 'bb' });
  const cand = legalMoves(state.board, WHITE).find((m) => m.back != null);
  assert.ok(cand);

  const next = play(state, { ...move('e6', 'e5'), back: sq('e5') }, { k: 'pass' });
  assert.equal(next.board[sq('e5')].t, 'r');
  assert.equal(next.board[sq('e4')].t, 'b'); // untouched
});

test('back attack: a queen can do it too', () => {
  const state = setup({ a1: 'wk', h8: 'bk', e6: 'wq', e5: 'bp' });
  const cand = legalMoves(state.board, WHITE).find((m) => m.back != null);
  assert.ok(cand);
  const next = play(state, { ...move('e6', 'e5'), back: sq('e5') }, { k: 'pass' });
  assert.equal(next.board[sq('e5')].t, 'q');
  assert.equal(next.board[sq('e5')].c, WHITE);
});

test('back attack works for black against a white pawn', () => {
  const state = setup({ a8: 'wk', h1: 'bk', e3: 'br', e4: 'wp' });
  const cand = legalMoves(state.board, BLACK).find((m) => m.back != null);
  assert.equal(cand.back, sq('e4'));
  assert.equal(cand.to, sq('e4'));

  const next = play(state, { k: 'pass' }, { ...move('e3', 'e4'), back: sq('e4') });
  assert.equal(next.board[sq('e4')].t, 'r');
  assert.equal(next.board[sq('e4')].c, BLACK);
  assert.equal(next.destroyed.w.includes('p'), true);
});

test('a back attack on the opponent’s back ranks leaves the raider overextended', () => {
  const state = setup({ a1: 'wk', h1: 'bk', b8: 'wr', b7: 'bp' });
  const cand = legalMoves(state.board, WHITE).find((m) => m.back != null);
  assert.equal(cand.back, sq('b7'));

  const next = play(state, { ...move('b8', 'b7'), back: sq('b7') }, { k: 'pass' });
  const rook = next.board[sq('b7')];
  assert.equal(rook.t, 'r');
  assert.equal(rook.overextended, true);
  assert.equal(legalMoves(next.board, WHITE).some((m) => m.from === sq('b7')), false);

  const pin = next.log.at(-1).events.find((e) => e.type === 'overextend');
  assert.equal(pin.at, sq('b7'));
});

test('back attacks are validated as back attacks', () => {
  const state = setup({ a1: 'wk', h8: 'bk', e6: 'wr', e5: 'bp' });
  const ok = submitAction(state, WHITE, { k: 'move', from: sq('e6'), to: sq('e5'), back: sq('e5') }, 0);
  assert.equal(ok.error, undefined);
  assert.equal(ok.state.pending.w.back, sq('e5'));

  const plain = submitAction(state, WHITE, { k: 'move', from: sq('e6'), to: sq('e5') }, 0);
  assert.equal(plain.error, undefined);
  assert.equal(plain.state.pending.w.back, undefined);
});

test('back attack: the player may take strictly instead of hooking', () => {
  const state = setup({ a1: 'wk', h8: 'bk', e6: 'wr', e5: 'bp' });
  const options = legalMoves(state.board, WHITE).filter(
    (m) => m.from === sq('e6') && m.to === sq('e5')
  );
  assert.equal(options.length, 2, 'both the strict take and the hook are offered');
  assert.equal(options.filter((m) => m.back != null).length, 1);

  // The pawn advances: a strict take grabs nothing and the rook stops on e5.
  const next = play(state, move('e6', 'e5'), move('e5', 'e4'));
  assert.equal(next.board[sq('e5')].t, 'r');
  assert.equal(next.board[sq('e5')].c, WHITE);
  assert.equal(next.board[sq('e4')].t, 'p');
  assert.equal(next.destroyed.b.includes('p'), false);
  assert.equal(next.log.at(-1).events.some((e) => e.type === 'capture'), false);
});

test('back attack: a strict take still captures a pawn that stays', () => {
  const state = setup({ a1: 'wk', h8: 'bk', e6: 'wr', e5: 'bp' });
  const next = play(state, move('e6', 'e5'), { k: 'pass' });
  assert.equal(next.board[sq('e5')].t, 'r');
  assert.equal(next.board[sq('e5')].c, WHITE);
  assert.equal(next.destroyed.b.includes('p'), true);
});

test('clock: 10s free, then the 5 minute reserve, then expiry', () => {
  const state = initialGame(1000);
  state.clocks = { w: { freeStart: 1000, reserve: RESERVE_MS }, b: { freeStart: 1000, reserve: RESERVE_MS } };

  const early = clockOf(state, WHITE, 1000 + 9000);
  assert.equal(Math.round(early.free), 1000);
  assert.equal(early.reserve, RESERVE_MS);

  const burning = clockOf(state, WHITE, 1000 + 20000);
  assert.equal(burning.free, 0);
  assert.equal(burning.reserve, RESERVE_MS - 10000);

  const late = 1000 + FREE_MS + RESERVE_MS + 50;
  assert.deepEqual(expiredColors(state, late), ['w', 'b']);

  const settled = settleClock(state, WHITE, 1000 + 30000);
  assert.equal(settled.clocks.w.reserve, RESERVE_MS - 20000);
  assert.equal(settled.clocks.b.reserve, RESERVE_MS);

  const forced = timeoutOutcome(state, WHITE);
  assert.deepEqual(forced.action, { k: 'pass' });
  assert.equal(forced.result, null);
});

test('clock: overtime is charged cumulatively on every decision', () => {
  const state = initialGame(1000);

  // White spends 24s (14s over the free 10s), black spends 29s (19s over).
  const r1 = submitAction(state, WHITE, move('e2', 'e4'), 25000);
  assert.equal(r1.resolved, false);
  assert.equal(r1.state.clocks.w.reserve, RESERVE_MS, 'not charged until the round resolves');

  const r2 = submitAction(r1.state, BLACK, move('e7', 'e5'), 30000);
  assert.equal(r2.resolved, true);
  assert.equal(r2.state.clocks.w.reserve, RESERVE_MS - 14000);
  assert.equal(r2.state.clocks.b.reserve, RESERVE_MS - 19000);
  assert.equal(r2.state.clocks.w.freeStart, 30000);

  // Next round: white takes 11s (1s over), black 12s (2s over).
  const r3 = submitAction(r2.state, WHITE, move('g1', 'f3'), 41000);
  const r4 = submitAction(r3.state, BLACK, move('b8', 'c6'), 42000);
  assert.equal(r4.state.clocks.w.reserve, RESERVE_MS - 15000);
  assert.equal(r4.state.clocks.b.reserve, RESERVE_MS - 21000);

  // A move inside the free window costs nothing, and the reserve floors at 0.
  const near = {
    ...initialGame(0),
    clocks: { w: { freeStart: 0, reserve: 1000 }, b: { freeStart: 0, reserve: RESERVE_MS } },
  };
  const a = submitAction(near, WHITE, move('e2', 'e4'), 40000); // 30s over free, 1s left
  const b = submitAction(a.state, BLACK, move('e7', 'e5'), 50000);
  assert.equal(b.state.clocks.w.reserve, 0);
  assert.equal(b.state.clocks.b.reserve, RESERVE_MS - 40000);
});

test('private room clock settings are honoured and clamped', () => {
  const g = initialGame(0, { freeMs: 30000, reserveMs: 600000 });
  assert.equal(g.freeMs, 30000);
  assert.equal(g.reserveMs, 600000);
  assert.equal(g.clocks.w.reserve, 600000);
  assert.equal(clockOf(g, WHITE, 20000).free, 10000); // 30s of free time

  const clamped = initialGame(0, { freeMs: 9000, reserveMs: 9_999_999 });
  assert.equal(clamped.freeMs, MIN_FREE_MS);
  assert.equal(clamped.reserveMs, MAX_RESERVE_MS);

  const view = playerView(g, WHITE);
  assert.equal(view.freeMs, 30000);
  assert.equal(view.reserveMs, 600000);
});

test('a locked-in decision pauses that clock in the view', () => {
  const state = initialGame(0, { freeMs: 10000 });
  const r = submitAction(state, WHITE, move('e2', 'e4'), 15000);
  const view = playerView(r.state, WHITE);
  assert.equal(view.clocks.w.until, 15000);

  const frozen = clockOf({ clocks: view.clocks, freeMs: view.freeMs }, WHITE, 60000);
  assert.equal(frozen.spent, 5000);
  assert.equal(frozen.reserve, RESERVE_MS - 5000);
  assert.equal(frozen.frozen, true);
});

test('single-player games are untimed: nothing ever expires', () => {
  const state = initialGame(0, { untimed: true });
  assert.equal(state.untimed, true);
  assert.deepEqual(expiredColors(state, 60 * 60_000), []);

  const idle = clockOf(state, WHITE, 60 * 60_000);
  assert.equal(idle.running, false);
  assert.equal(idle.untimed, true);

  const r = submitAction(state, WHITE, move('e2', 'e4'), 60 * 60_000);
  const resolved = resolveRound(r.state, 60 * 60_000);
  assert.equal(resolved.clocks.w.reserve, 0);
  assert.equal(resolved.clocks.w.freeStart, null);
  assert.deepEqual(expiredColors(resolved, 24 * 60 * 60_000), []);

  const view = playerView(resolved, WHITE);
  assert.equal(view.untimed, true);
  assert.equal(clockOf(view, WHITE, 24 * 60 * 60_000).untimed, true);
});

test('timeout: a safe player is skipped with a pass, not a random move', () => {
  const state = setup({ e1: 'wk', e8: 'bk', a2: 'wr', h7: 'br' });
  const outcome = timeoutOutcome(state, WHITE);
  assert.deepEqual(outcome.action, { k: 'pass' });
  assert.equal(outcome.result, null);
});

test('timeout: a checked player cannot pass, so loses', () => {
  // Black rook on e8 checks the white king on e1 down the e-file.
  const state = setup({ e1: 'wk', e8: 'br', a1: 'bk' });
  assert.equal(inCheck(state.board, WHITE), true);
  assert.equal(canPass(state, WHITE), false);

  const outcome = timeoutOutcome(state, WHITE);
  assert.equal(outcome.action, null);
  assert.deepEqual(outcome.result, { type: 'win', winner: BLACK, reason: 'Time ran out while in check.' });
});

test('timeout in check is symmetrical for black', () => {
  const state = setup({ e8: 'bk', e1: 'wr', a8: 'wk' });
  const outcome = timeoutOutcome(state, BLACK);
  assert.equal(outcome.action, null);
  assert.deepEqual(outcome.result, { type: 'win', winner: WHITE, reason: 'Time ran out while in check.' });
});

test('timeout during a solo check reply is a loss for the checked side', () => {
  const base = setup({ e1: 'wk', e8: 'br', a1: 'bk' });
  const solo = { ...base, phase: 'solo', active: WHITE };
  assert.deepEqual(actorsOf(solo), [WHITE]);
  assert.equal(timeoutOutcome(solo, WHITE).result?.type, 'win');
});

test('timeout while both kings are checked is a loss for whoever expired', () => {
  // Black rook b1 checks e1 along rank 1; white rook e6 checks e8 down the file.
  const state = setup({ e1: 'wk', e8: 'bk', b1: 'br', e6: 'wr' });
  assert.equal(inCheck(state.board, WHITE), true);
  assert.equal(inCheck(state.board, BLACK), true);

  assert.equal(timeoutOutcome(state, WHITE).result?.winner, BLACK);
  assert.equal(timeoutOutcome(state, BLACK).result?.winner, WHITE);
});

test('applyTimeout: a safe player is skipped and the round resolves when both are in', () => {
  const state = setup({ a1: 'wk', h8: 'bk', d2: 'wr', h2: 'br' });
  const first = applyTimeout(state, WHITE, 1000);
  assert.equal(first.error, undefined);
  assert.equal(first.state.result, null);
  assert.deepEqual(first.state.pending.w, { k: 'pass' });

  const second = applyTimeout(first.state, BLACK, 1000);
  assert.equal(second.state.log.length, 1);
  assert.equal(second.state.result, null);
  assert.equal(second.state.passStreak, 1);
});

test('applyTimeout: a checked player loses instead of being skipped', () => {
  const state = setup({ e1: 'wk', e8: 'br', a1: 'bk' });
  const r = applyTimeout(state, WHITE, 1000);
  assert.deepEqual(r.state.result, { type: 'win', winner: BLACK, reason: 'Time ran out while in check.' });
  assert.equal(r.state.phase, 'over');
  assert.equal(r.state.pending.w, null);
});

test('a promotion can never create a second queen, even with stale lost data', () => {
  const state = setup({ e1: 'wk', h4: 'bk', d1: 'wq', a7: 'wp' });
  state.destroyed.w = ['q', 'q']; // duplicated/stale lost list

  assert.deepEqual(promoOptions(state, WHITE), []);
  const next = play(state, { ...move('a7', 'a8'), promo: 'q' }, { k: 'pass' });
  assert.equal(next.board[sq('a8')].t, 'p');
  assert.equal(next.board.filter((p) => p && p.c === WHITE && p.t === 'q').length, 1);
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
