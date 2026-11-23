'use client';

import { useState } from 'react';

export default function WaitingScreen({ mode, pin, settings, onCancel, notice }) {
  const [copied, setCopied] = useState(false);

  const clockLine = settings
    ? `${Math.round(settings.freeMs / 1000)}s free per move · ${Math.round(settings.reserveMs / 60000)} min reserve`
    : '';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(pin);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="waitScreen">
      <div className="waitCard">
        <div className="brand small">
          <span className="brandMark" aria-hidden>
            ♞
          </span>
          <span className="brandName">Simultaneous Chess</span>
        </div>

        {mode === 'hosting' ? (
          <>
            <h2>Your private room</h2>
            <p className="muted">Share this PIN — whoever enters it first joins your board.</p>
            <button type="button" className="pinDisplay" onClick={copy} title="Copy PIN">
              {pin}
            </button>
            <p className="muted small">{copied ? 'Copied to clipboard' : 'Tap the PIN to copy'}</p>
            {clockLine && <p className="muted small">{clockLine}</p>}
            <div className="waitingLine">
              <span className="pulseDot amber" />
              <span>Waiting for a challenger…</span>
            </div>
          </>
        ) : (
          <>
            <h2>Looking for an opponent</h2>
            <p className="muted">Matching you with another player who is online.</p>
            <div className="spinnerBig" aria-hidden />
            <div className="waitingLine">
              <span className="pulseDot" />
              <span>Searching the lobby…</span>
            </div>
          </>
        )}

        {notice && <p className="errorText">{notice}</p>}

        <button type="button" className="ghostBtn wide" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
