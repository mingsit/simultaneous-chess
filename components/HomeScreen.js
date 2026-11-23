'use client';

import { useState } from 'react';
import RulesPanel from './RulesPanel';
import RoomSetup from './RoomSetup';

export default function HomeScreen({
  name,
  onName,
  onSolo,
  difficulty = 'easy',
  onDifficulty,
  onQuick,
  onCreateRoom,
  onJoinRoom,
  conn,
  notice,
  disabled,
}) {
  const [pin, setPin] = useState('');
  const [roomSetup, setRoomSetup] = useState(false);

  const submitPin = (e) => {
    e.preventDefault();
    if (pin.length === 6) onJoinRoom(pin);
  };

  const createRoom = (settings) => {
    setRoomSetup(false);
    onCreateRoom(settings);
  };

  return (
    <div className="home">
      <header className="homeTop">
        <div className="brand">
          <span className="brandMark" aria-hidden>
            ♞
          </span>
          <span className="brandName">Simultaneous Chess</span>
        </div>
        <div className="homeTopRight">
          <span className={`connBadge ${conn}`}>
            <i /> {conn === 'open' ? 'server online' : 'connecting…'}
          </span>
        </div>
      </header>

      <main className="homeGrid">
        <section className="hero">
          <p className="eyebrow">A chess variant for two impatient minds</p>
          <h1>
            Two minds.
            <br />
            <em>One move.</em>
          </h1>
          <p className="lede">
            Both players commit to a move in secret. The board only resolves when both decisions are locked in —
            so every single turn is a gamble, a bluff, or a collision.
          </p>

          <div className="nameField">
            <label htmlFor="player-name">Your name</label>
            <input
              id="player-name"
              value={name}
              maxLength={18}
              onChange={(e) => onName(e.target.value)}
              placeholder="Player"
              autoComplete="off"
            />
          </div>

          {notice && <div className="homeNotice">{notice}</div>}

          <div className="difficultyRow">
            <div className="difficultyCopy">
              <span className="difficultyLabel">Single-player bot</span>
              <span className="difficultyHint">
                {difficulty === 'hard'
                  ? 'Rule-aware, a good way to practice PvP.'
                  : 'One move ahead. A gentle way to learn the board.'}
              </span>
            </div>
            <div className="segmented" role="group" aria-label="Bot difficulty">
              {['easy', 'hard'].map((level) => (
                <button
                  key={level}
                  type="button"
                  className={difficulty === level ? 'on' : undefined}
                  aria-pressed={difficulty === level}
                  onClick={() => onDifficulty && onDifficulty(level)}
                >
                  <span className="segIcon" aria-hidden>
                    {level === 'easy' ? '♙' : '♛'}
                  </span>
                  {level === 'easy' ? 'Easy' : 'Hard'}
                </button>
              ))}
            </div>
          </div>

          <div className="modeGrid">
            <button type="button" className="modeCard" onClick={() => onSolo(difficulty)} disabled={disabled}>
              <span className="modeIcon" aria-hidden>
                ♟
              </span>
              <span className="modeTitle">Single player</span>
              <span className="modeDesc">
                {difficulty === 'hard'
                  ? 'Take on the rule-aware bot with the full match clock. Practice for a PvP game.'
                  : 'Get familiar with the rules. No clock, no waiting — think as long as you like.'}
              </span>
              <span className="modeCta">Play {difficulty === 'hard' ? 'Hard' : 'Easy'} →</span>
            </button>

            <button type="button" className="modeCard accent" onClick={onQuick} disabled={disabled || conn !== 'open'}>
              <span className="modeIcon" aria-hidden>
                ⚔
              </span>
              <span className="modeTitle">Find a match</span>
              <span className="modeDesc">Get paired with the next player who is online right now.</span>
              <span className="modeCta">Search for opponent →</span>
            </button>

            <button
              type="button"
              className="modeCard"
              onClick={() => setRoomSetup(true)}
              disabled={disabled || conn !== 'open'}
            >
              <span className="modeIcon" aria-hidden>
                ⚿
              </span>
              <span className="modeTitle">Private room</span>
              <span className="modeDesc">Create a room, choose the clock, share the 6-digit PIN with a friend.</span>
              <span className="modeCta">Create a room →</span>
            </button>
          </div>

          <form className="joinForm" onSubmit={submitPin}>
            <label htmlFor="pin-input">Join with a room PIN</label>
            <div className="joinRow">
              <input
                id="pin-input"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                value={pin}
                maxLength={6}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              />
              <button type="submit" className="primaryBtn" disabled={pin.length !== 6 || conn !== 'open'}>
                Join room
              </button>
            </div>
          </form>
        </section>

        <aside className="homeSide">
          <RulesPanel />
        </aside>
      </main>

      <footer className="homeFoot">
        <span>Both moves resolve at once. Nothing is revealed early.</span>
        <span className="muted">10s free per move · cumulative 5 min reserve · private rooms can raise both</span>
      </footer>

      {roomSetup && <RoomSetup onCancel={() => setRoomSetup(false)} onCreate={createRoom} />}
    </div>
  );
}
