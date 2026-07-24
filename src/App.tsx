import { useEffect, useState } from 'react';
import Home from './components/Home';
import Room from './components/Room';
import RetroHome from './components/RetroHome';
import RetroBoard from './components/RetroBoard';
import Privacy from './components/Privacy';
import Terms from './components/Terms';
import ThanksPage from './components/ThanksPage';
import StickyAd from './components/StickyAd';
import { ToastHost } from './components/Toast';
import { getIdentity, getCurrentRoom, setCurrentRoom, clearCurrentRoom } from './storage';

type Route =
  | { kind: 'room'; code: string }
  | { kind: 'retro'; code: string }
  | { kind: 'retroJoin'; code: string }
  | { kind: 'privacy' }
  | { kind: 'terms' }
  | { kind: 'thanks'; code: string; name: string }
  | { kind: 'home'; joinCode?: string };

// The retrospective board has its own real URL path: /retro/CODE (unlike poker
// rooms, whose code is kept out of the address bar). The moderator shares this
// link so the team can join and participate in the retro.
const RETRO_PATH_RE = /^\/retro\/([A-Za-z0-9-]+)\/?$/;

// Poker invite links carry the code as ?room=CODE (or a legacy /room-CODE path),
// which is read on open and then stripped from the address bar.
function pokerCodeFromUrl(): string {
  const params = new URLSearchParams(window.location.search);
  const fromQuery = (params.get('room') || '').toUpperCase();
  if (fromQuery) return fromQuery;
  const legacy = window.location.pathname.match(/^\/room-([A-Za-z0-9-]+)\/?$/);
  return legacy ? legacy[1].toUpperCase() : '';
}

function computeRoute(): Route {
  const path = window.location.pathname;
  if (path === '/privacy' || path === '/privacy/') return { kind: 'privacy' };
  if (path === '/terms' || path === '/terms/') return { kind: 'terms' };

  const retroMatch = path.match(RETRO_PATH_RE);
  if (retroMatch) {
    const code = retroMatch[1].toUpperCase();
    // In the board if you already have an identity for it, else join by name.
    if (getIdentity(code)) return { kind: 'retro', code };
    return { kind: 'retroJoin', code };
  }

  const code = pokerCodeFromUrl();
  if (code) {
    if (getIdentity(code)) {
      setCurrentRoom(code);
      return { kind: 'room', code };
    }
    return { kind: 'home', joinCode: code };
  }

  const current = getCurrentRoom();
  if (current && getIdentity(current)) return { kind: 'room', code: current };
  return { kind: 'home' };
}

export default function App() {
  const [route, setRoute] = useState<Route>(computeRoute);

  useEffect(() => {
    // Strip the poker code (query param or legacy path) out of the address bar.
    // The retro path (/retro/CODE) is intentionally kept in the URL.
    if (window.location.search || /^\/room-/.test(window.location.pathname)) {
      window.history.replaceState({}, '', '/');
    }
    const onPop = () => setRoute(computeRoute());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  function go(path: string, next: Route, replace = false) {
    if (replace) window.history.replaceState({}, '', path);
    else window.history.pushState({}, '', path);
    setRoute(next);
  }
  function goRoom(code: string) {
    setCurrentRoom(code);
    go('/', { kind: 'room', code: code.toUpperCase() }, true); // clean URL, no code
  }
  function goRetro(code: string) {
    const c = code.toUpperCase();
    // Straight to the board if you already have an identity for it (moderator, or
    // a member who just joined); otherwise show the join screen first.
    const next: Route = getIdentity(c) ? { kind: 'retro', code: c } : { kind: 'retroJoin', code: c };
    go(`/retro/${c}`, next); // keep the code in the URL
  }
  function goHome() {
    clearCurrentRoom();
    go('/', { kind: 'home' }, true);
  }
  // A member left (or was removed from) a room → thank them instead of dropping
  // them on the landing screen. The code is kept out of the URL (like the room).
  function goThanks(code: string, name: string) {
    clearCurrentRoom();
    go('/', { kind: 'thanks', code: code.toUpperCase(), name }, true);
  }
  // Leave a retro without disturbing an active poker room — recompute from
  // storage so an in-progress room resumes, otherwise land on home.
  function exitRetro() {
    window.history.pushState({}, '', '/');
    setRoute(computeRoute());
  }
  function goPrivacy() {
    go('/privacy', { kind: 'privacy' });
  }
  function goTerms() {
    go('/terms', { kind: 'terms' });
  }

  let page;
  if (route.kind === 'privacy') {
    page = <Privacy onBack={goHome} onTerms={goTerms} />;
  } else if (route.kind === 'terms') {
    page = <Terms onBack={goHome} onPrivacy={goPrivacy} />;
  } else if (route.kind === 'thanks') {
    page = <ThanksPage code={route.code} name={route.name} onEnter={goRoom} />;
  } else if (route.kind === 'room') {
    page = (
      <Room
        code={route.code}
        onLeave={goHome}
        onMissingIdentity={goHome}
        onThanks={goThanks}
        onEnterRetro={goRetro}
      />
    );
  } else if (route.kind === 'retro') {
    page = <RetroBoard code={route.code} onLeave={exitRetro} onMissingIdentity={exitRetro} />;
  } else if (route.kind === 'retroJoin') {
    page = (
      <RetroHome joinCode={route.code} onEnter={goRetro} onExit={exitRetro} onPrivacy={goPrivacy} />
    );
  } else {
    page = (
      <Home initialCode={route.joinCode} onEnter={goRoom} onPrivacy={goPrivacy} onTerms={goTerms} />
    );
  }

  return (
    <>
      {page}
      <StickyAd />
      <ToastHost />
    </>
  );
}
