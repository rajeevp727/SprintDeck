import { request } from './api';
import type { RetroBoard, RetroJoinResult } from './retroTypes';

export const retroApi = {
  createBoard: (name: string, facilitatorName: string, code: string, roomCode: string) =>
    request<RetroJoinResult>('/api/retro', 'POST', { name, facilitatorName, code, roomCode }),

  joinBoard: (code: string, name: string) =>
    request<RetroJoinResult>(`/api/retro/${code}/join`, 'POST', { name }),

  getBoard: (code: string, participantId: string) =>
    request<{ board: RetroBoard }>(
      `/api/retro/${code}?participantId=${encodeURIComponent(participantId)}`,
      'GET',
    ),

  addNote: (code: string, participantId: string, columnId: string, text: string) =>
    request<{ board: RetroBoard }>(`/api/retro/${code}/note`, 'POST', {
      participantId,
      columnId,
      text,
    }),

  updateNote: (
    code: string,
    participantId: string,
    noteId: string,
    patch: { text?: string; columnId?: string },
  ) =>
    request<{ board: RetroBoard }>(`/api/retro/${code}/note/${noteId}`, 'POST', {
      participantId,
      ...patch,
    }),

  deleteNote: (code: string, participantId: string, noteId: string) =>
    request<{ board: RetroBoard }>(
      `/api/retro/${code}/note/${noteId}?participantId=${encodeURIComponent(participantId)}`,
      'DELETE',
    ),

  end: (code: string, participantId: string) =>
    request<{ ended: boolean }>(`/api/retro/${code}/end`, 'POST', { participantId }),
};
