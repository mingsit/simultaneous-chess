/**
 * Simultaneous Chess — tiny matchmaking + relay server.
 *
 * Serves the static Next.js export from ./out and hosts the websocket
 * endpoint at /ws. The server is authoritative: it owns the game state,
 * validates moves and never tells a player what the opponent picked
 * before both decisions are locked in.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { WebSocketServer } from 'ws';

import {
  initialGame,
  submitAction,
  retractAction,
  resolveRound,
  expiredColors,
  applyTimeout,
  playerView,
  actorsOf,
  canPass,
  normalizeSettings,
  WHITE,
  BLACK,
} from '../shared/engine.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', 'out');
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const GRACE_MS = 60_000;
const ROOM_TTL = 30 * 60_000;

/* ------------------------------------------------------------------ */
/* Static file server                                                  */
/* ------------------------------------------------------------------ */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, games: games.size, queue: queue.length }));
    return;
  }

  if (!fs.existsSync(ROOT)) {
    res.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Static build not found. Run "npm run build" first (it creates ./out).');
    return;
  }

  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath.endsWith('/')) urlPath += 'index.html';
  let file = path.join(ROOT, path.normalize(urlPath).replace(/^([/\\])+/, ''));
  if (!file.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    file = path.join(ROOT, 'index.html');
    if (!fs.existsSync(file)) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
  }
  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, {
    'content-type': MIME[ext] || 'application/octet-stream',
    'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
  });
  fs.createReadStream(file).pipe(res);
});

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

/** @type {Map<string, any>} */
const games = new Map();
/** @type {any[]} */
const queue = [];
/** @type {Map<string, any>} */
const rooms = new Map();
/** @type {Map<string, any>} */
const byToken = new Map();

/* ------------------------------------------------------------------ */
/* Websocket                                                           */
/* ------------------------------------------------------------------ */

const wss = new WebSocketServer({ server, path: '/ws' });

function send(client, msg) {
  if (!client || !client.ws || client.ws.readyState !== 1) return;
  try {
    client.ws.send(JSON.stringify(msg));
  } catch {
    /* ignore */
  }
}

function sendError(client, message) {
  send(client, { t: 'error', message });
}

function newClient(ws) {
  return {
    id: randomUUID(),
    ws,
    name: 'Player',
    gameId: null,
    color: null,
    token: null,
    roomPin: null,
    connected: true,
    createdAt: Date.now(),
  };
}

wss.on('connection', (ws) => {
  const client = newClient(ws);
  send(client, { t: 'hello', id: client.id, now: Date.now() });

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return sendError(client, 'Malformed message.');
    }
    try {
      handle(client, msg);
    } catch (err) {
      console.error('message error', err);
      sendError(client, 'Server error.');
    }
  });

  ws.on('close', () => {
    client.connected = false;
    removeFromQueue(client);
    const game = client.gameId ? games.get(client.gameId) : null;
    if (!game) return;
    const seat = game.seats[client.color];
    if (!seat || seat.client !== client) return;
    seat.connected = false;
    seat.leftAt = Date.now();
    sendOpponent(game, client.color, { t: 'opponent-disconnected', graceMs: GRACE_MS });
  });
});

function removeFromQueue(client) {
  const i = queue.indexOf(client);
  if (i >= 0) queue.splice(i, 1);
}

function handle(client, msg) {
  switch (msg.t) {
    case 'queue':
      return onQueue(client, msg);
    case 'cancel':
      removeFromQueue(client);
      if (client.roomPin) {
        rooms.delete(client.roomPin);
        client.roomPin = null;
      }
      return send(client, { t: 'idle' });
    case 'create-room':
      return onCreateRoom(client, msg);
    case 'join-room':
      return onJoinRoom(client, msg);
    case 'move':
      return onMove(client, msg);
    case 'retract':
      return onRetract(client);
    case 'resign':
      return onResign(client);
    case 'leave':
      return onLeave(client);
    case 'resume':
      return onResume(client, msg);
    case 'ping':
      return send(client, { t: 'pong', now: Date.now() });
    default:
      return sendError(client, 'Unknown message.');
  }
}

/* ------------------------------------------------------------------ */
/* Matchmaking                                                         */
/* ------------------------------------------------------------------ */

function sanitizeName(name) {
  const n = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 18);
  return n || 'Player';
}

function onQueue(client, msg) {
  if (client.gameId) return sendError(client, 'You are already in a game.');
  client.name = sanitizeName(msg.name || client.name);
  removeFromQueue(client);

  const opponent = queue.find((c) => c !== client && c.connected && !c.gameId);
  if (opponent) {
    removeFromQueue(opponent);
    startGame([opponent, client], 'quick');
    return;
  }
  queue.push(client);
  send(client, { t: 'searching', now: Date.now() });
}

function makePin() {
  for (let i = 0; i < 200; i++) {
    const pin = String(Math.floor(100000 + Math.random() * 900000));
    if (!rooms.has(pin)) return pin;
  }
  return String(Date.now()).slice(-6);
}

function onCreateRoom(client, msg) {
  if (client.gameId) return sendError(client, 'You are already in a game.');
  removeFromQueue(client);
  if (client.roomPin) rooms.delete(client.roomPin);
  client.name = sanitizeName(msg.name || client.name);
  const pin = makePin();
  client.roomPin = pin;
  const settings = normalizeSettings(msg.settings || {});
  rooms.set(pin, { pin, host: client, settings, createdAt: Date.now() });
  send(client, { t: 'room', pin, settings, now: Date.now() });
}

function onJoinRoom(client, msg) {
  if (client.gameId) return sendError(client, 'You are already in a game.');
  const pin = String(msg.pin || '').replace(/\D/g, '').slice(0, 6);
  if (pin.length !== 6) return sendError(client, 'Enter the 6-digit room PIN.');
  const room = rooms.get(pin);
  if (!room) return sendError(client, 'No room with that PIN (it may have expired).');
  if (room.host === client) return sendError(client, 'That is your own room.');
  if (!room.host.connected || room.host.gameId) {
    rooms.delete(pin);
    return sendError(client, 'The host has left that room.');
  }
  client.name = sanitizeName(msg.name || client.name);
  rooms.delete(pin);
  room.host.roomPin = null;
  startGame([room.host, client], 'private', pin, room.settings);
}

/* ------------------------------------------------------------------ */
/* Games                                                               */
/* ------------------------------------------------------------------ */

function startGame(players, mode, pin, settings = {}) {
  const id = randomUUID();
  const order = Math.random() < 0.5 ? [players[0], players[1]] : [players[1], players[0]];
  const seatFor = (client, color) => ({
    client,
    token: client.token,
    name: client.name,
    connected: client.connected,
    joinedAt: Date.now(),
    color,
  });

  const game = {
    id,
    mode,
    pin: pin || null,
    state: initialGame(Date.now(), settings),
    seats: { w: seatFor(order[0], WHITE), b: seatFor(order[1], BLACK) },
    lastTick: Date.now(),
    ended: false,
    startedAt: Date.now(),
  };

  games.set(id, game);
  for (const color of [WHITE, BLACK]) {
    const seat = game.seats[color];
    seat.client.gameId = id;
    seat.client.color = color;
    seat.client.roomPin = null;
    seat.client.token = seat.client.token || randomUUID();
    seat.token = seat.client.token;
    if (seat.client.token) byToken.set(seat.client.token, game.id);
    send(seat.client, {
      t: 'start',
      gameId: id,
      color,
      mode,
      pin: game.pin,
      opponent: game.seats[color === WHITE ? BLACK : WHITE].name,
      token: seat.token,
      view: playerView(game.state, color),
      now: Date.now(),
    });
  }
  broadcast(game);
}

function sendOpponent(game, color, msg) {
  const opp = game.seats[color === WHITE ? BLACK : WHITE];
  if (opp?.client) send(opp.client, msg);
}

function broadcast(game) {
  for (const color of [WHITE, BLACK]) {
    const seat = game.seats[color];
    if (!seat?.client) continue;
    send(seat.client, {
      t: 'state',
      view: playerView(game.state, color),
      now: Date.now(),
      mode: game.mode,
      pin: game.pin,
      opponent: game.seats[color === WHITE ? BLACK : WHITE].name,
      opponentConnected: game.seats[color === WHITE ? BLACK : WHITE].connected,
    });
  }
}

function gameFor(client) {
  if (!client.gameId) return null;
  return games.get(client.gameId) || null;
}

function onMove(client, msg) {
  const game = gameFor(client);
  if (!game) return sendError(client, 'You are not in a game.');
  if (game.ended) return sendError(client, 'The game is over.');
  if (game.state.pending[client.color]) {
    return sendError(client, 'Your move is already locked in. Retract it first if you want to change it.');
  }
  const res = submitAction(game.state, client.color, msg.action, Date.now());
  if (res.error) return sendError(client, res.error);
  game.state = res.state;
  if (game.state.result) finish(game);
  broadcast(game);
}

function onRetract(client) {
  const game = gameFor(client);
  if (!game || game.ended) return;
  if (game.state.phase === 'solo') {
    // the only actor's decision is resolved instantly, nothing to retract
    return sendError(client, 'That turn is already resolved.');
  }
  game.state = retractAction(game.state, client.color);
  broadcast(game);
}

function onResign(client) {
  const game = gameFor(client);
  if (!game || game.ended) return;
  const winner = client.color === WHITE ? BLACK : WHITE;
  game.state = {
    ...game.state,
    result: { type: 'win', winner, reason: 'Opponent resigned.' },
    phase: 'over',
  };
  finish(game);
  broadcast(game);
}

function onLeave(client) {
  const game = gameFor(client);
  if (game && !game.ended) {
    const winner = client.color === WHITE ? BLACK : WHITE;
    game.state = {
      ...game.state,
      result: { type: 'win', winner, reason: 'Opponent left the game.' },
      phase: 'over',
    };
    finish(game);
    broadcast(game);
  }
  detach(client);
  send(client, { t: 'idle' });
}

function detach(client) {
  const game = gameFor(client);
  if (game) {
    const seat = game.seats[client.color];
    if (seat && seat.client === client) seat.connected = false;
  }
  client.gameId = null;
  client.color = null;
}

function onResume(client, msg) {
  const token = String(msg.token || '');
  client.name = sanitizeName(msg.name || client.name);
  client.token = token || client.token || randomUUID();
  const gameId = msg.gameId || byToken.get(client.token);
  const game = gameId ? games.get(gameId) : null;
  if (!game || game.ended) {
    return send(client, { t: 'kicked', message: 'That game is no longer available.' });
  }
  const color = game.seats.w.token === client.token ? WHITE : game.seats.b.token === client.token ? BLACK : null;
  if (!color) return send(client, { t: 'kicked', message: 'You are not seated in that game.' });

  const seat = game.seats[color];
  if (seat.client && seat.client !== client) {
    try {
      seat.client.ws.close();
    } catch {
      /* ignore */
    }
  }
  seat.client = client;
  seat.connected = true;
  seat.leftAt = null;
  client.gameId = game.id;
  client.color = color;
  client.token = seat.token;
  send(client, {
    t: 'start',
    gameId: game.id,
    color,
    mode: game.mode,
    pin: game.pin,
    opponent: game.seats[color === WHITE ? BLACK : WHITE].name,
    token: seat.token,
    resumed: true,
    view: playerView(game.state, color),
    now: Date.now(),
  });
  sendOpponent(game, color, { t: 'opponent-reconnected' });
  broadcast(game);
}

function finish(game) {
  game.ended = true;
  for (const color of [WHITE, BLACK]) {
    const seat = game.seats[color];
    if (seat?.client) {
      seat.client.gameId = null;
      seat.client.color = null;
    }
  }
  setTimeout(() => games.delete(game.id), 120_000);
}

/* ------------------------------------------------------------------ */
/* Clock / disconnect loop                                             */
/* ------------------------------------------------------------------ */

setInterval(() => {
  const now = Date.now();

  for (const [pin, room] of rooms) {
    if (!room.host.connected || now - room.createdAt > ROOM_TTL) rooms.delete(pin);
  }

  for (const game of games.values()) {
    if (game.ended) continue;

    // abandonment
    for (const color of [WHITE, BLACK]) {
      const seat = game.seats[color];
      if (!seat.connected && seat.leftAt && now - seat.leftAt > GRACE_MS) {
        const winner = color === WHITE ? BLACK : WHITE;
        game.state = {
          ...game.state,
          result: { type: 'win', winner, reason: 'Opponent left the game.' },
          phase: 'over',
        };
        finish(game);
        broadcast(game);
      }
    }
    if (game.ended) continue;

    // timeouts -> automatic skip; a player in check cannot be skipped, so loses
    const expired = expiredColors(game.state, now);
    let changed = false;
    for (const color of expired) {
      if (game.state.pending[color]) continue;
      const res = applyTimeout(game.state, color, now);
      if (res.error) continue;
      game.state = res.state;
      changed = true;
      if (game.state.result) {
        finish(game);
        break;
      }
    }

    // gentle clock sync for the clients
    if (changed || now - game.lastTick > 2000) {
      game.lastTick = now;
      broadcast(game);
    }
  }
}, 250).unref?.();

server.listen(PORT, HOST, () => {
  console.log(`Simultaneous Chess server on http://localhost:${PORT}`);
  console.log(`  websocket: ws://localhost:${PORT}/ws`);
  console.log(`  static:    ${ROOT} ${fs.existsSync(ROOT) ? '' : '(missing — run npm run build)'}`);
});
