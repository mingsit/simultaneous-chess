'use client';

import { GLYPH, WHITE, sqName } from '../shared/engine.mjs';
import { actionLabel, PIECE_LETTER } from '../lib/ui';

function ActionRow({ color, action, isLatest }) {
  const isPass = !action || action.k === 'pass';
  return (
    <div className={`logRow ${color}`}>
      <span className={`miniDot ${color}`} aria-hidden />
      <span className={`logMove ${isPass ? 'pass' : ''}`}>
        {action && action.k === 'move' && action.piece ? (
          <>
            <span className="miniGlyph">{GLYPH[action.piece.t]}</span>
            {sqName(action.from)}→{sqName(action.to)}
            {action.back != null ? <em>back attack</em> : null}
            {action.promo ? <em>= {PIECE_LETTER[action.promo]}</em> : null}
          </>
        ) : (
          <span className="passText">pass</span>
        )}
      </span>
      {isLatest && <span className="logNow" />}
    </div>
  );
}

export default function RoundLog({ log, myColor, compact = false }) {
  if (!log || log.length === 0) {
    return (
      <div className="logEmpty">
        <div className="logEmptyIcon">⚔</div>
        <p>No rounds yet.</p>
        <p className="muted small">
          Both moves are revealed at the same moment — that&apos;s the whole game.
        </p>
      </div>
    );
  }

  const entries = [...log].reverse();
  return (
    <div className={`roundLog ${compact ? 'compact' : ''}`}>
      {entries.map((entry, idx) => {
        const chips = [];
        for (const ev of entry.events || []) {
          if (ev.type === 'clash') {
            chips.push({ key: `${ev.at}-clash`, cls: 'clash', text: `clash ${sqName(ev.at)}` });
          } else if (ev.type === 'swap') {
            chips.push({ key: `${ev.at}-swap`, cls: 'clash', text: `mutual ${sqName(ev.at)}` });
          } else if (ev.type === 'capture') {
            chips.push({
              key: `${ev.at}-cap-${ev.piece.id}`,
              cls: 'kill',
              text: `${GLYPH[ev.piece.t]} lost ${sqName(ev.at)}`,
            });
          } else if (ev.type === 'promote') {
            chips.push({ key: `${ev.at}-promo`, cls: 'promo', text: `↑ ${sqName(ev.at)}` });
          } else if (ev.type === 'overextend') {
            chips.push({ key: `${ev.at}-pin`, cls: 'pin', text: `overextended ${sqName(ev.at)}` });
          }
        }
        const bothPass = (!entry.actions?.w || entry.actions.w.k === 'pass') && (!entry.actions?.b || entry.actions.b.k === 'pass');
        return (
          <div className={`logRound ${idx === 0 ? 'latest' : ''}`} key={entry.round}>
            <div className="logHead">
              <span className="logNum">{entry.round}</span>
              {entry.phaseBefore === 'solo' && (
                <span className="logTag">{entry.activeBefore === myColor ? 'your solo turn' : 'solo turn'}</span>
              )}
              {entry.phaseBefore === 'simultaneous' && entry.check?.w && entry.check?.b && (
                <span className="logTag warn">double check</span>
              )}
            </div>
            <ActionRow color="w" action={entry.actions?.w} isLatest={idx === 0} />
            <ActionRow color="b" action={entry.actions?.b} isLatest={idx === 0} />
            {chips.length > 0 && (
              <div className="logChips">
                {chips.map((c) => (
                  <span key={c.key} className={`chip ${c.cls}`}>
                    {c.text}
                  </span>
                ))}
              </div>
            )}
            {bothPass && <div className="logNote">both waited</div>}
          </div>
        );
      })}
    </div>
  );
}
