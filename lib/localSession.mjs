'use client';

import {
  initialGame,
  submitAction,
  retractAction,
  playerView,
  actorsOf,
  expiredColors,
  applyTimeout,
  clockOf,
  WHITE,
  BLACK,
} from '../shared/engine.mjs';
import { chooseAiAction } from '../shared/ai.mjs';

/**
 * Drives a single-player game entirely in the browser.
 * The human plays White, the bot plays Black.
 *
 * Easy is a free sandbox with no clock. Hard is clocked exactly like an online
 * match (10s free per move, 5-minute reserve, automatic skips), so it doubles
 * as practice for a ranked game.
 */
const TIMED_LEVELS = new Set(['hard']);

export class LocalSession {
  constructor({ onChange, aiColor = BLACK, myColor = WHITE, level = 'easy' } = {}) {
    this.onChange = onChange || (() => {});
    this.aiColor = aiColor;
    this.myColor = myColor;
    this.level = level === 'hard' ? 'hard' : 'easy';
    this.timed = TIMED_LEVELS.has(this.level);
    this.state = this.newGame();
    this.aiTimer = null;
    this.ticker = null;
    this.disposed = false;
  }

  newGame() {
    // The matchmaking defaults are the engine defaults: 10s + 5:00.
    return this.timed ? initialGame(Date.now()) : initialGame(Date.now(), { untimed: true });
  }

  start() {
    this.stop();
    this.state = this.newGame();
    this.disposed = false;
    this.ticker = setInterval(() => this.tick(), 200);
    this.emit();
    this.scheduleAi();
    return this;
  }

  stop() {
    this.disposed = true;
    if (this.ticker) clearInterval(this.ticker);
    if (this.aiTimer) clearTimeout(this.aiTimer);
    this.ticker = null;
    this.aiTimer = null;
  }

  get view() {
    return playerView(this.state, this.myColor);
  }

  emit() {
    this.onChange(this.state);
  }

  isExpired(color, now = Date.now()) {
    if (this.state.untimed) return false;
    const clock = clockOf(this.state, color, now);
    return clock.running && clock.reserve <= 0 && clock.free <= 0;
  }

  /**
   * Same rule as the relay: an expiry is an automatic pass, except while in
   * check, where a player cannot pass and therefore loses.
   */
  settleExpired(now = Date.now()) {
    if (this.state.result) return false;
    let changed = false;
    for (const color of expiredColors(this.state, now)) {
      if (this.state.result) break;
      if (!actorsOf(this.state).includes(color)) continue;
      if (this.state.pending[color]) continue; // a locked decision pauses the clock
      const res = applyTimeout(this.state, color, now);
      if (res.error) continue;
      this.state = res.state;
      changed = true;
    }
    if (changed) {
      if (this.state.result) this.cancelAi();
      this.emit();
    }
    return changed;
  }

  cancelAi() {
    if (this.aiTimer) clearTimeout(this.aiTimer);
    this.aiTimer = null;
  }

  apply(color, action) {
    const res = submitAction(this.state, color, action, Date.now());
    if (res.error) return { error: res.error };
    this.state = res.state;
    this.emit();
    this.scheduleAi();
    return {};
  }

  submit(action) {
    const actors = actorsOf(this.state);
    if (!actors.includes(this.myColor)) return { error: 'It is not your turn to decide.' };
    if (this.timed && this.isExpired(this.myColor)) {
      this.settleExpired();
      return { error: 'Your clock ran out — the turn was skipped.' };
    }
    return this.apply(this.myColor, action);
  }

  retract() {
    if (this.state.phase === 'solo') return { error: 'That turn is already resolved.' };
    this.state = retractAction(this.state, this.myColor);
    this.emit();
    return {};
  }

  resign() {
    this.state = {
      ...this.state,
      result: { type: 'win', winner: this.aiColor, reason: 'You resigned.' },
      phase: 'over',
    };
    this.cancelAi();
    this.emit();
  }

  tick() {
    if (this.disposed || this.state.result) return;
    if (this.timed) this.settleExpired();
    this.scheduleAi();
  }

  scheduleAi() {
    if (this.disposed || this.aiTimer || this.state.result) return;
    const actors = actorsOf(this.state);
    if (!actors.includes(this.aiColor)) return;
    if (this.state.pending[this.aiColor]) return;

    const delay = 650 + Math.random() * 1100;
    this.aiTimer = setTimeout(() => {
      this.aiTimer = null;
      if (this.disposed || this.state.result) return;
      if (this.timed) this.settleExpired();
      if (this.state.result) return;
      if (!actorsOf(this.state).includes(this.aiColor)) return;
      if (this.state.pending[this.aiColor]) return;
      const action = chooseAiAction(this.state, this.aiColor, this.level);
      this.apply(this.aiColor, action);
    }, delay);
  }
}
