'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import HomeScreen from '../components/HomeScreen';
import GameScreen from '../components/GameScreen';
import WaitingScreen from '../components/WaitingScreen';
import { LocalSession } from '../lib/localSession.mjs';
import {
  useOnline,
  readStoredName,
  storeName,
  readStoredDifficulty,
  storeDifficulty,
} from '../lib/useOnline';
import { playerView, WHITE } from '../shared/engine.mjs';

const botName = (level) => `Deep Puddle (${level === 'hard' ? 'Hard' : 'Easy'})`;

export default function Page() {
  const [screen, setScreen] = useState('home');
  const [name, setName] = useState('');
  const [difficulty, setDifficulty] = useState('easy');
  const [localState, setLocalState] = useState(null);
  const sessionRef = useRef(null);
  const online = useOnline();

  useEffect(() => {
    const stored = readStoredName();
    if (stored) setName(stored);
    setDifficulty(readStoredDifficulty());
  }, []);

  useEffect(() => {
    if (online.phase === 'playing') setScreen('online');
    if (online.phase === 'searching' || online.phase === 'hosting') setScreen('online');
    if (online.phase === 'idle') setScreen((s) => (s === 'local' ? s : 'home'));
  }, [online.phase]);

  useEffect(() => () => sessionRef.current?.stop(), []);

  const displayName = name.trim() || 'Player';

  const startLocal = useCallback((level) => {
    const nextLevel = level === 'hard' ? 'hard' : 'easy';
    sessionRef.current?.stop();
    const session = new LocalSession({ onChange: setLocalState, level: nextLevel });
    sessionRef.current = session;
    setDifficulty(nextLevel);
    storeDifficulty(nextLevel);
    session.start();
    setScreen('local');
  }, []);

  const chooseDifficulty = useCallback((level) => {
    const nextLevel = level === 'hard' ? 'hard' : 'easy';
    setDifficulty(nextLevel);
    storeDifficulty(nextLevel);
  }, []);

  const leaveLocal = useCallback(() => {
    sessionRef.current?.stop();
    sessionRef.current = null;
    setLocalState(null);
    setScreen('home');
  }, []);

  const leaveEverything = useCallback(() => {
    if (screen === 'local') {
      leaveLocal();
      return;
    }
    online.actions.leave();
    setScreen('home');
  }, [screen, leaveLocal, online.actions]);

  const localView = localState ? playerView(localState, WHITE) : null;

  if (screen === 'local' && localView) {
    return (
      <GameScreen
        view={localView}
        myColor={WHITE}
        myName={displayName}
        opponentName={botName(difficulty)}
        difficulty={difficulty}
        mode="single"
        now={() => Date.now()}
        onSubmit={(action) => (sessionRef.current ? sessionRef.current.submit(action) : { error: 'Game not ready.' })}
        onRetract={() => (sessionRef.current ? sessionRef.current.retract() : {})}
        onResign={() => sessionRef.current?.resign()}
        onLeave={leaveLocal}
        onRematch={() => startLocal(difficulty)}
        isLocal
        conn="open"
      />
    );
  }

  if (online.phase === 'playing' && online.view) {
    return (
      <GameScreen
        view={online.view}
        myColor={online.color}
        myName={displayName}
        opponentName={online.opponent || 'Opponent'}
        opponentConnected={online.opponentConnected}
        mode={online.mode === 'private' ? 'private' : 'quick'}
        pin={online.pin}
        now={online.now}
        onSubmit={(action) => online.actions.move(action)}
        onRetract={() => online.actions.retract()}
        onResign={() => online.actions.resign()}
        onLeave={leaveEverything}
        isLocal={false}
        conn={online.conn}
        notice={online.notice?.message || null}
      />
    );
  }

  if (online.phase === 'searching' || online.phase === 'hosting') {
    return (
      <WaitingScreen
        mode={online.phase}
        pin={online.pin}
        settings={online.settings}
        onCancel={() => {
          online.actions.cancel();
          setScreen('home');
        }}
        notice={online.notice?.message || null}
      />
    );
  }

  return (
    <HomeScreen
      name={name}
      onName={(v) => {
        setName(v);
        storeName(v);
      }}
      onSolo={startLocal}
      difficulty={difficulty}
      onDifficulty={chooseDifficulty}
      onQuick={() => online.actions.quick(displayName)}
      onCreateRoom={(settings) => online.actions.createRoom(displayName, settings)}
      onJoinRoom={(pin) => online.actions.joinRoom(pin, displayName)}
      conn={online.conn}
      notice={online.notice?.message || null}
      disabled={false}
    />
  );
}
