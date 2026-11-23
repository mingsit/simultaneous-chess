'use client';

import { useEffect, useMemo, useState } from 'react';
import Board from './Board';
import PlayerPanel from './PlayerPanel';
import RoundLog from './RoundLog';
import PromotionPicker from './PromotionPicker';
import BackAttackPicker from './BackAttackPicker';
import ResultOverlay from './ResultOverlay';
import { legalMoves, promoOptions, inCheck, onEnemyBackRanks, OVEREXTEND_ROUNDS, sqName, WHITE, BLACK } from '../shared/engine.mjs';
import { checkSquares, statusFor, sideLabel } from '../lib/ui';

export default function GameScreen({
  view,
  myColor,
  myName,
  opponentName,
  opponentConnected = true,
  mode = 'single',
  difficulty = null,
  pin = null,
  now,
  onSubmit,
  onRetract,
  onResign,
  onLeave,
  onRematch,
  isLocal = false,
  conn = 'open',
  notice = null,
}) {
  const [selected, setSelected] = useState(null);
  const [promoPick, setPromoPick] = useState(null);
  const [lastRankWarn, setLastRankWarn] = useState(null);
  const [overextendWarn, setOverextendWarn] = useState(null);
  const [hookPick, setHookPick] = useState(null);
  const [error, setError] = useState(null);
  const [confirmResign, setConfirmResign] = useState(false);

  const other = myColor === WHITE ? BLACK : WHITE;
  const myTurn = view ? (view.phase === 'solo' ? view.active === myColor : view.phase === 'simultaneous') : false;
  const locked = !!view?.locked;
  const canAct = !!view && !view.result && myTurn && !locked;

  const moves = useMemo(
    () => (canAct ? legalMoves(view.board, myColor) : []),
    [canAct, view?.board, myColor]
  );

  const targets = useMemo(() => {
    if (selected == null) return new Set();
    const set = new Set();
    for (const m of moves) if (m.from === selected) set.add(m.to);
    return set;
  }, [moves, selected]);

  const backTargets = useMemo(() => {
    if (selected == null) return new Set();
    const set = new Set();
    for (const m of moves) if (m.from === selected && m.back != null) set.add(m.to);
    return set;
  }, [moves, selected]);

  const checks = useMemo(() => (view ? checkSquares(view.board) : []), [view?.board]);
  const pinnedMine = useMemo(
    () =>
      view
        ? view.board
            .map((p, i) => (p && p.c === myColor && p.overextended ? sqName(i) : null))
            .filter(Boolean)
        : [],
    [view?.board, myColor]
  );
  const lastRound = view?.log?.length ? view.log[view.log.length - 1] : null;
  const status = statusFor(view, myColor);

  useEffect(() => {
    setSelected(null);
    setPromoPick(null);
    setLastRankWarn(null);
    setOverextendWarn(null);
    setHookPick(null);
    setConfirmResign(false);
  }, [view?.round, locked]);

  useEffect(() => {
    if (error) setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view?.round]);

  function report(res) {
    if (res && res.error) setError(res.error);
  }

  function submitMove(m) {
    report(onSubmit({ k: 'move', from: m.from, to: m.to, ...(m.back != null ? { back: m.back } : {}) }));
    setSelected(null);
  }

  /** Would this move leave the piece stuck on the opponent's last two ranks? */
  function overextensionRisk(m) {
    if (!view || view.round > OVEREXTEND_ROUNDS) return false;
    const piece = view.board[m.from];
    if (!piece || piece.t === 'p' || piece.t === 'k') return false;
    // Only a capture can overextend; a quiet move onto those ranks is safe.
    const target = view.board[m.to];
    const captures = m.back != null || (target && target.c !== piece.c);
    if (!captures) return false;
    // A hook lands where the pawn ends up; its square is the best estimate.
    return onEnemyBackRanks(piece.c, m.back != null ? m.back : m.to);
  }

  function commitMove(m) {
    if (m.promo) {
      const opts = promoOptions(view, myColor);
      if (opts.length > 1) {
        setPromoPick({ from: m.from, to: m.to, opts });
        return;
      }
      if (!opts.length) {
        // Nothing to promote to: the pawn would arrive on the last rank and
        // stay a pawn. Ask before committing such a move.
        setLastRankWarn({ from: m.from, to: m.to });
        return;
      }
      report(onSubmit({ k: 'move', from: m.from, to: m.to, promo: opts[0] }));
      setSelected(null);
      return;
    }
    if (overextensionRisk(m)) {
      setOverextendWarn({ move: m });
      return;
    }
    submitMove(m);
  }

  function attemptMove(from, to) {
    const candidates = moves.filter((x) => x.from === from && x.to === to);
    if (!candidates.length) return;
    const plain = candidates.find((x) => x.back == null);
    const hook = candidates.find((x) => x.back != null);
    // A hook and a strict capture share the pawn's square, so the player picks.
    if (plain && hook) {
      setHookPick({ from, to, plain, hook });
      return;
    }
    commitMove(hook || plain);
  }

  function handleSquare(i) {
    if (!canAct) return;
    const piece = view.board[i];
    if (selected != null) {
      if (i === selected) {
        setSelected(null);
        return;
      }
      if (targets.has(i)) {
        attemptMove(selected, i);
        return;
      }
    }
    if (piece && piece.c === myColor) {
      setSelected(i);
      return;
    }
    setSelected(null);
  }

  const myStaged = locked && view.promo && view.promo.k === 'move' ? view.promo : null;
  const stagedFrom = selected != null ? selected : myStaged?.from;
  const stagedTo = selected != null ? null : myStaged?.to;
  const stagedBack = myStaged?.back ?? null;

  const modeLabel =
    mode === 'single'
      ? `Single player${difficulty ? ` · ${difficulty === 'hard' ? 'Hard' : 'Easy'}` : ''}`
      : mode === 'private'
        ? `Private room ${pin || ''}`
        : 'Ranked match';

  return (
    <div className="gameScreen">
      <header className="topBar">
        <button type="button" className="ghostBtn small" onClick={onLeave}>
          ← Leave
        </button>
        <div className="topCenter">
          <span className="wordmarkSmall">Simultaneous Chess</span>
          <span className="roundPill">Round {view?.round ?? 1}</span>
        </div>
        <div className="topRight">
          <span className="modePill">{modeLabel}</span>
          <span className={`connDot ${conn}`} title={conn === 'open' ? 'Connected' : 'Reconnecting'} />
        </div>
      </header>

      <main className="gameMain">
        <section className="boardColumn">
          <div className={`mobileStatus tone-${status.tone || 'calm'}`}>
            <div className="mobileStatusHead">
              <strong>{status.title}</strong>
              {!view?.result && (
                <span className="pips">
                  <span className={`pip ${locked ? 'done' : ''}`}>you</span>
                  <span className={`pip ${locked ? 'waiting' : ''}`}>opp</span>
                </span>
              )}
            </div>
            <span className="mobileStatusDetail">{status.detail}</span>
            {notice && <span className="mobileStatusDetail notice">{notice}</span>}
          </div>

          <PlayerPanel
            name={opponentName || sideLabel(other)}
            color={other}
            view={view}
            now={now}
            isMe={false}
            thinking={!view?.result && (view?.phase === 'solo' ? view.active !== myColor : !locked)}
            thinkingLabel="deciding…"
            connected={opponentConnected}
          />

          <div className="boardArea">
            <Board
              board={view.board}
              myColor={myColor}
              selected={selected}
              targets={targets}
              backTargets={backTargets}
              staged={stagedFrom != null ? { from: stagedFrom, to: stagedTo } : null}
              stagedBack={stagedBack}
              lastRound={lastRound}
              checkSqs={checks}
              disabled={!canAct}
              onSquareClick={handleSquare}
              onDropMove={(from, to) => {
                if (!canAct) return;
                attemptMove(from, to);
              }}
            />
          </div>

          <PlayerPanel
            name={myName || 'You'}
            color={myColor}
            view={view}
            now={now}
            isMe
            thinking={!view?.result && canAct}
            thinkingLabel="your move"
          />
        </section>

        <aside className="sideColumn">
          <div className={`statusCard tone-${status.tone || 'calm'}`}>
            <div className="statusTop">
              <span className="statusTitle">{status.title}</span>
              {!view?.result && (
                <span className="pips">
                  <span className={`pip ${locked ? 'done' : ''}`} title="your decision">
                    you
                  </span>
                  <span className={`pip ${locked ? 'waiting' : ''}`} title="opponent decision">
                    opp
                  </span>
                </span>
              )}
            </div>
            <p className="statusDetail">{status.detail}</p>
            {pinnedMine.length > 0 && !view?.result && (
              <p className="statusNotice">
                Overextended: {pinnedMine.join(', ')} cannot move this round (it still attacks).
              </p>
            )}
            {notice && <p className="statusNotice">{notice}</p>}
          </div>

          {!view?.result && (
            <div className="actionsCard">
              {locked ? (
                <div className="stack">
                  <div className="lockedRow">
                    <span className="pulseDot" />
                    <span>Move locked in — waiting for your opponent.</span>
                  </div>
                  {view.phase !== 'solo' && (
                    <button
                      type="button"
                      className="ghostBtn wide"
                      onClick={() => report(onRetract && onRetract())}
                    >
                      Retract move
                    </button>
                  )}
                </div>
              ) : canAct ? (
                <div className="stack">
                  <p className="actionHint">
                    Drag a piece to its square, or select it and tap a highlighted square. Your move stays
                    hidden until both sides commit.
                  </p>
                  <div className="row">
                    <button
                      type="button"
                      className="ghostBtn"
                      disabled={inCheck(view.board, myColor)}
                      onClick={() => report(onSubmit({ k: 'pass' }))}
                      title={inCheck(view.board, myColor) ? 'You cannot pass while in check' : 'Skip this turn'}
                    >
                      Pass turn
                    </button>
                    {confirmResign ? (
                      <button type="button" className="dangerBtn" onClick={onResign}>
                        Confirm resign
                      </button>
                    ) : (
                      <button type="button" className="ghostBtn subtle" onClick={() => setConfirmResign(true)}>
                        Resign
                      </button>
                    )}
                  </div>
                  {error && <p className="errorText">{error}</p>}
                </div>
              ) : (
                <div className="waitRow">
                  <span className="pulseDot amber" />
                  <span>Waiting for your opponent to decide…</span>
                </div>
              )}
            </div>
          )}

          <div className="logCard">
            <div className="cardHead">
              <h2>Rounds</h2>
              <span className="muted small">{view?.log?.length || 0} played</span>
            </div>
            <RoundLog log={view?.log} myColor={myColor} />
          </div>

          <div className="legend">
            <span><i className="sw last-w" /> white&apos;s last move</span>
            <span><i className="sw last-b" /> black&apos;s last move</span>
            <span><i className="sw last-clash" /> clash</span>
          </div>
        </aside>
      </main>

      {hookPick && (
        <BackAttackPicker
          to={hookPick.to}
          onPick={(useHook) => {
            const move = useHook ? hookPick.hook : hookPick.plain;
            setHookPick(null);
            commitMove(move);
          }}
          onCancel={() => setHookPick(null)}
        />
      )}

      {promoPick && (
        <PromotionPicker
          options={promoPick.opts}
          color={myColor}
          onPick={(t) => {
            report(onSubmit({ k: 'move', from: promoPick.from, to: promoPick.to, promo: t }));
            setPromoPick(null);
            setSelected(null);
          }}
          onCancel={() => setPromoPick(null)}
        />
      )}

      {lastRankWarn && (
        <div className="modalBackdrop" role="dialog" aria-modal="true">
          <div className="modal">
            <h3>No piece to promote to</h3>
            <p className="muted">
              You have no lost piece to revive, so this pawn will reach the last rank and stay a
              pawn. Do you still want to advance it?
            </p>
            <div className="modalActions">
              <button
                type="button"
                className="ghostBtn"
                onClick={() => setLastRankWarn(null)}
                autoFocus
              >
                Cancel
              </button>
              <button
                type="button"
                className="primaryBtn"
                onClick={() => {
                  const { from, to } = lastRankWarn;
                  report(onSubmit({ k: 'move', from, to }));
                  setLastRankWarn(null);
                  setSelected(null);
                }}
              >
                Advance anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {overextendWarn && (
        <div className="modalBackdrop" role="dialog" aria-modal="true" aria-labelledby="oextTitle">
          <div className="modal">
            <h3 id="oextTitle">Overextension warning</h3>
            <p className="muted">
              This capture may leave your piece on the opponent&apos;s last two ranks. If it lands
              there it is overextended: it cannot move on the next round. It still attacks and gives
              check, but it cannot escape. Capture anyway?
            </p>
            <div className="modalActions">
              <button
                type="button"
                className="ghostBtn"
                onClick={() => setOverextendWarn(null)}
                autoFocus
              >
                Cancel
              </button>
              <button
                type="button"
                className="primaryBtn"
                onClick={() => {
                  submitMove(overextendWarn.move);
                  setOverextendWarn(null);
                }}
              >
                Capture anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {view?.result && (
        <ResultOverlay
          result={view.result}
          myColor={myColor}
          mode={mode}
          onLeave={onLeave}
          onRematch={onRematch}
        />
      )}
    </div>
  );
}
