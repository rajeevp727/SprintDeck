'use strict';

const { app } = require('@azure/functions');
const realtime = require('../realtime');
const { ok, bad } = require('../http');

// GET /api/negotiate?group=room:CODE  → { url } (null when Web PubSub isn't
// configured, so the client falls back to polling).
app.http('negotiate', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'negotiate',
  handler: async (req) => {
    const group = req.query.get('group') || '';
    if (!group) return bad('group required');
    const url = await realtime.negotiate(group);
    return ok({ url: url || null });
  },
});
