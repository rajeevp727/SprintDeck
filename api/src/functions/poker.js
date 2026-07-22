'use strict';

const { app } = require('@azure/functions');
const store = require('../store');
const { ok, bad, readBody } = require('../http');

// Load a session and verify the caller is its moderator. Returns the session
// or a ready-to-return error response.
async function requireModerator(code, participantId) {
  const session = await store.loadSession(code);
  if (!session) return { error: bad('Session not found', 404) };
  if (!store.isModerator(session, participantId)) {
    return { error: bad('Only the moderator can do this', 403) };
  }
  return { session };
}

// GET /api/health — lightweight warm-keep target for an uptime pinger.
app.http('health', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'health',
  handler: async () => ok({ status: 'ok', service: 'sprintdeck' }),
});

// POST /api/session  { name, moderatorName }
app.http('createSession', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'session',
  handler: async (req) => {
    const { name, moderatorName, code } = await readBody(req);
    const result = await store.createSession(name, moderatorName, code);
    if (result.error === 'invalid') {
      return bad('Room code must be 3–24 letters, numbers or dashes');
    }
    if (result.error === 'taken') return bad('That room code is taken — pick another', 409);
    const { session, participantId } = result;
    return ok({ participantId, session: store.publicView(session, participantId) });
  },
});

// POST /api/session/{code}/join  { name }
app.http('joinSession', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'session/{code}/join',
  handler: async (req) => {
    const { name } = await readBody(req);
    const result = await store.joinSession(req.params.code, name);
    if (result.error === 'not_found') return bad('Session not found', 404);
    if (result.error === 'full') {
      return bad(`This room is full (max ${store.MAX_PARTICIPANTS} members)`, 409);
    }
    const { session, participantId } = result;
    return ok({ participantId, session: store.publicView(session, participantId) });
  },
});

// GET /api/session/{code}?participantId=...   (polled)
app.http('getSession', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'session/{code}',
  handler: async (req) => {
    const session = await store.loadSession(req.params.code);
    if (!session) return bad('Session not found', 404);
    const participantId = req.query.get('participantId');
    return ok({ session: store.publicView(session, participantId) });
  },
});

// POST /api/session/{code}/vote  { participantId, vote }
app.http('castVote', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'session/{code}/vote',
  handler: async (req) => {
    const { participantId, vote } = await readBody(req);
    const session = await store.loadSession(req.params.code);
    if (!session) return bad('Session not found', 404);
    if (session.status !== 'voting') return bad('Voting is not open');

    const p = session.participants[participantId];
    if (!p) return bad('You are not in this session', 403);
    if (vote !== null && !session.deck.includes(vote)) return bad('Invalid card');

    p.vote = vote; // null clears the vote (toggle off)
    await store.saveSession(session);
    return ok({ session: store.publicView(session, participantId) });
  },
});

// POST /api/session/{code}/start  { participantId, story }   (moderator)
app.http('startVoting', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'session/{code}/start',
  handler: async (req) => {
    const { participantId, story } = await readBody(req);
    const { session, error } = await requireModerator(req.params.code, participantId);
    if (error) return error;

    store.startStory(session, story); // story is optional
    await store.saveSession(session);
    return ok({ session: store.publicView(session, participantId) });
  },
});

// POST /api/session/{code}/reveal  { participantId }   (moderator)
app.http('reveal', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'session/{code}/reveal',
  handler: async (req) => {
    const { participantId } = await readBody(req);
    const { session, error } = await requireModerator(req.params.code, participantId);
    if (error) return error;

    store.revealAndSave(session); // sets 'revealed' + auto-saves the result
    await store.saveSession(session);
    return ok({ session: store.publicView(session, participantId) });
  },
});

// POST /api/session/{code}/reset  { participantId }   (moderator) — clear votes, vote again
app.http('reset', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'session/{code}/reset',
  handler: async (req) => {
    const { participantId } = await readBody(req);
    const { session, error } = await requireModerator(req.params.code, participantId);
    if (error) return error;

    for (const p of Object.values(session.participants)) p.vote = null;
    session.status = 'voting';
    await store.saveSession(session);
    return ok({ session: store.publicView(session, participantId) });
  },
});

// POST /api/session/{code}/queue  { participantId, stories }   (moderator)
app.http('addToQueue', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'session/{code}/queue',
  handler: async (req) => {
    const { participantId, stories } = await readBody(req);
    const { session, error } = await requireModerator(req.params.code, participantId);
    if (error) return error;

    const titles = Array.isArray(stories) ? stories : String(stories || '').split('\n');
    store.addToQueue(session, titles);
    await store.saveSession(session);
    return ok({ session: store.publicView(session, participantId) });
  },
});

// DELETE /api/session/{code}/queue/{storyId}?participantId=...   (moderator)
app.http('removeFromQueue', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'session/{code}/queue/{storyId}',
  handler: async (req) => {
    const participantId = req.query.get('participantId');
    const { session, error } = await requireModerator(req.params.code, participantId);
    if (error) return error;

    store.removeFromQueue(session, req.params.storyId);
    await store.saveSession(session);
    return ok({ session: store.publicView(session, participantId) });
  },
});

// POST /api/session/{code}/queue/reorder  { participantId, order: [storyId] }   (moderator)
app.http('reorderQueue', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'session/{code}/queue/reorder',
  handler: async (req) => {
    const { participantId, order } = await readBody(req);
    const { session, error } = await requireModerator(req.params.code, participantId);
    if (error) return error;

    store.reorderQueue(session, order);
    await store.saveSession(session);
    return ok({ session: store.publicView(session, participantId) });
  },
});

// POST /api/session/{code}/kick  { participantId, targetId }   (moderator)
app.http('kickParticipant', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'session/{code}/kick',
  handler: async (req) => {
    const { participantId, targetId } = await readBody(req);
    const { session, error } = await requireModerator(req.params.code, participantId);
    if (error) return error;

    store.kickParticipant(session, targetId);
    await store.saveSession(session);
    return ok({ session: store.publicView(session, participantId) });
  },
});

// POST /api/session/{code}/leave  { participantId }  — a member removes themselves
app.http('leaveSession', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'session/{code}/leave',
  handler: async (req) => {
    const { participantId } = await readBody(req);
    const session = await store.loadSession(req.params.code);
    // kickParticipant removes a non-moderator; the moderator ends the room instead.
    if (session && store.kickParticipant(session, participantId)) {
      await store.saveSession(session);
    }
    return ok({ left: true });
  },
});

// POST /api/session/{code}/end  { participantId }   (moderator) — ends the room
app.http('endSession', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'session/{code}/end',
  handler: async (req) => {
    const { participantId } = await readBody(req);
    const { error } = await requireModerator(req.params.code, participantId);
    if (error) return error;

    await store.deleteSession(req.params.code);
    return ok({ ended: true });
  },
});

// POST /api/session/{code}/next  { participantId, story }   (moderator) — start the
// next round for the given ticket (the current result was already saved on reveal;
// history is preserved so every round accumulates in the results).
app.http('nextStory', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'session/{code}/next',
  handler: async (req) => {
    const { participantId, story } = await readBody(req);
    const { session, error } = await requireModerator(req.params.code, participantId);
    if (error) return error;

    store.startStory(session, story);
    await store.saveSession(session);
    return ok({ session: store.publicView(session, participantId) });
  },
});

// POST /api/session/{code}/finish  { participantId }   (moderator) — mark the
// session finished (estimation done; unlocks Results). Was missing, so the
// frontend's Finish button used to 404.
app.http('finishSession', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'session/{code}/finish',
  handler: async (req) => {
    const { participantId } = await readBody(req);
    const { session, error } = await requireModerator(req.params.code, participantId);
    if (error) return error;

    session.finished = true;
    await store.saveSession(session);
    return ok({ session: store.publicView(session, participantId) });
  },
});

// POST /api/session/{code}/retro  { participantId, retroCode }   (moderator) —
// record the retro board opened for this room so every member's client sees it
// (via polling) and can show a "Join Retro" button.
app.http('setRetro', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'session/{code}/retro',
  handler: async (req) => {
    const { participantId, retroCode } = await readBody(req);
    const { session, error } = await requireModerator(req.params.code, participantId);
    if (error) return error;

    session.retroCode = String(retroCode || '').trim().toUpperCase() || null;
    await store.saveSession(session);
    return ok({ session: store.publicView(session, participantId) });
  },
});
