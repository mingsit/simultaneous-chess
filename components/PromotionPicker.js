'use client';

import { GLYPH, PIECE_NAME } from '../shared/engine.mjs';

export default function PromotionPicker({ options, color, onPick, onCancel }) {
  return (
    <div className="modalBackdrop" role="dialog" aria-modal="true">
      <div className="modal">
        <h3>Promote your pawn</h3>
        <p className="muted">A pawn may only become a piece you have already lost.</p>
        <div className="promoGrid">
          {options.map((t) => (
            <button key={t} type="button" className="promoBtn" onClick={() => onPick(t)}>
              <span className={`promoGlyph ${color === 'w' ? 'white' : 'black'}`}>{GLYPH[t]}</span>
              <span className="promoName">{PIECE_NAME[t]}</span>
            </button>
          ))}
        </div>
        <button type="button" className="ghostBtn wide" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
