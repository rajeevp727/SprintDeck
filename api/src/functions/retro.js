'use strict';

const { app } = require('@azure/functions');
const store = require('../retroStore');

// no-store so polling reads are never cached by the browser/CDN — otherwise
// other devices render stale state until a manual refresh.
const NO_CACHE = { 'Cache-Control': 'no-store' };

function ok(body) {
  return { status: 200, jsonBody: body, headers: NO_CACHE };
}
function bad(message, status = 400) {
  return { status, jsonBody: { error: message }, headers: NO_CACHE };
}

async function readBody(req) {
  try {
    return (await req.json()) || {};
  } catch {
    return {};
  }
}

// Load a board and verify the caller is its facilitator. Returns the board or a
// ready-to-return error response.
async function requireFacilitator(code, participantId) {
  const board = await store.loadBoard(code);
  if (!board) return { error: bad('Board not found', 404) };
  if (!store.isFacilitator(board, participantId)) {
    return { error: bad('Only the facilitator can do this', 403) };
  }
  return { board };
}

// Load a board and verify the caller is a participant. Returns the board or a
// ready-to-return error response.
async function requireParticipant(code, participantId) {
  const board = await store.loadBoard(code);
  if (!board) return { error: bad('Board not found', 404) };
  if (!board.participants[participantId]) {
    return { error: bad('You are not in this board', 403) };
  }
  return { board };
}

// POST /api/retro  { name, facilitatorName, code? }
app.http('createRetro', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'retro',
  handler: async (req) => {
    const { name, facilitatorName, code } = await readBody(req);
    const result = await store.createBoard(name, facilitatorName, code);
    if (result.error === 'invalid') {
      return bad('Board code must be 3–24 letters, numbers or dashes');
    }
    if (result.error === 'taken') return bad('That board code is taken — pick another', 409);
    const { board, participantId } = result;
    return ok({ participantId, board: store.publicView(board) });
  },
});

// POST /api/retro/{code}/join  { name }
app.http('joinRetro', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'retro/{code}/join',
  handler: async (req) => {
    const { name } = await readBody(req);
    const result = await store.joinBoard(req.params.code, name);
    if (result.error === 'not_found') return bad('Board not found', 404);
    if (result.error === 'full') {
      return bad(`This board is full (max ${store.MAX_PARTICIPANTS} members)`, 409);
    }
    const { board, participantId } = result;
    return ok({ participantId, board: store.publicView(board) });
  },
});

// GET /api/retro/{code}?participantId=...   (polled)
app.http('getRetro', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'retro/{code}',
  handler: async (req) => {
    const board = await store.loadBoard(req.params.code);
    if (!board) return bad('Board not found', 404);
    return ok({ board: store.publicView(board) });
  },
});

// POST /api/retro/{code}/note  { participantId, columnId, text, color }
app.http('addRetroNote', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'retro/{code}/note',
  handler: async (req) => {
    const { participantId, columnId, text, color } = await readBody(req);
    const { board, error } = await requireParticipant(req.params.code, participantId);
    if (error) return error;

    if (!store.addNote(board, participantId, columnId, text, color)) {
      return bad('Could not add note — check the column and text');
    }
    await store.saveBoard(board);
    return ok({ board: store.publicView(board) });
  },
});

// POST /api/retro/{code}/note/{noteId}  { participantId, text?, color?, columnId? }  (author)
app.http('updateRetroNote', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'retro/{code}/note/{noteId}',
  handler: async (req) => {
    const { participantId, text, color, columnId } = await readBody(req);
    const { board, error } = await requireParticipant(req.params.code, participantId);
    if (error) return error;

    if (!store.updateNote(board, participantId, req.params.noteId, { text, color, columnId })) {
      return bad('Could not update this note', 403);
    }
    await store.saveBoard(board);
    return ok({ board: store.publicView(board) });
  },
});

// DELETE /api/retro/{code}/note/{noteId}?participantId=...   (author or facilitator)
app.http('deleteRetroNote', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'retro/{code}/note/{noteId}',
  handler: async (req) => {
    const participantId = req.query.get('participantId');
    const { board, error } = await requireParticipant(req.params.code, participantId);
    if (error) return error;

    if (!store.deleteNote(board, participantId, req.params.noteId)) {
      return bad('Could not delete this note', 403);
    }
    await store.saveBoard(board);
    return ok({ board: store.publicView(board) });
  },
});

// POST /api/retro/{code}/end  { participantId }   (facilitator) — ends the board
app.http('endRetro', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'retro/{code}/end',
  handler: async (req) => {
    const { participantId } = await readBody(req);
    const { error } = await requireFacilitator(req.params.code, participantId);
    if (error) return error;

    await store.deleteBoard(req.params.code);
    return ok({ ended: true });
  },
});
