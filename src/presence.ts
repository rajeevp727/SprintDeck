import { toast } from './components/Toast';
import type { MutableRefObject } from 'react';

interface Person {
  id: string;
  name: string;
}

/**
 * Toast the host (moderator/facilitator) when someone joins or leaves.
 * `prev` is a ref holding the last-seen roster — pass the same ref each poll.
 * No-ops for non-hosts and on the first call (which just sets the baseline).
 */
export function notifyPresence(
  current: Person[],
  isHost: boolean,
  selfId: string,
  prev: MutableRefObject<Person[] | null>,
  label: string,
) {
  const before = prev.current;
  prev.current = current.map((p) => ({ id: p.id, name: p.name }));
  if (!before || !isHost) return;

  const beforeIds = new Set(before.map((p) => p.id));
  const afterIds = new Set(current.map((p) => p.id));
  for (const p of current) {
    if (p.id !== selfId && !beforeIds.has(p.id)) toast(`${p.name} joined the ${label}`);
  }
  for (const p of before) {
    if (p.id !== selfId && !afterIds.has(p.id)) toast(`${p.name} left the ${label}`);
  }
}
