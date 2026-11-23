/**
 * Self-play bench for the two bots.
 *
 *   node scripts/bench-ai.mjs [games]
 *
 * Hard plays Easy with colours alternating. The script reports the score and
 * also runs a few rule-specific probes so a regression in hook/overextension
 * awareness is visible even when the score is noisy.
 */
import { WHITE, BLACK, initialGame, actorsOf, submitAction, idx } from '../shared/engine.mjs';
import { chooseEasyAction, chooseHardAction } from '../shared/ai.mjs';

const sq = (name) => idx(8 - Number(name[1]), 'abcdefgh'.indexOf(name[0]));

function setup(map, extras = {}) {
  const board = new Array(64).fill(null);
  for (const [name, [c, t]] of Object.entries(map)) {
    const i = sq(name);
    board[i] = { id: name, t, c };
  }
  const state = initialGame(0, { untimed: true });
  state.board = board;
  state.phase = 'simultaneous';
  state.active = null;
  state.freeTurn = false;
  state.round = 1;
  state.pending = { w: null, b: null };
  state.decided = { w: null, b: null };
  for (const [name, extra] of Object.entries(extras)) Object.assign(board[sq(name)], extra);
  return state;
}

function playGame(whiteLevel, blackLevel, maxRounds = 99) {
  let state = initialGame(0, { untimed: true });
  let guard = 0;
  while (!state.result && state.round <= maxRounds && guard++ < 400) {
    const actors = actorsOf(state);
    if (!actors.length) break;
    for (const color of actors) {
      if (state.result) break;
      if (state.pending[color]) continue;
      const level = color === WHITE ? whiteLevel : blackLevel;
      const action = level === 'hard' ? chooseHardAction(state, color, 0) : chooseEasyAction(state, color);
      const res = submitAction(state, color, action, 0);
      if (res.error) throw new Error(`${color} produced an illegal action: ${res.error}`);
      state = res.state;
    }
  }
  if (!state.result && state.round > maxRounds) {
    state = { ...state, result: { type: 'draw', reason: 'bench cap' } };
  }
  return state;
}

function scoreOf(result, hardColor) {
  if (!result) return 0;
  if (result.type === 'draw') return 0.5;
  return result.winner === hardColor ? 1 : 0;
}

const args = process.argv.slice(2);
const games = Math.max(1, Number(args[0]) || 6);

console.log('\nRule probes');
{
  const hook = setup({ a1: ['w', 'k'], h8: ['b', 'k'], e5: ['w', 'r'], e4: ['b', 'p'] });
  const a = chooseHardAction(hook, WHITE, 0);
  console.log(`  hook:            ${a.back != null ? 'OK' : 'MISS'} (${JSON.stringify(a)})`);
}
{
  const pin = setup({
    h1: ['w', 'k'],
    a8: ['b', 'k'],
    c6: ['w', 'q'],
    b7: ['b', 'p'],
    e4: ['b', 'p'],
  });
  const a = chooseHardAction(pin, WHITE, 0);
  console.log(`  overextension:   ${a.to !== sq('b7') ? 'OK' : 'MISS'} (${JSON.stringify(a)})`);
}
{
  const take = setup(
    { h1: ['w', 'k'], h8: ['b', 'k'], c6: ['w', 'q'], b7: ['b', 'r'], e4: ['b', 'p'] },
    { b7: { overextended: true } }
  );
  const a = chooseHardAction(take, WHITE, 0);
  console.log(`  punish pin:      ${a.to === sq('b7') ? 'OK' : 'MISS'} (${JSON.stringify(a)})`);
}

console.log(`\nSelf-play: ${games} games`);
let hardScore = 0;
let hardWins = 0;
let draws = 0;
const started = Date.now();
for (let i = 0; i < games; i++) {
  const hardIsWhite = i % 2 === 0;
  const white = hardIsWhite ? 'hard' : 'easy';
  const black = hardIsWhite ? 'easy' : 'hard';
  const res = playGame(white, black);
  const hardColor = hardIsWhite ? WHITE : BLACK;
  const s = scoreOf(res.result, hardColor);
  hardScore += s;
  const won = res.result?.type !== 'draw' && res.result?.winner === hardColor;
  if (res.result?.type === 'draw') draws++;
  else if (won) hardWins++;
  console.log(
    `  game ${String(i + 1).padStart(2)}  Hard as ${hardIsWhite ? 'White' : 'Black'}  ` +
      `${res.result?.type === 'draw' ? 'draw' : won ? 'win' : 'loss'} ` +
      `in ${res.round} rounds  (${res.result?.reason || 'no result'})`
  );
}

const secs = ((Date.now() - started) / 1000).toFixed(1);
console.log(`\nHard score: ${hardScore}/${games}  (${hardWins} wins, ${draws} draws)  in ${secs}s\n`);
