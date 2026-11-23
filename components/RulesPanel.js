'use client';

import { useState } from 'react';
import RuleDemo from './RuleDemo';

const RULES = [
  {
    demo: 'simultaneous',
    t: 'Both players move at the same time',
    d: 'Each side locks in one action. Nothing is processed — and nothing is revealed — until both have decided.',
  },
  {
    demo: 'clash',
    t: 'Same square = both attack',
    d: 'Two pieces that land on one square destroy each other. The exceptions: a King always survives that clash, and a Pawn that only advanced is the one destroyed.',
  },
  {
    demo: 'pawns',
    t: 'Pawns attack diagonally',
    d: 'A pawn moving diagonally is attacking, so a clash or swap with it destroys both pieces. A pawn that just advances is not attacking — in a clash it is the pawn that dies.',
  },
  {
    demo: 'mutual',
    t: 'Mutual attack destroys both',
    d: 'If A moves onto B while B moves onto A, both are destroyed — a King still wins that exchange.',
  },
  {
    demo: 'dodge',
    t: 'Dodging works',
    d: 'If A attacks B while B attacks C, B dodged: C is destroyed, B lands on C and A lands on B’s old square.',
  },
  {
    demo: 'check',
    t: 'Check forces a reply',
    d: 'A checked player decides first and must break the check. Then the opponent gets one free turn. If both kings are checked, both must break it and neither may attack the other king.',
  },
  {
    demo: 'overextension',
    t: 'Overextension',
    d: 'A bishop, knight, rook or queen that captures a piece on the opponent’s last two ranks is overextended: it cannot move on the next round, though it still attacks and gives check. Pawns and kings are exempt, and the rule lapses after round 20.',
  },
  {
    demo: 'backattack',
    t: 'Back attacking',
    d: 'A rook or queen standing behind an enemy pawn may take it strictly — the raider stops on the pawn’s square — or hook it. The hook follows the pawn: it lands on the pawn’s square if it stays, follows it if it advances, and catches nothing if the pawn dodges diagonally (the raider then stops on the pawn’s old square). Click the dashed ring to choose.',
  },
  {
    t: '❌castling ❌passant, ✅passing',
    d: 'Castling and en passant do not exist. You may pass a turn — but only while your own king is not in check.',
  },
  {
    t: 'Promotion',
    d: 'A pawn reaching the last rank can only become a piece you have already lost — and each lost piece can be revived once. No lost pieces means no promotion, so you are asked to confirm before the pawn simply stays a pawn.',
  },
  {
    t: 'Draws',
    d: 'Both kings checkmated at once, only the two kings left on the board, threefold repetition, both players passing twice in a row, or nobody has won after 99 turns.',
  },
  {
    t: 'Clock',
    d: 'Each move starts with 10 seconds of free thinking time. After that your 5-minute reserve burns down cumulatively, move after move; locking in a move pauses your clock. When the reserve runs out your turn is skipped automatically — but a checked player cannot skip, so running out while in check loses the game.',
  },
];

/** Rules 01–06 are the core of the variant; the rest is fine print. */
const CORE_COUNT = 6;
const EXTRA_RULES = RULES.slice(CORE_COUNT);

export default function RulesPanel() {
  const [open, setOpen] = useState(null);
  const [showExtra, setShowExtra] = useState(false);

  const renderRule = (r, i) => {
    const isOpen = !!r.demo && open === r.demo;
    const panelId = `demo-panel-${r.demo || i}`;
    return (
      <li key={r.t} className={isOpen ? 'ruleOpen' : undefined}>
        <span className="ruleNum">{String(i + 1).padStart(2, '0')}</span>
        <div className="ruleBody">
          <div className="ruleTop">
            <h3>{r.t}</h3>
            {r.demo && (
              <button
                type="button"
                className="demoToggle"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => setOpen(isOpen ? null : r.demo)}
              >
                {isOpen ? 'Hide' : 'Watch'}
              </button>
            )}
          </div>
          <p>{r.d}</p>
          {r.demo && (
            <div id={panelId} className="demoSlot" hidden={!isOpen}>
              {isOpen && <RuleDemo id={r.demo} />}
            </div>
          )}
        </div>
      </li>
    );
  };

  const toggleExtra = () => {
    // A demo that is about to be hidden should not stay “open”.
    if (showExtra && open && EXTRA_RULES.some((r) => r.demo === open)) setOpen(null);
    setShowExtra(!showExtra);
  };

  return (
    <div className="rules">
      <div className="rulesHead">
        <h2>How it works</h2>
        <span className="muted small">Six core rules — then the fine print</span>
      </div>
      <ol className="rulesList">{RULES.slice(0, CORE_COUNT).map(renderRule)}</ol>

      <button
        type="button"
        className="rulesMore"
        aria-expanded={showExtra}
        aria-controls="extra-rules"
        onClick={toggleExtra}
      >
        <span className="rulesMoreTitle">{showExtra ? 'Hide additional rules' : 'Additional rules'}</span>
        <span className="rulesMoreCount">
          0{CORE_COUNT + 1}–{RULES.length}
        </span>
        <span className="rulesMoreChevron" aria-hidden>
          ▾
        </span>
      </button>

      <div id="extra-rules" className="rulesExtra" hidden={!showExtra}>
        <ol className="rulesList" start={CORE_COUNT + 1}>
          {EXTRA_RULES.map((r, i) => renderRule(r, CORE_COUNT + i))}
        </ol>
      </div>
    </div>
  );
}
