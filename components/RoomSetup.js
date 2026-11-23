'use client';

import { useEffect, useId, useState } from 'react';
import { readStoredRoomClock, storeRoomClock } from '../lib/useOnline';

/* Same limits the engine enforces (MIN_FREE_MS … MAX_RESERVE_MS). */
const FREE = { min: 10, max: 60, step: 5 };
const RESERVE = { min: 3, max: 20, step: 1 };

const freeLabel = (s) => `${s}s`;
const reserveLabel = (m) => `${m} min`;

function ClockSlider({ id, label, value, range, format, onChange }) {
  const pct = ((value - range.min) / (range.max - range.min)) * 100;
  return (
    <div className="rangeField">
      <div className="rangeHead">
        <label htmlFor={id}>{label}</label>
        <output htmlFor={id} className="rangeValue">
          {format(value)}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={range.min}
        max={range.max}
        step={range.step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ '--pct': `${pct}%` }}
        aria-valuetext={format(value)}
      />
      <div className="rangeEnds" aria-hidden>
        <span>{format(range.min)}</span>
        <span>{format(range.max)}</span>
      </div>
    </div>
  );
}

export default function RoomSetup({ onCancel, onCreate }) {
  // Opening the modal is always a client action, so the saved default can be
  // read straight into state. With nothing saved this is the ranked clock.
  const [clock, setClock] = useState(readStoredRoomClock);
  const [saved, setSaved] = useState(false);
  const freeId = useId();
  const reserveId = useId();

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  useEffect(() => {
    if (!saved) return undefined;
    const id = setTimeout(() => setSaved(false), 1800);
    return () => clearTimeout(id);
  }, [saved]);

  const setFree = (freeSec) => setClock((c) => ({ ...c, freeSec }));
  const setReserve = (reserveMin) => setClock((c) => ({ ...c, reserveMin }));

  const create = () => onCreate({ freeMs: clock.freeSec * 1000, reserveMs: clock.reserveMin * 60_000 });

  const saveDefault = () => {
    storeRoomClock(clock);
    setSaved(true);
  };

  return (
    <div
      className="roomSetup"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="roomSetupCard" role="dialog" aria-modal="true" aria-labelledby="room-setup-title">
        <p className="eyebrow">Private room</p>
        <h2 id="room-setup-title">Set the clock</h2>
        <p className="muted small">
          Both players share these limits. Untouched, this is the ranked clock — 10s free and a 5-minute reserve.
          Drag the sliders, then save a pair as your default if you like.
        </p>

        <div className="roomSetupFields">
          <ClockSlider
            id={freeId}
            label="Free time per move"
            value={clock.freeSec}
            range={FREE}
            format={freeLabel}
            onChange={setFree}
          />
          <ClockSlider
            id={reserveId}
            label="Reserve"
            value={clock.reserveMin}
            range={RESERVE}
            format={reserveLabel}
            onChange={setReserve}
          />
        </div>

        <div className="roomSetupFoot">
          <button type="button" className={`defaultBtn ${saved ? 'saved' : ''}`} onClick={saveDefault}>
            {saved ? 'Saved ✓' : 'Set as default'}
          </button>
          <div className="roomSetupActions">
            <button type="button" className="ghostBtn" onClick={onCancel}>
              Cancel
            </button>
            <button type="button" className="primaryBtn" onClick={create}>
              Create room →
            </button>
          </div>
        </div>
        <span className="roomSetupStatus" role="status">
          {saved ? `Default saved: ${freeLabel(clock.freeSec)} + ${reserveLabel(clock.reserveMin)}` : ''}
        </span>
      </div>
    </div>
  );
}
