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
  onThanks: (code: string, name: string) => void;
  onEnterRetro: (code: string) => void;
}

export default function Room({ code, onLeave, onMissingIdentity, onThanks, onEnterRetro }: Props) {
  const identity = getIdentity(code);
  const participantId = identity?.participantId ?? '';
  const myName = identity?.name ?? '';

  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState('');
  const [myVote, setMyVote] = useState<string | null>(null);
  // Ticket key = ENG<part1>-<part2>; ENG and the dash are fixed, both parts editable.
  const [ticketP1, setTicketP1] = useState('1');
  const [ticketP2, setTicketP2] = useState('0000');
  const [copied, setCopied] = useState(false);
  const [retroBusy, setRetroBusy] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [endedView, setEndedView] = useState(false); // room ended → show Sprint Results with an Exit button
  const missCount = useRef(0);
  const endedRef = useRef(false); // true once ended → stop polling from bouncing off the results view
  const autoJoinedRetro = useRef(false); // ensure members are pulled into the retro only once
  const prevParticipants = useRef<{ id: string; name: string }[] | null>(null);

  // No identity for this room (e.g. opened an invite link directly) → bounce to join.
  useEffect(() => {
    if (!participantId) onMissingIdentity();
  }, [participantId, onMissingIdentity]);

  const isModerator = session?.moderatorId === participantId;

  const refresh = useCallback(async () => {
    if (!participantId || endedRef.current) return;
    try {
      const { session: s } = await api.getSession(code, participantId);
      missCount.current = 0; // successful poll resets the miss streak
      // Removed by the moderator (kicked) → the room still exists but we're no
      // longer in it. Leave gracefully.
      const me = s.participants.find((p) => p.id === participantId);
      if (!me) {
        clearIdentity(code);
        onThanks(code, myName); // removed by the moderator → thank them (room still open)
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
          onThanks(code, myName); // room gone / moderator ended it → thank the member
        }
        return;
      }
      setError(msg);
    }
  }, [code, participantId, myName, onThanks]);

  // The moderator ending the room pushes an explicit "ended" event → members are
  // evicted to the thank-you page at once; any other push is a "changed" ping.
  const onRealtime = useCallback(
    (data: unknown) => {
      const d = data as { t?: string } | undefined;
      if (d?.t === 'ended') {
        clearIdentity(code);
        if (!isModerator) onThanks(code, myName); // moderator's own endRoom() navigates them
        return;
      }
      refresh();
    },
    [refresh, isModerator, code, myName, onThanks],
  );

  const { connected: rtConnected } = useRealtime(`room:${code}`, onRealtime);

  useEffect(() => {
    refresh();
    if (rtConnected) return; // real-time is live — pure push, no polling
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [refresh, rtConnected]);

  // When the moderator starts the retro, pull every member straight into the
  // board instead of waiting for them to click "Join Retrospective". Guarded by a
  // per-retro flag so a member who later leaves the board isn't yanked back in
  // (the "Join Retrospective" button stays as a manual way back).
  useEffect(() => {
    const rc = session?.retroCode;
    if (isModerator || !rc || autoJoinedRetro.current) return;
    const key = `pp.autoRetro:${rc}`;
    if (localStorage.getItem(key)) return;
    autoJoinedRetro.current = true;
    localStorage.setItem(key, '1');
    joinRetro();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isModerator, session?.retroCode]);

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

  // Compose the ticket key from the two editable parts, defaulting part2 to 0000.
  const ticketLabel = () => `ENG${ticketP1.trim()}-${ticketP2.trim() || '0000'}`;
  function resetTicket() {
    setTicketP1('1');
    setTicketP2('0000');
  }

  async function startVoting() {
    await moderatorAction(() => api.start(code, participantId, ticketLabel()));
    resetTicket();
  }
  async function nextTicket() {
    await moderatorAction(() => api.next(code, participantId, ticketLabel()));
    resetTicket();
  }

  // Finish planning, then pop the Sprint Results shortly after so the moderator
  // can review and export the ticket-wise estimates.
  async function finishPlanning() {
    await moderatorAction(() => api.finish(code, participantId));
    window.setTimeout(() => setShowResults(true), 1000);
  }

  function kickMember(targetId: string, targetName: string) {
    if (!window.confirm(`Remove ${targetName} from the room?`)) return;
    moderatorAction(() => api.kick(code, participantId, targetId));
  }

  function leave() {
    api.leaveRoom(code, participantId).catch(() => {}); // best-effort; leave locally regardless
    clearIdentity(code);
    onThanks(code, myName); // members get a thank-you page (with a Rejoin option), not home
  }

  async function endRoom() {
    if (!session) return;
    if (
      !window.confirm(
        'End this room for everyone? You can review and export the Sprint Results before exiting.',
      )
    )
      return;
    endedRef.current = true; // stop polling so the results view isn't bounced away
    try {
      await api.end(code, participantId);
    } catch {
      /* even if it fails, still show the local results snapshot */
    }
    clearIdentity(code);
    setEndedView(true); // open Sprint Results with an Exit room button; leave on exit
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

  // Enter in the ticket input opens the round: Start voting from waiting (needs a
  // member) or once finished; Next ticket from a revealed round mid-planning.
  const submitTicket = () => {
    if (session.status === 'waiting') {
      if (voters.length > 0) startVoting();
    } else if (session.status === 'revealed') {
      if (session.finished) startVoting();
      else nextTicket();
    }
  };
  const ticketKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submitTicket();
    }
  };

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
            <button className="ghost" onClick={copyInvite}>
              {copied ? 'Copied!' : 'Invite'}
            </button>
          )}
          {/* Retro is always available — it can be run without any planning estimates. */}
          {isModerator &&
            (session.retroCode ? (
              <button className="ghost" title="Open the retrospective board" onClick={startRetro}>
                Open Retrospective
              </button>
            ) : (
              <button
                className="ghost"
                disabled={retroBusy}
                title="Start a Sprint Retrospective"
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
          Estimating on ticket <strong>{session.story}</strong>
          {isModerator && (
            <button
              className="story-close"
              title="Close voting"
              onClick={() => moderatorAction(() => api.closeVoting(code, participantId))}
            >
              ×
            </button>
          )}
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
              <div className="ticket-input">
                <span className="ticket-prefix">ENG</span>
                <input
                  className="ticket-seg ticket-seg-1"
                  style={{ width: `${Math.max(ticketP1.length, 1)}ch` }}
                  value={ticketP1}
                  onChange={(e) => setTicketP1(e.target.value.replace(/[^A-Za-z0-9]/g, ''))}
                  onKeyDown={ticketKeyDown}
                  placeholder="1"
                  maxLength={3}
                />
                <span className="ticket-dash">-</span>
                <input
                  className="ticket-seg ticket-seg-2"
                  value={ticketP2}
                  onChange={(e) => setTicketP2(e.target.value.replace(/[^A-Za-z0-9]/g, ''))}
                  onKeyDown={ticketKeyDown}
                  placeholder="0000"
                  maxLength={10}
                />
              </div>
            )}
            <div className="panel-buttons">
              {session.status === 'waiting' && (
                <button
                  className="primary"
                  disabled={voters.length === 0}
                  title={
                    voters.length === 0
                      ? 'Wait for at least one member to join before starting voting'
                      : 'Start voting'
                  }
                  onClick={startVoting}
                >
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
              {session.status === 'revealed' &&
                (session.finished ? (
                  // After Finish, the moderator can only open a fresh voting round —
                  // no Next ticket / Vote again.
                  <button className="primary" onClick={startVoting}>
                    Start voting
                  </button>
                ) : (
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
                    <button className="ghost" onClick={finishPlanning}>
                      Finish
                    </button>
                  </>
                ))}
            </div>
          </div>
        </>
      )}

      {!isModerator && session.status === 'waiting' && (
        <p className="wait-msg">Waiting for the moderator to start voting…</p>
      )}

      {/* The deck — members vote; the moderator only facilitates. Shown only while a
          round is open (after the moderator clicks Start voting / Next ticket);
          hidden during waiting / revealed. */}
      {!isModerator && session.status === 'voting' && (
        <section className="deck">
          {session.deck.map((card) => (
            <button
              key={card}
              className={`poker-card ${myVote === card ? 'selected' : ''}`}
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

      {(showResults || endedView) && (
        <ResultsModal
          sessionName={session.name}
          history={session.history}
          onClose={() => (endedView ? onLeave() : setShowResults(false))}
          onExit={endedView ? onLeave : undefined}
        />
      )}
    </div>
  );
}
