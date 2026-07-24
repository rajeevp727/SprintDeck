import { useEffect, useState } from 'react';
import { api } from '../api';
import { saveIdentity } from '../storage';

interface Props {
  code: string;
  name: string;
  onEnter: (code: string) => void;
}

// Shown to a member after they leave (or are removed from) a room, instead of
// dumping them back on the landing screen. If the room is still open we offer a
// one-click "Rejoin room {name}"; if the moderator has ended it, the button is
// hidden and we just say thanks.
export default function ThanksPage({ code, name, onEnter }: Props) {
  const [roomName, setRoomName] = useState<string | null>(null); // null → room closed / unknown
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    api
      .getSession(code, '')
      .then(({ session }) => {
        if (alive) setRoomName(session.name || session.code);
      })
      .catch(() => {
        if (alive) setRoomName(null); // 404 → room ended, no rejoin
      });
    return () => {
      alive = false;
    };
  }, [code]);

  async function rejoin() {
    setBusy(true);
    setError('');
    try {
      const res = await api.joinSession(code, name);
      saveIdentity(res.session.code, res.participantId, name);
      onEnter(res.session.code);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="home">
      {roomName && (
        <div className="thanks-topbar">
          <button className="primary" disabled={busy} onClick={rejoin}>
            {busy ? 'Rejoining…' : 'Rejoin the room'}
          </button>
        </div>
      )}

      <header className="brand">
        <span className="brand-mark">♠</span>
        <h1>SprintDeck</h1>
      </header>

      <div className="card home-card thanks-card">
        <h2>Thanks for Participating!</h2>
        <p className="muted">
          {roomName
            ? 'Hope you liked the application!'
            : 'The room has ended. Hope you liked the application!'}
        </p>
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}
