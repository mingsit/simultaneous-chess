/**
 * TEMPORARY verification partner for the back-attack chooser.
 * Joins a private room and plays a scripted black plan.
 *
 *   node scripts/tmp-hook-partner.mjs <PIN>
 */
import WebSocket from 'ws';

const PIN = process.argv[2];
const URL = process.env.WS_URL || 'ws://localhost:3000/ws';
const sq = (r, c) => r * 8 + c; // row 0 = rank 8

// e7=12, e5=28, e4=36, e3=44
const plan = {
  1: { k: 'move', from: 12, to: 28 },
  2: { k: 'move', from: 28, to: 36 },
  3: { k: 'pass' },
  4: { k: 'pass' },
  5: { k: 'pass' },
  6: { k: 'pass' },
  7: { k: 'move', from: 36, to: 44 },
};

const ws = new WebSocket(URL);
let color = null;
const sent = new Set();

ws.on('open', () => console.log('partner connected'));
ws.on('message', (raw) => {
  const m = JSON.parse(raw.toString());
  if (m.t === 'hello') {
    ws.send(JSON.stringify({ t: 'join-room', pin: PIN, name: 'Partner' }));
    return;
  }
  if (m.t === 'error') {
    console.log('server error:', m.message);
    return;
  }
  if (m.t === 'start') {
    color = m.color;
    console.log('seated as', color, 'view round', m.view.round);
    return;
  }
  if (m.t !== 'state' || !color) return;

  const v = m.view;
  if (v.result) {
    console.log('GAME OVER', v.result, 'final round', v.round);
    setTimeout(() => process.exit(0), 300);
    return;
  }
  const round = v.round;
  if (sent.has(round) || !plan[round]) return;
  const canAct = v.phase === 'solo' ? v.active === color : true;
  if (!canAct || v.locked) return;

  sent.add(round);
  const action = plan[round];
  console.log(`r${round} sending`, JSON.stringify(action));
  ws.send(JSON.stringify({ t: 'move', action }));
});

ws.on('error', (e) => console.log('ws error', e.message));
setTimeout(() => {
  console.log('partner timeout');
  process.exit(1);
}, 300000);
