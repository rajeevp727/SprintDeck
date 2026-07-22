import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { retroApi } from '../retroApi';
import { clearIdentity, getIdentity, saveIdentity } from '../storage';
import type { Session } from '../types';
import ResultsModal from './ResultsModal';
import AdBanner from './AdBanner';
import { notifyPresence } from '../presence';
import { useRealtime } from '../realtime';

const POLL_MS = 200; // polling fallback, used only while real-time isn't connected (e.g. free-tier connection cap / outage)
// Only leave the room after this many CONSECUTIVE "not found" polls — tolerates
// transient misses (tab loses focus & throttles, cold start, instance split) so
// you stay put until you leave or the moderator actually ends the room.
const MAX_MISSES = 6;

interface Props {
  code: string;
  onLeave: () => void;
  onMissingIdentity: () => void;
  onEnterRetro: (code: string) => void;
}

export default function Room({ code, onLeave, onMissingIdentity, onEnterRetro }: Props) {
  const identity = getIdentity(code);
  const participantId = identity?.participantId ?? '';

  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState('');
  const [myVote, setMyVote] = useState<string | null>(null);
  const [ticket, setTicket] = useState('');
  const [copied, setCopied] = useState(false);
  const [retroBusy, setRetroBusy] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const missCount = useRef(0);
  const prevParticipants = useRef<{ id: string; name: string }[] | null>(null);

  // No identity for this room (e.g. opened an invite link directly) → bounce to join.
  useEffect(() => {
    if (!participantId) onMissingIdentity();
  }, [participantId, onMissingIdentity]);

  const isModerator = session?.moderatorId === participantId;

  const refresh = useCallback(async () => {
    if (!participantId) return;
    try {
      const { session: s } = await api.getSession(code, participantId);
      missCount.current = 0; // successful poll resets the miss streak
      // Removed by the moderator (kicked) → the room still exists but we're no
      // longer in it. Leave gracefully.
      const me = s.participants.find((p) => p.id === participantId);
      if (!me) {
        clearIdentity(code);
        onMissingIdentity();
        return;
      }
      notifyPresence(s.participants, s.moderatorId === participantId, participantId, prevParticipants, 'room');
      setSession(s);
      setError('');
      setMyVote(me.vote); // keep my selected card in sync with the server
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes('not found')) {
        // Tolerate transient misses; only exit after a sustained run of them
        // (room truly gone / moderator ended it).
        missCount.current += 1;
        if (missCount.current >= MAX_MISSES) {
          clearIdentity(code);
          onMissingIdentity();
        }
        return;
      }
      setError(msg);
    }
  }, [code, participantId, onMissingIdentity]);

  const { connected: rtConnected } = useRealtime(`room:${code}`, refresh);

  useEffect(() => {
    refresh();
    if (rtConnected) return; // real-time is live — pure push, no polling
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [refresh, rtConnected]);

  // Remind the moderator to review results before they close/refresh/navigate away.
  // (Browsers show their own generic confirm text, but this guarantees the prompt.)
  useEffect(() => {
    if (!isModerator) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = 'Please check the sprint planning results';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isModerator]);

  async function castVote(card: string) {
    if (!session || session.status !== 'voting') return;
    const next = myVote === card ? null : card; // click again to clear
    setMyVote(next); // optimistic
    try {
      const { session: s } = await api.vote(code, participantId, next);
      setSession(s);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function moderatorAction(fn: () => Promise<{ session: Session }>) {
    try {
      const { session: s } = await fn();
      setSession(s);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  // Moderator names the ticket, then opens the round so the team knows what
  // they're voting on; the ticket is saved into the results on reveal.
  async function startVoting() {
    await moderatorAction(() => api.start(code, participantId, ticket.trim()));
    setTicket('');
  }
  async function nextTicket() {
    await moderatorAction(() => api.next(code, participantId, ticket.trim()));
    setTicket('');
  }

  function kickMember(targetId: string, targetName: string) {
    if (!window.confirm(`Remove ${targetName} from the room?`)) return;
    moderatorAction(() => api.kick(code, participantId, targetId));
  }

  function leave() {
    api.leaveRoom(code, participantId).catch(() => {}); // best-effort; leave locally regardless
    clearIdentity(code);
    onLeave();
  }

  async function endRoom() {
    window.alert('Please check the sprint planning results');
    if (!window.confirm('End this room for everyone? This cannot be undone.')) return;
    try {
      await api.end(code, participantId);
    } catch {
      /* even if it fails, leave locally */
    }
    clearIdentity(code);
    onLeave();
  }

  // Moderator-only: open the room's retrospective. If one already exists (its
  // code is broadcast on the session) just go to it; otherwise create the board,
  // record its code on the session so every member gets a "Join Retrospective"
  // button, and jump in. The board has its own /retro/CODE URL.
  async function startRetro() {
    if (session?.retroCode) {
      onEnterRetro(session.retroCode);
      return;
    }
    setRetroBusy(true);
    try {
      const myName = getIdentity(code)?.name ?? 'Facilitator';
      const res = await retroApi.createBoard(`${session?.name ?? 'Sprint'} — Retro`, myName, '', code);
      saveIdentity(res.board.code, res.participantId, myName);
      await api.setRetro(code, participantId, res.board.code);
      onEnterRetro(res.board.code);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRetroBusy(false);
    }
  }

  // Member-only: join the room's retrospective seamlessly — reuse the name from
  // this poker room (no re-login) and go straight to the board.
  async function joinRetro() {
    if (!session?.retroCode) return;
    if (getIdentity(session.retroCode)) {
      onEnterRetro(session.retroCode); // already joined — straight in
      return;
    }
    setRetroBusy(true);
    try {
      const myName = getIdentity(code)?.name ?? 'Guest';
      const res = await retroApi.joinBoard(session.retroCode, myName);
      saveIdentity(res.board.code, res.participantId, myName);
      onEnterRetro(res.board.code);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRetroBusy(false);
    }
  }

  async function copyInvite() {
    // Invite link carries the code as a query param; the app reads it on open
    // and strips it from the URL, so the code isn't left in the address bar.
    const url = `${location.origin}/?room=${code}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt('Invite link:', url);
    }
  }

  if (!participantId) return null;
  if (!session) {
    return (
      <div className="room-loading">
        {error ? <p className="error">{error}</p> : <p>Loading room…</p>}
      </div>
    );
  }

  // The moderator facilitates and does not vote — count only non-moderators.
  const voters = session.participants.filter((p) => p.id !== session.moderatorId);
  const voted = voters.filter((p) => p.hasVoted).length;
  const total = voters.length;
  const moderator = session.participants.find((p) => p.isModerator);
  // Retro can be opened before planning starts (waiting) or once it's finished —
  // just not mid-round.
  const retroEnabled = session.status === 'waiting' || session.finished;

  return (
    <div className="room">
      <header className="room-header">
        <div className="room-meta">
          <span className="room-code" title="Room code">
            {session.code}
          </span>
          <h2>{session.name}</h2>
        </div>
        <div className="room-actions">
          <span className={`status-pill ${session.status}`}>
            {session.status === 'waiting' && 'Not started'}
            {session.status === 'voting' && `Voting · ${voted}/${total}`}
            {session.status === 'revealed' && 'Revealed 🎉'}
          </span>
          {isModerator && (
            <button
              className="ghost"
              title="View results"
              onClick={() => setShowResults(true)}
            >
              Results
              {session.history.length > 0 && <span className="badge">{session.history.length}</span>}
            </button>
          )}
          {isModerator && (
            <button className="ghost" onClick={copyInvite}>
              {copied ? 'Copied!' : 'Invite'}
            </button>
          )}
          {isModerator &&
            (session.retroCode ? (
              <button className="ghost" title="Open the retrospective board" onClick={startRetro}>
                Open Retrospective
              </button>
            ) : (
              <button
                className="ghost"
                disabled={!retroEnabled || retroBusy}
                title={
                  retroEnabled
                    ? 'Start a Sprint Retrospective'
                    : 'Finish sprint planning to enable the retrospective'
                }
                onClick={startRetro}
              >
                {retroBusy ? 'Opening…' : 'Retrospective'}
              </button>
            ))}
          {!isModerator && session.retroCode && (
            <button
              className="ghost"
              title="Join the retrospective"
              disabled={retroBusy}
              onClick={joinRetro}
            >
              {retroBusy ? 'Joining…' : 'Join Retrospective'}
            </button>
          )}
          {isModerator ? (
            <button className="ghost danger" onClick={endRoom}>
              End room
            </button>
          ) : (
            <button className="ghost danger" onClick={leave}>
              Leave
            </button>
          )}
        </div>
      </header>

      {session.status !== 'waiting' && session.story && (
        <div className="story-banner">
          Voting on <strong>{session.story}</strong>
        </div>
      )}

      <section className="participants">
        {moderator && (
          <div className="seat">
            <div className="seat-name">
              <span className="crown" title="Moderator">★</span>
              {moderator.name}
              {moderator.id === participantId ? (
                <span className="you"> (you)</span>
              ) : (
                <span className="you"> (Moderator)</span>
              )}
            </div>
            <div className="seat-card facilitator" title="Facilitator — doesn't vote">
              <span className="seat-host">★</span>
            </div>
          </div>
        )}
        {voters.map((p) => {
          const showFace = session.status !== 'revealed';
          return (
            <div key={p.id} className={`seat ${p.hasVoted ? 'voted' : ''}`}>
              <div className="seat-name">
                {p.isModerator && <span className="crown" title="Moderator">★</span>}
                {p.name}
                {p.id === participantId && <span className="you"> (you)</span>}
              </div>
              <div className={`seat-card ${p.hasVoted ? 'flipped' : ''}`}>
                {isModerator && p.id !== session.moderatorId && (
                  <button
                    className="seat-kick"
                    title={`Remove ${p.name}`}
                    onClick={() => kickMember(p.id, p.name)}
                  >
                    ×
                  </button>
                )}
                {session.status === 'revealed' ? (
                  <span className="seat-value">{p.vote ?? '–'}</span>
                ) : p.hasVoted ? (
                  <span className="seat-back">✓</span>
                ) : (
                  <span className="seat-thinking">{showFace ? '🤔' : ''}</span>
                )}
              </div>
            </div>
          );
        })}
      </section>

      {/* Section-level ad */}
      <AdBanner className="ad-section" />


      {/* Moderator controls */}
      {isModerator && (
        <>
          <div className="panel">
            {(session.status === 'waiting' || session.status === 'revealed') && (
              <input
                className="ticket-input"
                value={ticket}
                onChange={(e) => setTicket(e.target.value)}
                placeholder="Ticket name / number (e.g. ENG-1234)"
                maxLength={80}
              />
            )}
            <div className="panel-buttons">
              {session.status === 'waiting' && (
                <button className="primary" onClick={startVoting}>
                  Start voting
                </button>
              )}
              {session.status === 'voting' && (
                <>
                  <button
                    className="primary"
                    onClick={() => moderatorAction(() => api.reveal(code, participantId))}
                  >
                    Reveal cards
                  </button>
                  <button
                    className="ghost"
                    onClick={() => moderatorAction(() => api.reset(code, participantId))}
                  >
                    Clear votes
                  </button>
                </>
              )}
              {session.status === 'revealed' && (
                <>
                  <button className="primary" onClick={nextTicket}>
                    Next ticket
                  </button>
                  <button
                    className="ghost"
                    onClick={() => moderatorAction(() => api.reset(code, participantId))}
                  >
                    Vote again
                  </button>
                  <button
                    className="ghost"
                    onClick={() => moderatorAction(() => api.finish(code, participantId))}
                  >
                    Finish
                  </button>
                </>
              )}
            </div>
          </div>
        </>
      )}

      {!isModerator && session.status === 'waiting' && (
        <p className="wait-msg">Waiting for the moderator to start voting…</p>
      )}

      {/* The deck — members vote; the moderator only facilitates */}
      {!isModerator && (
        <section className={`deck ${session.status === 'voting' ? '' : 'disabled'}`}>
          {session.deck.map((card) => (
            <button
              key={card}
              className={`poker-card ${myVote === card ? 'selected' : ''}`}
              disabled={session.status !== 'voting'}
              onClick={() => castVote(card)}
            >
              <span className="corner tl">{card}</span>
              <span className="face">{card}</span>
              <span className="corner br">{card}</span>
            </button>
          ))}
        </section>
      )}

      {error && <p className="error room-error">{error}</p>}

      {/* Page-level ad */}
      <AdBanner className="ad-page" />

      {showResults && (
        <ResultsModal
          sessionName={session.name}
          history={session.history}
          onClose={() => setShowResults(false)}
        />
      )}
    </div>
  );
}
