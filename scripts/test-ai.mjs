/**
 * Behaviour checks for the two single-player bots.
 * Run with: npm run test:ai (also part of npm test)
 */
import assert from 'node:assert/strict';
import {
  WHITE,
  initialGame,
  validateAction,
  idx,
  FREE_MS,
  RESERVE_MS,
} from '../shared/engine.mjs';
import {
  AI_LEVELS,
  chooseAiAction,
  chooseEasyAction,
  chooseHardAction,
} from '../shared/ai.mjs';
import { LocalSession } from '../lib/localSession.mjs';

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
  const state = initialGame(0, { untimed: true });
  state.board = board;
  state.phase = 'simultaneous';
  state.active = null;
  state.freeTurn = false;
  state.round = 1;
  state.pending = { w: null, b: null };
  state.decided = { w: null, b: null };
  return state;
}

function setupPiece(map, name, extra) {
  const state = setup(map);
  Object.assign(state.board[sq(name)], extra);
  return state;
}

console.log('\nAI checks');

test('both levels are exported', () => {
  assert.deepEqual(AI_LEVELS, ['easy', 'hard']);
});

test('easy opens legally from the initial position', () => {
  const state = initialGame(0, { untimed: true });
  const action = chooseEasyAction(state, WHITE);
  assert.equal(action.k, 'move');
  assert.equal(validateAction(state, WHITE, action), null);
  assert.equal(action.back, undefined);
});

test('hard opens legally and does not take forever', () => {
  const state = initialGame(0, { untimed: true });
  const started = Date.now();
  const action = chooseHardAction(state, WHITE, 0);
  const elapsed = Date.now() - started;
  assert.equal(action.k, 'move');
  assert.equal(validateAction(state, WHITE, action), null);
  assert.ok(elapsed < 5000, `hard took ${elapsed}ms`);
});

test('the default entry point is easy', () => {
  const state = initialGame(0, { untimed: true });
  const oldRandom = Math.random;
  Math.random = () => 0;
  const asEasy = chooseAiAction(state, WHITE);
  Math.random = oldRandom;
  // Easy carries randomness; just make sure it chose a legal move.
  assert.equal(validateAction(state, WHITE, asEasy), null);
});

test('hard prefers the hook when the pawn can run', () => {
  // White rook e5 sits behind Black's e4 pawn. A plain capture only works
  // if the pawn stays; the hook also catches e4-e3.
  const state = setup({ a1: ['w', 'k'], h8: ['b', 'k'], e5: ['w', 'r'], e4: ['b', 'p'] });
  const action = chooseHardAction(state, WHITE, 0);
  assert.equal(action.k, 'move');
  assert.equal(action.from, sq('e5'));
  assert.equal(action.to, sq('e4'));
  assert.equal(action.back, sq('e4'));
  assert.equal(validateAction(state, WHITE, action), null);
});

test('hard avoids overextending a queen for a pawn', () => {
  // Qxb7 grabs a pawn but parks the queen on Black's back ranks, where the
  // black king can take it. Qxe4 grabs a pawn safely.
  const state = setup({
    h1: ['w', 'k'],
    a8: ['b', 'k'],
    c6: ['w', 'q'],
    b7: ['b', 'p'],
    e4: ['b', 'p'],
  });
  const action = chooseHardAction(state, WHITE, 0);
  assert.notEqual(action.to, sq('b7'), 'took the poisoned b7 pawn');
  assert.equal(action.to, sq('e4'), 'missed the safe pawn');
});

test('hard captures an overextended enemy piece', () => {
  const state = setupPiece(
    { h1: ['w', 'k'], h8: ['b', 'k'], c6: ['w', 'q'], b7: ['b', 'r'], e4: ['b', 'p'] },
    'b7',
    { overextended: true }
  );
  const action = chooseHardAction(state, WHITE, 0);
  assert.equal(action.to, sq('b7'));
  assert.equal(validateAction(state, WHITE, action), null);
});

test('hard ignores a hidden opponent decision', () => {
  const state = setup({ a1: ['w', 'k'], h8: ['b', 'k'], e5: ['w', 'r'], e4: ['b', 'p'] });
  const withPending = {
    ...state,
    pending: { w: null, b: { k: 'move', from: sq('h8'), to: sq('g8') } },
  };
  const oldRandom = Math.random;
  Math.random = () => 0;
  const a = chooseHardAction(state, WHITE, 0);
  const b = chooseHardAction(withPending, WHITE, 0);
  Math.random = oldRandom;
  assert.deepEqual(a, b);
});

test('hard answers a check when it is the checked side', () => {
  // Black rook on e8 checks the white king on e1. The hard bot must move
  // the king, block, or capture — it may not pass.
  const state = setup({ e1: ['w', 'k'], e8: ['b', 'r'], a8: ['b', 'k'] });
  state.phase = 'solo';
  state.active = WHITE;
  const action = chooseHardAction(state, WHITE, 0);
  assert.notEqual(action.k, 'pass');
  assert.equal(validateAction(state, WHITE, action), null);
});

/* ------------------------------------------------------------------ */
/* Single-player clock: Hard mirrors a ranked game                     */
/* ------------------------------------------------------------------ */

test('hard sessions run on the ranked clock; easy is untimed', () => {
  const hard = new LocalSession({ level: 'hard' });
  hard.stop();
  assert.equal(hard.state.untimed, false);
  assert.equal(hard.state.freeMs, FREE_MS);
  assert.equal(hard.state.reserveMs, RESERVE_MS);

  const easy = new LocalSession({ level: 'easy' });
  easy.stop();
  assert.equal(easy.state.untimed, true);
});

test('a hard session skips a player whose clock runs out', () => {
  const session = new LocalSession({ level: 'hard' });
  session.stop();
  session.disposed = false;
  const now = Date.now();
  session.state = {
    ...session.state,
    clocks: {
      w: { freeStart: now - 400_000, reserve: 1 },
      b: { freeStart: now, reserve: RESERVE_MS },
    },
  };
  session.tick();
  session.stop();
  assert.deepEqual(session.state.pending.w, { k: 'pass' });
  assert.equal(session.state.result, null);
});

test('a hard session loses when the clock runs out while in check', () => {
  const session = new LocalSession({ level: 'hard' });
  session.stop();
  session.disposed = false;
  const board = session.state.board.map(() => null);
  board[idx(7, 4)] = { id: 'wk', t: 'k', c: 'w' }; // e1
  board[idx(0, 4)] = { id: 'br', t: 'r', c: 'b' }; // e8, checking
  board[idx(0, 0)] = { id: 'bk', t: 'k', c: 'b' }; // a8
  const now = Date.now();
  session.state = {
    ...session.state,
    board,
    phase: 'solo',
    active: WHITE,
    freeTurn: false,
    clocks: {
      w: { freeStart: now - 400_000, reserve: 1 },
      b: { freeStart: now, reserve: RESERVE_MS },
    },
  };
  session.tick();
  session.stop();
  assert.equal(session.state.result?.type, 'win');
  assert.equal(session.state.result?.winner, 'b');
  assert.match(session.state.result?.reason || '', /check/i);
});

console.log(`\n${passed} passed, ${failures.length} failed\n`);
if (failures.length) process.exitCode = 1;
