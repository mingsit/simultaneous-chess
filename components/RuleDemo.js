'use client';

import { GLYPH } from '../shared/engine.mjs';

/**
 * Animated rule demos.
 *
 * Each demo is a tiny 4x4 board plus a looping CSS timeline. Everything is
 * generated from plain data so there are no image assets: sprites slide on
 * keyframes, arrows/rings/captions fade in at their moment of the story.
 *
 * Coordinates are [column, row] on a 4x4 grid, row 0 at the top.
 * Frames are [percent, x, y, opacity?]. Arrows/notes use percent windows.
 */

const DEMOS = {
  simultaneous: {
    loop: 5200,
    label: 'Two knights moving on the same round',
    sprites: [
      { key: 'wn', t: 'n', c: 'w', frames: [[0, 0, 3], [12, 0, 3], [58, 1, 1], [86, 1, 1], [92, 0, 3, 0], [100, 0, 3, 0]] },
      { key: 'bn', t: 'n', c: 'b', frames: [[0, 3, 0], [12, 3, 0], [58, 2, 2], [86, 2, 2], [92, 3, 0, 0], [100, 3, 0, 0]] },
    ],
    notes: [{ key: 'n', text: 'both decide at once', p0: 60, p1: 88 }],
  },

  clash: {
    loop: 5600,
    label: 'Two pieces landing on one square both die',
    sprites: [
      { key: 'wr', t: 'r', c: 'w', frames: [[0, 0, 1], [10, 0, 1], [46, 1, 1], [64, 1, 1], [69, 1, 1, 0], [94, 0, 1, 0], [100, 0, 1, 0]] },
      { key: 'bb', t: 'b', c: 'b', frames: [[0, 3, 3], [10, 3, 3], [46, 1, 1], [64, 1, 1], [69, 1, 1, 0], [94, 3, 3, 0], [100, 3, 3, 0]] },
    ],
    flashes: [{ key: 'f', at: [1, 1], p0: 45, p1: 66 }],
    notes: [{ key: 'n', text: 'same square → both die', p0: 56, p1: 90, tone: 'red' }],
  },

  pawns: {
    loop: 8400,
    label: 'An advancing pawn loses a clash; two pawns capturing each other both die',
    sprites: [
      // An advancing pawn is not attacking: in a clash it is the one destroyed.
      { key: 'wp-a', t: 'p', c: 'w', frames: [[0, 3, 3], [6, 3, 3], [28, 3, 2], [38, 3, 2, 0], [46, 3, 3, 0], [100, 3, 3, 0]] },
      { key: 'bn-a', t: 'n', c: 'b', frames: [[0, 1, 1], [6, 1, 1], [28, 3, 2], [100, 3, 2]] },
      // Two pawns capturing diagonally onto each other's square: both die.
      { key: 'wp-b', t: 'p', c: 'w', frames: [[0, 1, 3, 0], [50, 1, 3, 0], [54, 1, 3], [74, 2, 2], [80, 2, 2, 0], [100, 1, 3, 0]] },
      { key: 'bp-b', t: 'p', c: 'b', frames: [[0, 2, 2, 0], [50, 2, 2, 0], [54, 2, 2], [74, 1, 3], [80, 1, 3, 0], [100, 2, 2, 0]] },
    ],
    flashes: [
      { key: 'f', at: [3, 2], p0: 26, p1: 40 },
      { key: 'g', at: [1.5, 2.5], p0: 72, p1: 86 },
    ],
    notes: [
      { key: 'na', text: 'advance → pawn dies', p0: 26, p1: 46 },
      { key: 'nb', text: 'diagonal capture → both die', p0: 70, p1: 94, tone: 'red' },
    ],
  },

  mutual: {
    loop: 5600,
    label: 'A queen and a rook attacking each other both die',
    sprites: [
      { key: 'wq', t: 'q', c: 'w', frames: [[0, 1, 3], [10, 1, 3], [58, 1, 0], [66, 1, 0], [71, 1, 0, 0], [94, 1, 3, 0], [100, 1, 3, 0]] },
      { key: 'br', t: 'r', c: 'b', frames: [[0, 1, 0], [10, 1, 0], [58, 1, 3], [66, 1, 3], [71, 1, 3, 0], [94, 1, 0, 0], [100, 1, 0, 0]] },
    ],
    flashes: [{ key: 'f', at: [1, 1.5], p0: 50, p1: 74 }],
    notes: [{ key: 'n', text: 'mutual attack → both die', p0: 62, p1: 92, tone: 'red' }],
  },

  dodge: {
    loop: 6200,
    label: 'The bishop dodges: the rook takes its square, the bishop takes the knight',
    sprites: [
      { key: 'a', t: 'r', c: 'w', frames: [[0, 0, 1], [10, 0, 1], [60, 1, 1], [88, 1, 1], [93, 0, 1, 0], [100, 0, 1, 0]] },
      { key: 'b', t: 'b', c: 'b', frames: [[0, 1, 1], [10, 1, 1], [60, 2, 2], [88, 2, 2], [93, 1, 1, 0], [100, 1, 1, 0]] },
      { key: 'c', t: 'n', c: 'w', frames: [[0, 2, 2], [55, 2, 2], [61, 2, 2, 0], [93, 2, 2, 0], [100, 2, 2, 0]] },
    ],
    arrows: [
      { key: 'a1', from: [0, 1], to: [1, 1], p0: 2, p1: 14 },
      { key: 'b1', from: [1, 1], to: [2, 2], p0: 2, p1: 14 },
    ],
    notes: [{ key: 'n', text: 'the bishop dodged', p0: 64, p1: 92 }],
  },

  check: {
    loop: 7200,
    label: 'The checked king answers alone, then the opponent gets a free turn',
    sprites: [
      { key: 'wk', t: 'k', c: 'w', frames: [[0, 1, 2], [12, 1, 2], [42, 2, 2], [90, 2, 2], [95, 1, 2, 0], [100, 1, 2, 0]] },
      { key: 'br', t: 'r', c: 'b', frames: [[0, 1, 0], [52, 1, 0], [84, 0, 0], [93, 0, 0, 0], [100, 1, 0, 0]] },
    ],
    arrows: [{ key: 'check', from: [1, 0], to: [1, 2], p0: 4, p1: 38, tone: 'red' }],
    rings: [{ key: 'rk', at: [1, 2], p0: 6, p1: 40, tone: 'red' }],
    notes: [
      { key: 'c', text: 'check → reply alone', p0: 6, p1: 42, tone: 'red' },
      { key: 'f', text: 'then one free turn', p0: 56, p1: 90 },
    ],
  },

  overextension: {
    loop: 6600,
    label: 'Capturing on the opponent’s last two ranks leaves the piece overextended',
    sprites: [
      { key: 'wn', t: 'n', c: 'w', frames: [[0, 0, 3], [10, 0, 3], [48, 1, 1], [88, 1, 1], [93, 0, 3, 0], [100, 0, 3, 0]] },
      { key: 'bp', t: 'p', c: 'b', frames: [[0, 1, 1], [48, 1, 1], [53, 1, 1, 0], [100, 1, 1, 0]] },
      // The rest of Black's last two ranks, for context.
      { key: 'bp2', t: 'p', c: 'b', frames: [[0, 0, 1], [100, 0, 1]] },
      { key: 'bp3', t: 'p', c: 'b', frames: [[0, 2, 1], [100, 2, 1]] },
      { key: 'br', t: 'r', c: 'b', frames: [[0, 3, 0], [100, 3, 0]] },
      { key: 'bk', t: 'k', c: 'b', frames: [[0, 3, 1], [100, 3, 1]] },
    ],
    flashes: [{ key: 'f', at: [1, 1], p0: 46, p1: 62, tone: 'gold' }],
    rings: [{ key: 'pin', at: [1, 1], p0: 56, p1: 92, tone: 'gold' }],
    notes: [{ key: 'n', text: 'overextended — no move next round', p0: 60, p1: 94, tone: 'gold' }],
  },

  backattack: {
    loop: 12000,
    label: 'Strict take or hook — only a diagonal move escapes the hook',
    sprites: [
      // Beat 1: the pawn stays put — the hook lands on its square.
      { key: 'r-a', t: 'r', c: 'w', frames: [[0, 1, 0], [8, 1, 0], [22, 1, 1], [32, 1, 1], [33, 1, 1, 0], [100, 1, 0, 0]] },
      { key: 'p-a', t: 'p', c: 'b', frames: [[0, 1, 1], [22, 1, 1], [25, 1, 1, 0], [100, 1, 1, 0]] },
      // Beat 2: the pawn advances two — the hook follows it.
      { key: 'r-b', t: 'r', c: 'w', frames: [[0, 1, 0, 0], [33, 1, 0, 0], [34, 1, 0], [50, 1, 3], [62, 1, 3], [66, 1, 0, 0], [100, 1, 0, 0]] },
      { key: 'p-b', t: 'p', c: 'b', frames: [[0, 1, 1, 0], [33, 1, 1, 0], [34, 1, 1], [44, 1, 3], [50, 1, 3], [53, 1, 3, 0], [100, 1, 1, 0]] },
      // Beat 3: the pawn captures diagonally — the hook grabs nothing.
      { key: 'r-c', t: 'r', c: 'w', frames: [[0, 1, 0, 0], [66, 1, 0, 0], [67, 1, 0], [80, 1, 1], [94, 1, 1], [97, 1, 0, 0], [100, 1, 0, 0]] },
      { key: 'p-c', t: 'p', c: 'b', frames: [[0, 1, 1, 0], [66, 1, 1, 0], [67, 1, 1], [78, 2, 2], [94, 2, 2], [97, 1, 1, 0], [100, 1, 1, 0]] },
    ],
    arrows: [
      { key: 'hook1', from: [1, 0], to: [1, 1], p0: 4, p1: 20 },
      { key: 'hook2', from: [1, 0], to: [1, 3], p0: 36, p1: 50 },
      { key: 'dodge', from: [1, 1], to: [2, 2], p0: 68, p1: 78 },
    ],
    notes: [
      { key: 'na', text: 'stays → hook lands on it', p0: 20, p1: 32 },
      { key: 'nb', text: 'advances → hook follows', p0: 48, p1: 62 },
      { key: 'nc', text: 'diagonal → dodged', p0: 80, p1: 95, tone: 'gold' },
    ],
  },
};

function keyframes(name, stops) {
  return `@keyframes ${name}{${stops.map(([p, css]) => `${p}%{${css}}`).join('')}}`;
}

/** Opacity timeline: hidden → visible in [p0, p1] → hidden. */
function fadeStops(p0, p1, extra = '') {
  const stops = [
    [0, `opacity:0;${extra}`],
    [p0, `opacity:0;${extra}`],
    [Math.min(p0 + 3, p1), `opacity:1;${extra}`],
    [p1, `opacity:1;${extra}`],
    [Math.min(p1 + 4, 100), `opacity:0;${extra}`],
    [100, `opacity:0;${extra}`],
  ];
  const merged = new Map();
  for (const [p, css] of stops) merged.set(p, css);
  return [...merged.entries()].sort((a, b) => a[0] - b[0]);
}

function buildCss(id, demo) {
  const rules = [];

  for (const s of demo.sprites) {
    const stops = s.frames.map(([p, x, y, o = 1]) => [
      p,
      `transform:translate(${x * 100}%,${y * 100}%);opacity:${o}`,
    ]);
    rules.push(keyframes(`${id}-${s.key}`, stops));
  }

  for (const a of demo.arrows || []) {
    rules.push(keyframes(`${id}-${a.key}`, fadeStops(a.p0, a.p1)));
  }

  for (const n of demo.notes || []) {
    rules.push(keyframes(`${id}-${n.key}`, fadeStops(n.p0, n.p1)));
  }

  for (const f of demo.flashes || []) {
    rules.push(
      keyframes(`${id}-${f.key}`, [
        [0, 'opacity:0;transform:scale(.25)'],
        [f.p0, 'opacity:0;transform:scale(.25)'],
        [Math.min(f.p0 + 3, f.p1), 'opacity:.95;transform:scale(.55)'],
        [f.p1, 'opacity:.5;transform:scale(1.7)'],
        [Math.min(f.p1 + 6, 100), 'opacity:0;transform:scale(2)'],
        [100, 'opacity:0;transform:scale(.25)'],
      ])
    );
  }

  for (const r of demo.rings || []) {
    rules.push(keyframes(`${id}-${r.key}`, fadeStops(r.p0, r.p1)));
  }

  return rules.join('\n');
}

export default function RuleDemo({ id }) {
  const demo = DEMOS[id];
  if (!demo) return null;
  const loop = demo.loop || 6000;
  const uid = `demo-${id}`;
  const css = buildCss(uid, demo);

  return (
    <div className="ruleDemo" aria-hidden="true">
      <div className="demoBoard" title={demo.label}>
        <style>{css}</style>

        <div className="demoGrid">
          {Array.from({ length: 16 }, (_, i) => {
            const r = i >> 2;
            const c = i & 3;
            return <span key={i} className={`demoCell ${(r + c) % 2 === 0 ? 'light' : 'dark'}`} />;
          })}
        </div>

        {demo.arrows && demo.arrows.length > 0 && (
          <svg className="demoArrows" viewBox="0 0 4 4">
            <defs>
              <marker
                id={`${uid}-gold`}
                viewBox="0 0 1 1"
                refX="0.92"
                refY="0.5"
                markerWidth="0.36"
                markerHeight="0.36"
                markerUnits="userSpaceOnUse"
                orient="auto"
              >
                <path d="M0 0 L1 0.5 L0 1 z" fill="#d9b171" />
              </marker>
              <marker
                id={`${uid}-red`}
                viewBox="0 0 1 1"
                refX="0.92"
                refY="0.5"
                markerWidth="0.36"
                markerHeight="0.36"
                markerUnits="userSpaceOnUse"
                orient="auto"
              >
                <path d="M0 0 L1 0.5 L0 1 z" fill="#e2685f" />
              </marker>
            </defs>
            {demo.arrows.map((a) => (
              <line
                key={a.key}
                x1={a.from[0] + 0.5}
                y1={a.from[1] + 0.5}
                x2={a.to[0] + 0.5}
                y2={a.to[1] + 0.5}
                className={`demoArrow ${a.tone || 'gold'}`}
                markerEnd={`url(#${uid}-${a.tone || 'gold'})`}
                style={{ animationName: `${uid}-${a.key}`, animationDuration: `${loop}ms` }}
              />
            ))}
          </svg>
        )}

        {demo.sprites.map((s) => (
          <div
            key={s.key}
            className={`demoPiece piece-${s.c === 'w' ? 'white' : 'black'}`}
            style={{
              transform: `translate(${s.frames[0][1] * 100}%, ${s.frames[0][2] * 100}%)`,
              opacity: s.frames[0][3] ?? 1,
              animationName: `${uid}-${s.key}`,
              animationDuration: `${loop}ms`,
            }}
          >
            <span className="glyph">{GLYPH[s.t]}</span>
          </div>
        ))}

        {(demo.flashes || []).map((f) => (
          <span
            key={f.key}
            className={`demoFlash ${f.tone || 'red'}`}
            style={{
              left: `${f.at[0] * 25}%`,
              top: `${f.at[1] * 25}%`,
              animationName: `${uid}-${f.key}`,
              animationDuration: `${loop}ms`,
            }}
          />
        ))}

        {(demo.rings || []).map((r) => (
          <span
            key={r.key}
            className={`demoRing ${r.tone || 'gold'}`}
            style={{
              left: `${r.at[0] * 25}%`,
              top: `${r.at[1] * 25}%`,
              animationName: `${uid}-${r.key}`,
              animationDuration: `${loop}ms`,
            }}
          />
        ))}
      </div>

      <div className="demoCaption">
        {(demo.notes || []).map((n) => (
          <span
            key={n.key}
            className={`demoNote ${n.tone || ''}`}
            style={{ animationName: `${uid}-${n.key}`, animationDuration: `${loop}ms` }}
          >
            {n.text}
          </span>
        ))}
      </div>
    </div>
  );
}
