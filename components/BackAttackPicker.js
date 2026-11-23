'use client';

import { sqName } from '../shared/engine.mjs';

/**
 * Shown when a raider behind an enemy pawn has two different moves on the
 * same square: an ordinary capture that stops there, and the hook that
 * follows the pawn.
 */
export default function BackAttackPicker({ to, onPick, onCancel }) {
  const square = sqName(to);
  return (
    <div className="modalBackdrop" role="dialog" aria-modal="true" aria-labelledby="hookTitle">
      <div className="modal">
        <h3 id="hookTitle">Back attack on {square}</h3>
        <p className="muted">
          Two moves land on the same square, but they end differently if the pawn moves this round.
        </p>
        <div className="hookChoices">
          <button type="button" className="hookChoice" onClick={() => onPick(false)}>
            <span className="hookChoiceTitle">Take on {square}</span>
            <span className="hookChoiceNote">
              Strict capture: the raider stops on {square}, whether or not the pawn is still there.
            </span>
          </button>
          <button type="button" className="hookChoice primary" onClick={() => onPick(true)}>
            <span className="hookChoiceTitle">Hook · follow the pawn</span>
            <span className="hookChoiceNote">
              Lands on {square} if the pawn stays, follows a one- or two-step advance, and catches
              nothing if it sidesteps diagonally.
            </span>
          </button>
        </div>
        <button type="button" className="ghostBtn wide" onClick={onCancel} autoFocus>
          Cancel
        </button>
      </div>
    </div>
  );
}
