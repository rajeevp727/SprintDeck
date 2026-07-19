import { useEffect, useState } from 'react';
import { retroApi } from '../retroApi';
import { saveIdentity, getIdentity, getCurrentRoom } from '../storage';
import AdBanner from './AdBanner';

interface Props {
  joinCode: string;
  onEnter: (code: string) => void;
  onExit: () => void;
  onPrivacy: () => void;
}

// The name of the poker room this person is already in (if any) — used to join
// the retro directly, with no login step.
function knownNameFromRoom(): string {
  const room = getCurrentRoom();
  return room ? getIdentity(room)?.name ?? '' : '';
}

// Retro boards are created by a room's moderator and shared via their /retro/CODE
// link. Members already in the poker room land here and are auto-joined with
// their existing name; only outsiders with no session see the name form.
export default function RetroHome({ joinCode, onEnter, onExit, onPrivacy }: Props) {
  const knownName = knownNameFromRoom();
  const [name, setName] = useState(knownName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [autoJoining, setAutoJoining] = useState(!!knownName);

  async function join(displayName: string) {
    const res = await retroApi.joinBoard(joinCode, displayName);
    saveIdentity(res.board.code, res.participantId, displayName.trim());
    onEnter(res.board.code);
  }

  // Auto-join with the existing poker-room identity, no login required.
  useEffect(() => {
    if (!knownName) return;
    let cancelled = false;
    join(knownName).catch((err) => {
      if (cancelled) return;
      // Fall back to the manual form (e.g. board full / not found).
      setError((err as Error).message);
      setAutoJoining(false);
    });
    return () => {
      cancelled = true;
    };
  }, [joinCode, knownName]);

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError('Enter your name');
    setBusy(true);
    setError('');
    try {
      await join(name);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  if (autoJoining) {
    return (
      <div className="room-loading">
        <p>Joining the retrospective…</p>
      </div>
    );
  }

  return (
    <div className="home">
      <header className="brand">
        <span className="brand-mark">🗂️</span>
        <h1>SprintDeck Retro</h1>
      </header>
      <p className="tagline">Join the retrospective and add your notes.</p>

      <div className="card home-card">
        <form onSubmit={handleJoin} className="form">
          <label>
            Your name
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="User Name" autoFocus maxLength={40} />
          </label>
          <label>
            Board code
            <input value={joinCode} className="code-input" readOnly title="From your invite link" />
          </label>
          <button className="primary" disabled={busy} type="submit">
            {busy ? 'Joining…' : 'Join retrospective'}
          </button>
        </form>

        {error && <p className="error">{error}</p>}
      </div>

      <AdBanner />

      <footer className="home-footer">
        <a
          href="/"
          onClick={(e) => {
            e.preventDefault();
            onExit();
          }}
        >
          ← Home
        </a>
        <span className="footer-sep">·</span>
        <a
          href="/privacy"
          onClick={(e) => {
            e.preventDefault();
            onPrivacy();
          }}
        >
          Privacy &amp; About
        </a>
      </footer>
    </div>
  );
}
