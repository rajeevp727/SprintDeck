import { useState } from 'react';
import { retroApi } from '../retroApi';
import { saveIdentity } from '../storage';
import AdBanner from './AdBanner';

interface Props {
  joinCode: string;
  onEnter: (code: string) => void;
  onExit: () => void;
  onPrivacy: () => void;
}

// Retro boards are created by a room's moderator from inside the poker room and
// shared via their /retro/CODE link. This screen is the join step for teammates
// opening that link — name + join, no create flow.
export default function RetroHome({ joinCode, onEnter, onExit, onPrivacy }: Props) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError('Enter your name');
    setBusy(true);
    setError('');
    try {
      const res = await retroApi.joinBoard(joinCode, name);
      saveIdentity(res.board.code, res.participantId, name.trim());
      onEnter(res.board.code);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
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
