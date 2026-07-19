'use strict';

const { WebPubSubServiceClient } = require('@azure/web-pubsub');

// ───────────────────────────────────────────────────────────────────────────
// Real-time push via Azure Web PubSub. Optional: if WEBPUBSUB_CONNECTION_STRING
// isn't configured, every function here no-ops and clients fall back to polling.
// Clients connect to a group named by their room/board code and get a lightweight
// "changed" ping on every mutation, which triggers an immediate state refresh.
// ───────────────────────────────────────────────────────────────────────────
const conn = process.env.WEBPUBSUB_CONNECTION_STRING || '';
const hub = 'sprintdeck';

let client = null;
function svc() {
  if (!conn) return null;
  if (!client) client = new WebPubSubServiceClient(conn, hub);
  return client;
}

// Client access URL that auto-joins the given group on connect, and may publish
// to it (used for ephemeral client-to-client events like "typing"). Null if
// Web PubSub isn't configured.
async function negotiate(group) {
  const s = svc();
  if (!s) return null;
  const token = await s.getClientAccessToken({
    groups: [group],
    roles: [`webpubsub.sendToGroup.${group}`],
  });
  return token.url;
}

// Ping everyone in a group that something changed (best-effort, fire-and-forget).
async function notifyGroup(group) {
  const s = svc();
  if (!s) return;
  try {
    await s.group(group).sendToAll({ t: 'changed' });
  } catch {
    /* best-effort — clients still have the polling fallback */
  }
}

module.exports = { negotiate, notifyGroup };
