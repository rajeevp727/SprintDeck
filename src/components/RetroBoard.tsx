import { useCallback, useEffect, useRef, useState } from 'react';
import { retroApi } from '../retroApi';
import { clearIdentity, getIdentity } from '../storage';
import type { RetroBoard as RetroBoardType, RetroColumn } from '../retroTypes';
import RetroNote from './RetroNote';
import AdBanner from './AdBanner';

const POLL_MS = 1500;
// Only leave after this many CONSECUTIVE "not found" polls — tolerates transient
// misses (tab throttled, cold start, instance split) so you stay put until you
// leave or the facilitator actually ends the board.
const MAX_MISSES = 6;

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
  const missCount = useRef(0);

  // No identity for this board (e.g. opened an invite link directly) → bounce to join.
  useEffect(() => {
    if (!participantId) onMissingIdentity();
  }, [participantId, onMissingIdentity]);

  const refresh = useCallback(async () => {
    if (!participantId) return;
    try {
      const { board: b } = await retroApi.getBoard(code, participantId);
      missCount.current = 0;
      if (!b.participants.some((p) => p.id === participantId)) {
        clearIdentity(code);
        onMissingIdentity();
        return;
      }
      setBoard(b);
      setError('');
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.toLowerCase().includes('not found')) {
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

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  async function run(fn: () => Promise<{ board: RetroBoardType }>) {
    try {
      const { board: b } = await fn();
      setBoard(b);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function leave() {
    clearIdentity(code);
    onLeave();
  }

  async function endBoard() {
    if (!window.confirm('End this retro for everyone? This cannot be undone.')) return;
    try {
      await retroApi.end(code, participantId);
    } catch {
      /* even if it fails, leave locally */
    }
    clearIdentity(code);
    onLeave();
  }

  async function copyInvite() {
    const url = `${location.origin}/retro/${code}`;
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
          <span className="status-pill">{board.participants.length} in board</span>
          <button className="ghost" onClick={copyInvite}>
            {copied ? 'Copied!' : 'Invite'}
          </button>
          {isFacilitator ? (
            <button className="ghost danger" onClick={endBoard}>
              End retro
            </button>
          ) : (
            <button className="ghost danger" onClick={leave}>
              Leave
            </button>
          )}
        </div>
      </header>

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
          />
        ))}
      </section>

      {error && <p className="error room-error">{error}</p>}

      <AdBanner className="ad-page" />
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
}

function RetroColumnView({
  column,
  board,
  participantId,
  isFacilitator,
  onAdd,
  onEdit,
  onDelete,
}: ColumnProps) {
  const [draft, setDraft] = useState('');
  const notes = board.notes.filter((n) => n.columnId === column.id);

  function add() {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    onAdd(text);
  }

  return (
    <div className="retro-col">
      <div className="retro-col-head" style={{ borderColor: column.color }}>
        <span className="retro-col-title">{column.title}</span>
        <span className="retro-col-count">{notes.length}</span>
      </div>

      <div className="retro-col-add">
        <textarea
          value={draft}
          placeholder={`Add to “${column.title}”…`}
          rows={2}
          maxLength={500}
          onChange={(e) => setDraft(e.target.value)}
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
