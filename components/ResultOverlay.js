'use client';

import { colorName } from '../lib/ui';

export default function ResultOverlay({ result, myColor, onLeave, onRematch, mode }) {
  const draw = result.type === 'draw';
  const won = !draw && result.winner === myColor;
  const title = draw ? 'Draw' : won ? 'You win' : 'You lose';
  const cls = draw ? 'draw' : won ? 'win' : 'lose';

  return (
    <div className="modalBackdrop resultBackdrop" role="dialog" aria-modal="true">
      <div className={`modal resultModal ${cls}`}>
        <div className={`resultBadge ${cls}`}>{draw ? '½ – ½' : won ? '1 – 0' : '0 – 1'}</div>
        <h2>{title}</h2>
        <p className="resultReason">{result.reason}</p>
        {!draw && result.winner && (
          <p className="muted small">{colorName(result.winner)} takes the game.</p>
        )}
        <div className="modalActions">
          {mode === 'single' && onRematch && (
            <button type="button" className="primaryBtn" onClick={onRematch}>
              Play again
            </button>
          )}
          <button type="button" className={mode === 'single' ? 'ghostBtn' : 'primaryBtn'} onClick={onLeave}>
            {mode === 'single' ? 'Main menu' : 'Back to lobby'}
          </button>
        </div>
      </div>
    </div>
  );
}
