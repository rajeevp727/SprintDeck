'use strict';

const { app } = require('@azure/functions');
const realtime = require('../realtime');

const noCache = { 'Cache-Control': 'no-store' };

// GET /api/negotiate?group=room:CODE  → { url } (null when Web PubSub isn't
// configured, so the client falls back to polling).
app.http('negotiate', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'negotiate',
  handler: async (req) => {
    const group = req.query.get('group') || '';
    if (!group) return { status: 400, jsonBody: { error: 'group required' }, headers: noCache };
    const url = await realtime.negotiate(group);
    return { status: 200, jsonBody: { url: url || null }, headers: noCache };
  },
});
