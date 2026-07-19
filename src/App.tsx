import { useEffect, useState } from 'react';
import Home from './components/Home';
import Room from './components/Room';
import RetroHome from './components/RetroHome';
import RetroBoard from './components/RetroBoard';
import Privacy from './components/Privacy';
import StickyAd from './components/StickyAd';
import {
  getIdentity,
  getCurrentRoom,
  setCurrentRoom,
  clearCurrentRoom,
  getCurrentRetro,
  setCurrentRetro,
  clearCurrentRetro,
} from './storage';

type Route =
  | { kind: 'room'; code: string }
  | { kind: 'retro'; code: string }
  | { kind: 'retroHome'; joinCode?: string }
  | { kind: 'privacy' }
  | { kind: 'home'; joinCode?: string };

// The room/board code is NOT kept in the URL — it lives in storage (see
// storage.ts). Invite links carry the code as a ?room=CODE (poker) or
// ?retro=CODE (retro) query param, which is read on open and then stripped from
// the address bar. A legacy /room-CODE path is also honored. Otherwise the
// session resumes from storage; the visible URL stays "/".
function codeFromUrl(param: 'room' | 'retro'): string {
  const params = new URLSearchParams(window.location.search);
  const fromQuery = (params.get(param) || '').toUpperCase();
  if (fromQuery) return fromQuery;
  if (param === 'room') {
    const legacy = window.location.pathname.match(/^\/room-([A-Za-z0-9-]+)\/?$/);
    return legacy ? legacy[1].toUpperCase() : '';
  }
  return '';
}

function computeRoute(): Route {
  const path = window.location.pathname;
  if (path === '/privacy' || path === '/privacy/') return { kind: 'privacy' };

  // Retro section — invite link (?retro=CODE), /retro path, or resume from storage.
  const retroCode = codeFromUrl('retro');
  if (retroCode) {
    if (getIdentity(retroCode)) {
      setCurrentRetro(retroCode);
      return { kind: 'retro', code: retroCode };
    }
    return { kind: 'retroHome', joinCode: retroCode };
  }
  if (path === '/retro' || path === '/retro/') {
    const currentRetro = getCurrentRetro();
    if (currentRetro && getIdentity(currentRetro)) return { kind: 'retro', code: currentRetro };
    return { kind: 'retroHome' };
  }

  // Planning poker — invite link (?room=CODE / legacy path) or resume from storage.
  const code = codeFromUrl('room');
  if (code) {
    if (getIdentity(code)) {
      setCurrentRoom(code);
      return { kind: 'room', code };
    }
    return { kind: 'home', joinCode: code };
  }

  const currentRetro = getCurrentRetro();
  if (currentRetro && getIdentity(currentRetro)) return { kind: 'retro', code: currentRetro };

  const current = getCurrentRoom();
  if (current && getIdentity(current)) return { kind: 'room', code: current };
  return { kind: 'home' };
}

export default function App() {
  const [route, setRoute] = useState<Route>(computeRoute);

  useEffect(() => {
    // Strip the code (query param or legacy path) out of the address bar.
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
    clearCurrentRetro();
    setCurrentRoom(code);
    go('/', { kind: 'room', code: code.toUpperCase() }, true); // clean URL, no code
  }
  function goRetro(code: string) {
    clearCurrentRoom();
    setCurrentRetro(code);
    go('/', { kind: 'retro', code: code.toUpperCase() }, true); // clean URL, no code
  }
  function goHome() {
    clearCurrentRoom();
    clearCurrentRetro();
    go('/', { kind: 'home' }, true);
  }
  function goRetroHome() {
    clearCurrentRoom();
    clearCurrentRetro();
    go('/retro', { kind: 'retroHome' });
  }
  function goPrivacy() {
    go('/privacy', { kind: 'privacy' });
  }

  let page;
  if (route.kind === 'privacy') {
    page = <Privacy onBack={goHome} />;
  } else if (route.kind === 'room') {
    page = <Room code={route.code} onLeave={goHome} onMissingIdentity={goHome} />;
  } else if (route.kind === 'retro') {
    page = <RetroBoard code={route.code} onLeave={goRetroHome} onMissingIdentity={goRetroHome} />;
  } else if (route.kind === 'retroHome') {
    page = (
      <RetroHome
        initialCode={route.joinCode}
        onEnter={goRetro}
        onPoker={goHome}
        onPrivacy={goPrivacy}
      />
    );
  } else {
    page = (
      <Home
        initialCode={route.joinCode}
        onEnter={goRoom}
        onRetro={goRetroHome}
        onPrivacy={goPrivacy}
      />
    );
  }

  return (
    <>
      {page}
      <StickyAd />
    </>
  );
}
