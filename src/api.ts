import type { JoinResult, Session } from './types';

export async function request<T>(url: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    // Polling reads must never come from the HTTP cache, or other devices
    // show stale state until a manual refresh forces revalidation.
    cache: 'no-store',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      /* keep default */
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

export const api = {
  createSession: (name: string, moderatorName: string, code: string) =>
    request<JoinResult>('/api/session', 'POST', { name, moderatorName, code }),

  joinSession: (code: string, name: string) =>
    request<JoinResult>(`/api/session/${code}/join`, 'POST', { name }),

  getSession: (code: string, participantId: string) =>
    request<{ session: Session }>(
      `/api/session/${code}?participantId=${encodeURIComponent(participantId)}`,
      'GET',
    ),

  vote: (code: string, participantId: string, vote: string | null) =>
    request<{ session: Session }>(`/api/session/${code}/vote`, 'POST', { participantId, vote }),

  start: (code: string, participantId: string, story: string) =>
    request<{ session: Session }>(`/api/session/${code}/start`, 'POST', { participantId, story }),

  reveal: (code: string, participantId: string) =>
    request<{ session: Session }>(`/api/session/${code}/reveal`, 'POST', { participantId }),

  reset: (code: string, participantId: string) =>
    request<{ session: Session }>(`/api/session/${code}/reset`, 'POST', { participantId }),

  addToQueue: (code: string, participantId: string, stories: string[]) =>
    request<{ session: Session }>(`/api/session/${code}/queue`, 'POST', { participantId, stories }),

  removeFromQueue: (code: string, participantId: string, storyId: string) =>
    request<{ session: Session }>(
      `/api/session/${code}/queue/${storyId}?participantId=${encodeURIComponent(participantId)}`,
      'DELETE',
    ),

  reorderQueue: (code: string, participantId: string, order: string[]) =>
    request<{ session: Session }>(`/api/session/${code}/queue/reorder`, 'POST', {
      participantId,
      order,
    }),

  next: (code: string, participantId: string) =>
    request<{ session: Session }>(`/api/session/${code}/next`, 'POST', { participantId }),

  end: (code: string, participantId: string) =>
    request<{ ended: boolean }>(`/api/session/${code}/end`, 'POST', { participantId }),

  kick: (code: string, participantId: string, targetId: string) =>
    request<{ session: Session }>(`/api/session/${code}/kick`, 'POST', { participantId, targetId }),

  finish: (code: string, participantId: string) =>
    request<{ session: Session }>(`/api/session/${code}/finish`, 'POST', { participantId }),

  setRetro: (code: string, participantId: string, retroCode: string) =>
    request<{ session: Session }>(`/api/session/${code}/retro`, 'POST', { participantId, retroCode }),

  leaveRoom: (code: string, participantId: string) =>
    request<{ left: boolean }>(`/api/session/${code}/leave`, 'POST', { participantId }),
};
