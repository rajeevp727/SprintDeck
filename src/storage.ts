// Remember who you are in each room, so a page refresh rejoins seamlessly
// instead of dropping you back to the home screen.
const KEY = 'pp.identity';

type IdentityMap = Record<string, { participantId: string; name: string }>;

function read(): IdentityMap {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {
    return {};
  }
}

export function saveIdentity(code: string, participantId: string, name: string) {
  const map = read();
  map[code.toUpperCase()] = { participantId, name };
  localStorage.setItem(KEY, JSON.stringify(map));
}

export function getIdentity(code: string) {
  return read()[code.toUpperCase()] || null;
}

export function clearIdentity(code: string) {
  const map = read();
  delete map[code.toUpperCase()];
  localStorage.setItem(KEY, JSON.stringify(map));
}

// The room you're currently in — kept in storage (not the URL) so the page can
// resume the room on refresh without exposing the code in the address bar.
const CURRENT_KEY = 'pp.currentRoom';

export function setCurrentRoom(code: string) {
  localStorage.setItem(CURRENT_KEY, code.toUpperCase());
}

export function getCurrentRoom(): string | null {
  return localStorage.getItem(CURRENT_KEY);
}

export function clearCurrentRoom() {
  localStorage.removeItem(CURRENT_KEY);
}

