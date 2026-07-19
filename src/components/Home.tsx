import { useState } from 'react';
import { api } from '../api';
import { saveIdentity } from '../storage';
import AdBanner from './AdBanner';

interface Props {
  initialCode?: string;
  onEnter: (code: string) => void;
  onPrivacy: () => void;
}

export default function Home({ initialCode = '', onEnter, onPrivacy }: Props) {
  const [mode, setMode] = useState<'create' | 'join'>(initialCode ? 'join' : 'create');
  const [name, setName] = useState('');
  const [sessionName, setSessionName] = useState('');
  const [code, setCode] = useState(initialCode.toUpperCase());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError('Enter your name');
    setBusy(true);
    setError('');
    try {
      const res = await api.createSession(sessionName, name, '');
      saveIdentity(res.session.code, res.participantId, name.trim());
      onEnter(res.session.code);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError('Enter your name');
    if (!code.trim()) return setError('Enter a room code');
    setBusy(true);
    setError('');
    try {
      const res = await api.joinSession(code.trim(), name);
      saveIdentity(res.session.code, res.participantId, name.trim());
      onEnter(res.session.code);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="home">
      <header className="brand">
        <span className="brand-mark">♠</span>
        <h1>SprintDeck</h1>
      </header>
      <p className="tagline">Estimate together, across every time zone.</p>

      <div className="card home-card">
        <div className="tabs">
          <button
            className={mode === 'create' ? 'tab active' : 'tab'}
            onClick={() => {
              setMode('create');
              setError('');
            }}
          >
            New session
          </button>
          <button
            className={mode === 'join' ? 'tab active' : 'tab'}
            onClick={() => {
              setMode('join');
              setError('');
            }}
          >
            Join session
          </button>
        </div>

        {mode === 'create' ? (
          <form onSubmit={handleCreate} className="form">
            <label>
              Your name
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="User Name" autoFocus maxLength={40} />
            </label>
            <label>
              Session name <span className="muted">(optional)</span>
              <input value={sessionName} onChange={(e) => setSessionName(e.target.value)} placeholder="Sprint {Number} Grooming" maxLength={60} />
            </label>
            <button className="primary" disabled={busy} type="submit">
              {busy ? 'Creating…' : 'Create & host'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleJoin} className="form">
            <label>
              Your name
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="UserName" autoFocus maxLength={40} />
            </label>
            <label>
              Room code
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder=""
                className="code-input"
                maxLength={24}
                readOnly={!!initialCode}
                title={initialCode ? 'From your invite link' : undefined}
              />
            </label>
            <button className="primary" disabled={busy} type="submit">
              {busy ? 'Joining…' : 'Join room'}
            </button>
          </form>
        )}

        {error && <p className="error">{error}</p>}
      </div>

      <AdBanner />

      <footer className="home-footer">
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
