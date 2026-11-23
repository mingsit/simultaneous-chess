# Simultaneous Chess

A chess variant where **both players decide at the same time**. Nothing happens —
and nothing is revealed — until both moves are locked in.

Built with **Next.js (static export)** and a tiny Node websocket relay for online play.

```
npm install
npm run dev        # http://localhost:3000  (live server on :3001)
```

Production:

```
npm run build      # writes the static site to ./out
npm start          # one process serves ./out + ws://…/ws on :3000
```

`npm start` is the recommended way to play online: it serves the static export
and the matchmaking websocket from the same port. You can also host `out/`
anywhere statically and point `NEXT_PUBLIC_WS_URL` at a relay.

```
NEXT_PUBLIC_WS_URL=wss://my-relay.example/ws npm run build
PORT=8080 npm start
```

## Hosting on GitHub Pages

The build is already a static export (`output: 'export'`, `trailingSlash: true`, plus a
`.nojekyll` file), so `out/` can be published by Pages. `.github/workflows/pages.yml`
builds and deploys it on every push to `main`.

1. Push the repository to GitHub (`main` branch).
2. Repo **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Optional, for online play: add a repository **variable** `NEXT_PUBLIC_WS_URL`
   (`Settings → Secrets and variables → Actions → Variables`) such as
   `wss://my-relay.example/ws`. Skip it if only single player is needed.
4. Push to `main`; the site lands at `https://<user>.github.io/<repo>/`.

A project page is served from `/<repo>`, so the workflow passes
`PAGES_BASE_PATH=/${{ github.event.repository.name }}` and `next.config.mjs` applies it as
`basePath`. For a manual Pages build use:

```
PAGES_BASE_PATH=/simultaneous-chess NEXT_PUBLIC_WS_URL=wss://my-relay.example/ws npm run build
```

Pages serves static files only: `server/index.mjs` cannot run there. Single player works
as-is; quick match and private rooms need the websocket relay hosted somewhere Node runs
(Render, Railway, Fly, a VPS…), with `NEXT_PUBLIC_WS_URL` set **at build time** because it
is baked into the bundle. A custom domain or a `<user>.github.io` repository can drop the
base path build.

## Modes

| Mode | How it works |
| --- | --- |
| **Single player** | You (White) vs. “Deep Puddle”, with two levels. Runs entirely in the browser. Easy has no clock; Hard is clocked exactly like an online match, so it doubles as practice. |
| **Easy bot** | One ply ahead: material, centre, checks, and a dislike of hanging pieces. No clock — a gentle way to learn the variant. |
| **Hard bot** | Rule-aware: it searches every legal action against the opponent's strongest reply, and its evaluation prices back attacks (hooks), overextension pins, checks, mobility, pawn structure and king safety. It plays on the standard ranked clock (10s free, 5-minute reserve, automatic skips). |
| **Find a match** | Quick pairing against the next player in the queue. |
| **Private room** | Create a room, share the 6-digit PIN, the other player joins with it. The host picks the clock with two sliders: 10–60s of free time per move and a 3–20 minute reserve. Defaults are the ranked clock (10s + 5:00); “Set as default” remembers a custom pair for next time. |

## The rules that differ from chess

1. **Simultaneous.** Both players lock one action per round. The round resolves only when both have decided (or a clock runs out). A locked-in clock pauses.
2. **Same square = clash.** Both pieces are destroyed — except a King always wins a clash, and a Pawn that only advanced (rather than attacked diagonally) is the one destroyed.
3. **Pawns attack diagonally.** A pawn moving diagonally is attacking, so a clash or swap with it destroys both pieces. A pawn that only advances is not attacking — in a clash it is the pawn that dies.
4. **Mutual attack** (A moves onto B while B moves onto A) destroys both. A King still wins.
5. **Dodging.** If A attacks B while B attacks C, B dodged: C dies, B lands on C, A lands on B's old square.
6. **Check.** The checked player decides alone and must break the check; then the opponent gets one free turn. If both kings are checked, both must answer and neither may attack the other king.
7. **Overextension.** A bishop, knight, rook or queen that captures a piece on the opponent's last two ranks cannot move on the next round — though it still attacks and gives check. Pawns and kings are exempt, and the rule lapses after round 20. A confirmation box warns before you overextend.
8. **Back attacking.** A rook or queen standing behind an enemy pawn may hook it. The hook follows the pawn: it lands on the pawn's square if the pawn stays, follows it if it advances (one or two squares), and catches nothing if the pawn moves diagonally — the raider stops on the pawn's old square.
9. **Pass, no castling, no en passant.** You may pass — but only while your own king is not in check. Castling and en passant do not exist; everything else follows normal chess movement.
10. **Promotion** can only revive a piece you have already lost, and only once per lost piece — one lost queen means at most one promoted queen.
11. **Draws.** Both kings checkmated at once, only the two kings left on the board, threefold repetition, both players passing twice in a row, or nobody has won after 99 turns.
12. **Clock.** In online games each move starts with 10 seconds of free thinking time, then a cumulative 5-minute reserve. Every second spent beyond the free time is charged to that reserve, move after move; locking in a move pauses that player's clock. When it runs out the turn is skipped automatically — but a checked player cannot skip, so running out while in check loses the game.

## Tests

```
npm test           # 57 rule checks + 9 bot checks (Easy/Hard, hooks, overextension, hidden moves)
npm run test:ai      # 9 bot checks only
npm run test:online  # relay integration: pairing, private PIN + clock, hidden moves, resolve
npm run bench:ai     # self-play: Hard vs Easy, plus rule-specific probes
```

The Hard bot's weights were tuned with the self-play bench: it wins clearly
against Easy over a 20-game match while the probes keep the hook and
overextension values honest.

`npm run test:online` expects a running server (`npm start`, or `npm run dev` with
`WS_URL=ws://localhost:3001/ws`).

## Layout

```
app/                 Next.js app router (single page, client rendered)
  page.js            the only route: picks lobby / waiting / game
components/          board, panels, log, modals
lib/                 browser glue: local session, websocket hook, ui helpers
shared/engine.mjs    the rules — used by both the browser and the server
shared/ai.mjs        Easy (1-ply) and Hard (rule-aware one-exchange search) bots
server/index.mjs     static file server + matchmaking relay (authoritative state)
scripts/test-engine.mjs  rule tests
scripts/test-ai.mjs      bot behaviour checks
scripts/bench-ai.mjs     Hard-vs-Easy self-play bench
```

Generated, never edited by hand:

| Path | What it is |
| --- | --- |
| `.next/` | Next.js build cache. Contains compiled copies of `app/page.js` (and chunks named `page-<hash>.js`). Only needed while building or running `next dev`. |
| `out/` | The deployable static export (`index.html`, `404/index.html`, `_next/static/…`). This is what `npm start` serves. |

Both are ignored by git. Delete the cache whenever it gets in the way:

```
npm run clean          # remove .next + out
npm run clean:cache    # remove .next only, keep the running export
```

The `page-<hash>.js` files inside `out/_next/static/chunks/app/` are referenced
by `out/index.html`; the hash changes on every build, so they must not be renamed
or removed. There is only one source page (`app/page.js`).

The server never sends the opponent's pending move to a client — only the
public board, whose turn it is, and the logs of already-resolved rounds.
