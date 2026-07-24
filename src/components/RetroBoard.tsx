import { useCallback, useEffect, useRef, useState } from 'react';
import { retroApi } from '../retroApi';
import { clearIdentity, getIdentity } from '../storage';
import type { RetroBoard as RetroBoardType, RetroColumn } from '../retroTypes';
import RetroNote from './RetroNote';
import AdBanner from './AdBanner';
import { toast } from './Toast';
import { notifyPresence } from '../presence';
import { useRealtime } from '../realtime';
import RetroResultsModal from './RetroResultsModal';

const pollMs = 200; // polling fallback, used only while real-time isn't connected (e.g. free-tier connection cap / outage)
// Only leave after this many CONSECUTIVE "not found" polls — tolerates transient
// misses (tab throttled, cold start, instance split) so you stay put until you
// leave or the facilitator actually ends the board.
const maxMisses = 6;

interface Props {
  code: string;
  onLeave: () => void;
  onMissingIdentity: () => void;
}

export default function RetroBoard({ code, onLeave, onMissingIdentity }: Props) {
  const identity = getIdentity(code);
  const participantId = identity?.participantId ?? '';

  const [board, setBoard] = useState<RetroBoardType | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [endedBoard, setEndedBoard] = useState<RetroBoardType | null>(null); // snapshot shown to the facilitator after ending
  const [typingNames, setTypingNames] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<'welcome' | 'thanks' | null>(null); // transient 3s popup
  const missCount = useRef(0);
  const endedRef = useRef(false); // true once we've ended → stop polling from bouncing off the results view
  const leavingRef = useRef(false); // true once a member is on their way out (thanks popup showing)
  const welcomedRef = useRef(false); // show the welcome popup only once
  const prevParticipants = useRef<{ id: string; name: string }[] | null>(null);
  const typingTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // No identity for this board (e.g. opened an invite link directly) → bounce to join.
  useEffect(() => {
    if (!participantId) onMissingIdentity();
  }, [participantId, onMissingIdentity]);

  // A member pushed out of the board (retro ended) — show a 2s thank-you popup,
  // then leave.
  const farewellAndLeave = useCallback(() => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    setNotice('thanks');
    window.setTimeout(() => {
      clearIdentity(code);
      onMissingIdentity();
    }, 2000);
  }, [code, onMissingIdentity]);

  const refresh = useCallback(async () => {
    if (!participantId || endedRef.current || leavingRef.current) return;
    try {
      const { board: b } = await retroApi.getBoard(code, participantId);
      missCount.current = 0;
      if (!b.participants.some((p) => p.id === participantId)) {
        clearIdentity(code);
        onMissingIdentity();
        return;
      }
      notifyPresence(b.participants, b.facilitatorId === participantId, participantId, prevParticipants, 'retrospective');
      setBoard(b);
      setError('');
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.toLowerCase().includes('not found')) {
        missCount.current += 1;
        if (missCount.current >= maxMisses) farewellAndLeave();
        return;
      }
      setError(msg);
    }
  }, [code, participantId, onMissingIdentity, farewellAndLeave]);

  // Show a transient "X is typing…" that clears itself if no new signal arrives.
  const showTyping = useCallback(
    (id: string, name: string) => {
      if (!id || id === participantId) return; // never show our own typing
      setTypingNames((prev) => (prev[id] === name ? prev : { ...prev, [id]: name }));
      clearTimeout(typingTimers.current[id]);
      typingTimers.current[id] = setTimeout(() => {
        delete typingTimers.current[id];
        setTypingNames((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }, 2500);
    },
    [participantId],
  );

  const onRealtime = useCallback(
    (data: unknown) => {
      const d = data as { t?: string; id?: string; name?: string } | undefined;
      if (d?.t === 'typing') {
        showTyping(d.id ?? '', d.name ?? 'Someone');
        return;
      }
      if (d?.t === 'ended') {
        // Facilitator's own end sets endedRef (they stay on the results view);
        // every member gets the thank-you popup, then leaves.
        if (!endedRef.current) farewellAndLeave();
        return;
      }
      refresh();
    },
    [refresh, showTyping, farewellAndLeave],
  );

  const { connected: rtConnected, send } = useRealtime(`retro:${code}`, onRealtime);

  // Broadcast that we're typing (throttled by the caller).
  const notifyTyping = useCallback(() => {
    send({ t: 'typing', id: participantId, name: getIdentity(code)?.name ?? 'Someone' });
  }, [send, participantId, code]);

  useEffect(() => {
    refresh();
    if (rtConnected) return; // real-time is live — pure push, no polling
    const id = setInterval(refresh, pollMs);
    return () => clearInterval(id);
  }, [refresh, rtConnected]);

  // Greet each member with a 2s welcome popup once they land on the board (the
  // facilitator opened it, so they don't need greeting).
  useEffect(() => {
    if (!board || welcomedRef.current || board.facilitatorId === participantId) return;
    welcomedRef.current = true;
    setNotice('welcome');
    const t = window.setTimeout(() => setNotice((n) => (n === 'welcome' ? null : n)), 2000);
    return () => window.clearTimeout(t);
  }, [board, participantId]);

  // Clear any pending typing timers on unmount.
  useEffect(() => {
    const timers = typingTimers.current;
    return () => Object.values(timers).forEach(clearTimeout);
  }, []);

  async function run(fn: () => Promise<{ board: RetroBoardType }>) {
    try {
      const { board: b } = await fn();
      setBoard(b);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function leave() {
    retroApi.leave(code, participantId).catch(() => {}); // best-effort; leave locally regardless
    clearIdentity(code);
    onLeave();
  }

  async function endBoard() {
    if (!board) return;
    if (!window.confirm('End this retrospective for everyone? This cannot be undone.')) return;
    endedRef.current = true; // stop polling so the results view isn't bounced away
    try {
      await retroApi.end(code, participantId);
      toast('Retrospective ended', 'success');
    } catch {
      /* even if the call fails, still show the local snapshot */
    }
    setEndedBoard(board); // show the results modal; leave only when it's closed
  }

  async function copyInvite() {
    // Invite into the room session (the hub) — members reach the retro from there.
    const url = board?.roomCode
      ? `${location.origin}/?room=${board.roomCode}`
      : `${location.origin}/retro/${code}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt('Invite link:', url);
    }
  }

  if (!participantId) return null;
  if (!board) {
    return (
      <div className="room-loading">
        {error ? <p className="error">{error}</p> : <p>Loading board…</p>}
      </div>
    );
  }

  const isFacilitator = board.facilitatorId === participantId;
  const me = board.participants.find((p) => p.id === participantId);

  return (
    <div className="retro">
      <header className="room-header">
        <div className="room-meta">
          <span className="room-code" title="Board code">
            {board.code}
          </span>
          <h2>{board.name}</h2>
        </div>
        <div className="room-actions">
          {me && (
            <div className="profile">
              <button
                className="profile-btn"
                title="Your profile"
                style={{ background: me.color }}
                onClick={() => setShowProfile((s) => !s)}
              >
                {me.name.charAt(0).toUpperCase()}
              </button>
              {showProfile && (
                <div className="profile-menu">
                  <div className="profile-name">{me.name}</div>
                  <div className="profile-row">
                    <span className="muted">Role</span>
                    <span>{me.isFacilitator ? 'Facilitator' : 'Member'}</span>
                  </div>
                  <div className="profile-row">
                    <span className="muted">Colour</span>
                    <span className="profile-swatch" style={{ background: me.color }} />
                  </div>
                </div>
              )}
            </div>
          )}
          <span className="status-pill">{board.participants.length} in board</span>
          {isFacilitator && (
            <button className="ghost" onClick={copyInvite}>
              {copied ? 'Copied!' : 'Invite'}
            </button>
          )}
          {isFacilitator ? (
            <button className="ghost danger" onClick={endBoard}>
              End Retrospective
            </button>
          ) : (
            <button className="ghost danger" onClick={leave}>
              Leave Retrospective
            </button>
          )}
        </div>
      </header>

      {board.phase === 'review' ? (
        <ReviewPanel
          board={board}
          isFacilitator={isFacilitator}
          onToggle={(id) => run(() => retroApi.reviewToggle(code, participantId, id))}
          onOpen={() => run(() => retroApi.openBoard(code, participantId))}
        />
      ) : (
        <>
          <div className="retro-legend">
            {board.participants.map((p) => (
              <span key={p.id} className="retro-legend-item">
                <span className="retro-legend-dot" style={{ background: p.color }} />
                {p.name}
                {p.isFacilitator && <span className="crown"> ★</span>}
                {p.id === participantId && <span className="you"> (you)</span>}
              </span>
            ))}
          </div>

          {Object.keys(typingNames).length > 0 && (
            <div className="retro-typing">
              {Object.values(typingNames).join(', ')}{' '}
              {Object.keys(typingNames).length === 1 ? 'is' : 'are'} typing…
            </div>
          )}

          <section className="retro-columns">
            {board.columns.map((col) => (
              <RetroColumnView
                key={col.id}
                column={col}
                board={board}
                participantId={participantId}
                isFacilitator={isFacilitator}
                onAdd={(text) => run(() => retroApi.addNote(code, participantId, col.id, text))}
                onEdit={(id, text) => run(() => retroApi.updateNote(code, participantId, id, { text }))}
                onDelete={(id) => run(() => retroApi.deleteNote(code, participantId, id))}
                onTyping={notifyTyping}
              />
            ))}
          </section>
        </>
      )}

      {error && <p className="error room-error">{error}</p>}

      <AdBanner className="ad-page" />

      {endedBoard && (
        <RetroResultsModal
          board={endedBoard}
          onClose={() => {
            clearIdentity(code);
            onLeave();
          }}
        />
      )}

      {notice && (
        <div className="notice-overlay">
          <div className="notice-card">
            <span className="notice-mark">♠</span>
            <h3>
              {notice === 'welcome'
                ? 'Welcome to Sprint Retrospective'
                : 'Thanks for participating in the sprint retro'}
            </h3>
          </div>
        </div>
      )}
    </div>
  );
}

interface ReviewProps {
  board: RetroBoardType;
  isFacilitator: boolean;
  onToggle: (itemId: string) => void;
  onOpen: () => void;
}

// The review gate every retro opens on: the facilitator reviews last sprint's
// action items (ticking off completed ones), then opens the board.
function ReviewPanel({ board, isFacilitator, onToggle, onOpen }: ReviewProps) {
  const items = board.carryOverItems;
  return (
    <div className="retro-review">
      <h3 className="retro-review-title">Last sprint's action items</h3>
      {items.length === 0 ? (
        <p className="retro-review-empty">
          You're all caught up — no action items carried over from your last retrospective.
        </p>
      ) : (
        <ul className="retro-review-list">
          {items.map((it) => (
            <li key={it.id} className={it.done ? 'done' : ''}>
              <label>
                <input
                  type="checkbox"
                  checked={it.done}
                  disabled={!isFacilitator}
                  onChange={() => onToggle(it.id)}
                />
                <span>{it.text}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {isFacilitator ? (
        <button className="primary" onClick={onOpen}>
          Start retrospective
        </button>
      ) : (
        <p className="muted retro-review-wait">
          The facilitator is reviewing last sprint's action items…
        </p>
      )}
    </div>
  );
}

interface ColumnProps {
  column: RetroColumn;
  board: RetroBoardType;
  participantId: string;
  isFacilitator: boolean;
  onAdd: (text: string) => void;
  onEdit: (noteId: string, text: string) => void;
  onDelete: (noteId: string) => void;
  onTyping: () => void;
}

function RetroColumnView({
  column,
  board,
  participantId,
  isFacilitator,
  onAdd,
  onEdit,
  onDelete,
  onTyping,
}: ColumnProps) {
  const [draft, setDraft] = useState('');
  const lastTyping = useRef(0);
  const notes = board.notes.filter((n) => n.columnId === column.id);

  function add() {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    onAdd(text);
  }

  // Emit a typing signal at most every 1.5s while the composer changes.
  function handleChange(value: string) {
    setDraft(value);
    const now = Date.now();
    if (now - lastTyping.current > 1500) {
      lastTyping.current = now;
      onTyping();
    }
  }

  return (
    <div className="retro-col">
      <div className="retro-col-head" style={{ borderColor: column.color }}>
        <span className="retro-col-title">{column.title}</span>
        <span className="retro-col-count">{notes.length}</span>
      </div>

      {/* The facilitator is read-only — only team members add notes. */}
      {!isFacilitator && (
        <div className="retro-col-add">
          <textarea
            value={draft}
            placeholder="Add your thoughts on this…"
            rows={2}
            maxLength={500}
            onChange={(e) => handleChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                add();
              }
            }}
          />
          <button className="ghost" disabled={!draft.trim()} onClick={add}>
            Add
          </button>
        </div>
      )}

      <div className="retro-col-notes">
        {notes.map((n) => (
          <RetroNote
            key={n.id}
            note={n}
            canEdit={n.authorId === participantId}
            canDelete={n.authorId === participantId || isFacilitator}
            onEdit={(text) => onEdit(n.id, text)}
            onDelete={() => onDelete(n.id)}
          />
        ))}
      </div>
    </div>
  );
}
