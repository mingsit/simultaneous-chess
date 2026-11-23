/**
 * Integration test for the relay: two sockets, a private room, a simultaneous
 * round, and a check that nothing leaks before both decisions are locked in.
 *
 * Start the server first (`npm start`), then: node scripts/test-online.mjs
 */
import assert from 'node:assert/strict';
import WebSocket from 'ws';

const URL = process.env.WS_URL || 'ws://localhost:3000/ws';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function connect(name) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(URL);
    const box = { name, ws, messages: [], waiters: [] };
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      box.messages.push(msg);
      for (const w of [...box.waiters]) {
        if (w.match(msg)) {
          box.waiters.splice(box.waiters.indexOf(w), 1);
          w.resolve(msg);
        }
      }
    });
    ws.on('open', () => resolve(box));
    ws.on('error', reject);
    box.send = (m) => ws.send(JSON.stringify(m));
    box.next = (match, timeout = 3000) =>
      new Promise((res, rej) => {
        const found = box.messages.find(match);
        if (found) {
          box.messages.splice(box.messages.indexOf(found), 1);
          return res(found);
        }
        const entry = { match, resolve: res };
        box.waiters.push(entry);
        setTimeout(() => {
          const i = box.waiters.indexOf(entry);
          if (i >= 0) {
            box.waiters.splice(i, 1);
            rej(new Error('timeout waiting for message'));
          }
        }, timeout);
      });
    box.close = () => ws.close();
  });
}

const sq = { e2: 52, e4: 36, e7: 12, e5: 28 };

let pass = 0;
function ok(label) {
  pass++;
  console.log('  ok   ' + label);
}

const a = await connect('A');
const b = await connect('B');
await a.next((m) => m.t === 'hello');
await b.next((m) => m.t === 'hello');
ok('two clients connected');

a.send({ t: 'create-room', name: 'Alice', settings: { freeMs: 30000, reserveMs: 600000 } });
const room = await a.next((m) => m.t === 'room');
assert.match(room.pin, /^\d{6}$/);
ok('room created with a 6-digit PIN ' + room.pin);

b.send({ t: 'join-room', pin: room.pin, name: 'Bob' });
const startA = await a.next((m) => m.t === 'start');
const startB = await b.next((m) => m.t === 'start');
assert.notEqual(startA.color, startB.color);
assert.equal(startA.opponent, 'Bob');
assert.equal(startB.opponent, 'Alice');
assert.equal(startA.view.freeMs, 30000);
assert.equal(startA.view.reserveMs, 600000);
assert.equal(startB.view.freeMs, 30000);
ok('both players seated (' + startA.color + '/' + startB.color + ') with the host clock');

const white = startA.color === 'w' ? a : b;
const black = startA.color === 'w' ? b : a;

white.send({ t: 'move', action: { k: 'move', from: sq.e2, to: sq.e4 } });
const locked = await white.next((m) => m.t === 'state' && m.view.locked === true);
assert.equal(Object.prototype.hasOwnProperty.call(locked.view, 'pending'), false);
assert.equal(locked.view.log.length, 0);
ok('the mover sees their own decision as locked');

await wait(150);
const blackSaw = black.messages.filter((m) => m.t === 'state').pop();
assert.equal(blackSaw.view.locked, false);
assert.equal(blackSaw.view.log.length, 0);
ok("the opponent's decision stays hidden (no log, nothing locked)");

black.send({ t: 'move', action: { k: 'move', from: sq.e7, to: sq.e5 } });
const resolvedB = await black.next((m) => m.t === 'state' && m.view.log.length === 1);
const resolvedA = await white.next((m) => m.t === 'state' && m.view.log.length === 1);
assert.equal(resolvedB.view.round, 2);
assert.equal(resolvedA.view.log[0].actions.w.from, sq.e2);
assert.equal(resolvedA.view.log[0].actions.b.to, sq.e5);
ok('both moves resolve together and are revealed');

white.send({ t: 'move', action: { k: 'move', from: sq.e5, to: sq.e4 } });
const err = await white.next((m) => m.t === 'error');
assert.ok(err.message.length > 0);
await white.next((m) => m.t === 'error').catch(() => {});
ok('illegal moves are rejected by the server');

white.send({ t: 'resign' });
const over = await black.next((m) => m.t === 'state' && m.view.result);
assert.equal(over.view.result.winner, black === a ? startA.color : startB.color);
ok('resignation ends the game');

a.close();
b.close();

/* ---------------- quick match ---------------- */
const c = await connect('C');
const d = await connect('D');
await c.next((m) => m.t === 'hello');
await d.next((m) => m.t === 'hello');

c.send({ t: 'queue', name: 'Cara' });
const searching = await c.next((m) => m.t === 'searching');
assert.ok(searching);
ok('first player waits in the queue');

d.send({ t: 'queue', name: 'Dan' });
const matchedC = await c.next((m) => m.t === 'start');
const matchedD = await d.next((m) => m.t === 'start');
assert.notEqual(matchedC.color, matchedD.color);
assert.equal(matchedC.mode, 'quick');
ok('second player is paired instantly');

c.close();
d.close();

/* ---------------- check / free-turn sequence ---------------- */
const e = await connect('E');
const f = await connect('F');
await e.next((m) => m.t === 'hello');
await f.next((m) => m.t === 'hello');
e.send({ t: 'queue', name: 'Eve' });
await e.next((m) => m.t === 'searching');
f.send({ t: 'queue', name: 'Finn' });
const se = await e.next((m) => m.t === 'start');
const sf = await f.next((m) => m.t === 'start');
const W = se.color === 'w' ? e : f;
const B = se.color === 'w' ? f : e;

async function round(wFrom, wTo, bFrom, bTo, expectRounds) {
  W.send({ t: 'move', action: { k: 'move', from: wFrom, to: wTo } });
  await wait(60);
  B.send({ t: 'move', action: { k: 'move', from: bFrom, to: bTo } });
  return W.next((m) => m.t === 'state' && m.view.log.length === expectRounds, 4000);
}

await round(52, 36, 12, 28, 1); // e4 e5
await round(59, 31, 1, 18, 2); // Qh5 Nc6
const checked = await round(31, 28, 8, 16, 3); // Qxe5+ a6
assert.equal(checked.view.phase, 'solo');
assert.equal(checked.view.active, 'b');
assert.equal(checked.view.freeTurn, false);
ok('delivering check hands the turn to the checked king alone');

B.send({ t: 'move', action: { k: 'move', from: 5, to: 12 } }); // Be7 blocks
const freed = await W.next((m) => m.t === 'state' && m.view.log.length === 4, 4000);
assert.equal(freed.view.phase, 'solo');
assert.equal(freed.view.active, 'w');
assert.equal(freed.view.freeTurn, true);
ok('after the check is broken the opponent gets a free turn');

e.close();
f.close();

console.log(`\n${pass} online checks passed`);
process.exit(0);
