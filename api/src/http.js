'use strict';

// Shared HTTP helpers for the Functions handlers. no-store keeps polling reads
// off the browser/CDN cache.
const noCache = { 'Cache-Control': 'no-store' };

function ok(body) {
  return { status: 200, jsonBody: body, headers: noCache };
}

function bad(message, status = 400) {
  return { status, jsonBody: { error: message }, headers: noCache };
}

async function readBody(req) {
  try {
    return (await req.json()) || {};
  } catch {
    return {};
  }
}

module.exports = { noCache, ok, bad, readBody };
