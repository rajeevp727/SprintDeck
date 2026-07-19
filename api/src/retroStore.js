'use strict';

const { CosmosClient } = require('@azure/cosmos');

// ───────────────────────────────────────────────────────────────────────────
// Retrospective board store — parallel to store.js (planning poker) but fully
// isolated so the shipped poker flow is never touched.
//
// Boards live in a SEPARATE Cosmos container ("retros") in the same database
// ("sprintdeck"). If no COSMOS_CONNECTION_STRING is configured it falls back to
// an in-memory Map (single instance, local dev). Cosmos native TTL auto-deletes
// idle boards (see BOARD_IDLE_MS).
// ───────────────────────────────────────────────────────────────────────────
const CONN = process.env.COSMOS_CONNECTION_STRING || '';
const DB_NAME = 'sprintdeck';
const CONTAINER_NAME = 'retros';

const memory = new Map(); // fallback when no connection string
let containerPromise = null;

// A board is treated as gone when EITHER it has had no activity for
// BOARD_IDLE_MS (4h) or its total age exceeds BOARD_MAX_AGE_MS (8h). Retros run
// longer than a poker round, so these are more generous than the poker limits.
const BOARD_MAX_AGE_MS = 8 * 60 * 60 * 1000; // 8h
const BOARD_IDLE_MS = 4 * 60 * 60 * 1000; // 4h
const MAX_PARTICIPANTS = 30;
const MAX_NOTE_LEN = 500;

function getContainer() {
  if (!CONN) return null;
  if (!containerPromise) {
    const client = new CosmosClient(CONN);
    containerPromise = (async () => {
      // Provisioned (free-tier) accounts need shared throughput; serverless
      // accounts reject it — try with, fall back to without.
      let database;
      try {
        ({ database } = await client.databases.createIfNotExists({ id: DB_NAME, throughput: 400 }));
      } catch {
        ({ database } = await client.databases.createIfNotExists({ id: DB_NAME }));
      }
      const { container } = await database.containers.createIfNotExists({
        id: CONTAINER_NAME,
        partitionKey: { paths: ['/code'] },
        defaultTtl: BOARD_IDLE_MS / 1000,
      });
      return container;
    })().catch((e) => {
      // Don't cache a failed init — reset so the next request retries.
      containerPromise = null;
      throw e;
    });
  }
  return containerPromise;
}

// Low-level persistence (code already normalized to upper-case).
async function readRaw(code) {
  const c = getContainer();
  if (c) {
    try {
      const { resource } = await (await c).item(code, code).read();
      return resource ? resource.doc : null;
    } catch (err) {
      if (err.code === 404) return null;
      throw err;
    }
  }
  return memory.get(code) || null;
}

async function writeRaw(board) {
  const c = getContainer();
  if (c) {
    await (await c).items.upsert({
      id: board.code,
      code: board.code,
      doc: board,
      ttl: BOARD_IDLE_MS / 1000, // refresh idle expiry on every write
    });
  } else {
    memory.set(board.code, board);
  }
}

async function removeRaw(code) {
  const c = getContainer();
  if (c) {
    try {
      await (await c).item(code, code).delete();
    } catch (err) {
      if (err.code !== 404) throw err;
    }
  } else {
    memory.delete(code);
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L ambiguity

function randomCode() {
  let code = '';
  for (let i = 0; i < 5; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return code;
}

function genId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function normalize(code) {
  return (code || '').trim().toUpperCase();
}

function isExpired(b) {
  const now = Date.now();
  return now - b.lastActivity > BOARD_IDLE_MS || now - b.createdAt > BOARD_MAX_AGE_MS;
}

async function genUniqueCode() {
  let code;
  do {
    code = randomCode();
  } while (await readRaw(code));
  return code;
}

const CODE_RE = /^[A-Z0-9-]{3,24}$/;

// Default retro template — three classic columns. Each carries an accent color
// used as the column header tint on the client.
function defaultColumns() {
  return [
    { id: genId(), title: 'What went well', color: '#5ec47f' },
    { id: genId(), title: 'What to improve', color: '#efb45e' },
    { id: genId(), title: 'Action items', color: '#4f7cff' },
  ];
}

// ───────────────────────────────────────────────────────────────────────────
// Board lifecycle
// ───────────────────────────────────────────────────────────────────────────
async function loadBoard(code) {
  const b = await readRaw(normalize(code));
  if (!b) return null;
  if (isExpired(b)) {
    await removeRaw(b.code);
    return null;
  }
  return b;
}

async function saveBoard(board) {
  board.lastActivity = Date.now();
  await writeRaw(board);
}

async function deleteBoard(code) {
  await removeRaw(normalize(code));
}

async function createBoard(name, facilitatorName, desiredCode) {
  let code;
  const wanted = normalize(desiredCode);
  if (wanted) {
    if (!CODE_RE.test(wanted)) return { error: 'invalid' };
    if (await loadBoard(wanted)) return { error: 'taken' };
    code = wanted;
  } else {
    code = await genUniqueCode();
  }
  const pid = genId();
  const now = Date.now();
  const board = {
    code,
    name: (name || '').trim() || 'Sprint Retrospective',
    facilitatorId: pid,
    columns: defaultColumns(),
    notes: [], // [{ id, columnId, authorId, authorName, text, color, createdAt }]
    participants: {
      [pid]: { id: pid, name: (facilitatorName || '').trim() || 'Facilitator' },
    },
    createdAt: now,
    lastActivity: now,
  };
  await writeRaw(board);
  return { board, participantId: pid };
}

async function joinBoard(code, name) {
  const board = await loadBoard(code);
  if (!board) return { error: 'not_found' };
  if (Object.keys(board.participants).length >= MAX_PARTICIPANTS) {
    return { error: 'full' };
  }
  const pid = genId();
  board.participants[pid] = { id: pid, name: (name || '').trim() || 'Guest' };
  await saveBoard(board);
  return { board, participantId: pid };
}

function isFacilitator(board, participantId) {
  return board.facilitatorId === participantId;
}

// ───────────────────────────────────────────────────────────────────────────
// Note mutators — operate on a loaded board (sync); caller persists after.
// They return true on success, false when the request is invalid/not allowed.
// ───────────────────────────────────────────────────────────────────────────
function addNote(board, participantId, columnId, text, color) {
  const author = board.participants[participantId];
  if (!author) return false;
  if (!board.columns.some((c) => c.id === columnId)) return false;
  const body = String(text || '').trim();
  if (!body) return false;
  board.notes.push({
    id: genId(),
    columnId,
    authorId: participantId,
    authorName: author.name,
    text: body.slice(0, MAX_NOTE_LEN),
    color: color || '#ffd76a',
    createdAt: Date.now(),
  });
  return true;
}

// A participant may edit their own note. Text, color and column are all optional
// partial updates.
function updateNote(board, participantId, noteId, patch) {
  const note = board.notes.find((n) => n.id === noteId);
  if (!note) return false;
  if (note.authorId !== participantId) return false; // only the author edits text/color
  if (typeof patch.text === 'string') {
    const body = patch.text.trim();
    if (!body) return false;
    note.text = body.slice(0, MAX_NOTE_LEN);
  }
  if (typeof patch.color === 'string') note.color = patch.color;
  if (typeof patch.columnId === 'string') {
    if (!board.columns.some((c) => c.id === patch.columnId)) return false;
    note.columnId = patch.columnId;
  }
  return true;
}

// The author may delete their own note; the facilitator may delete any note.
function deleteNote(board, participantId, noteId) {
  const note = board.notes.find((n) => n.id === noteId);
  if (!note) return false;
  if (note.authorId !== participantId && !isFacilitator(board, participantId)) return false;
  board.notes = board.notes.filter((n) => n.id !== noteId);
  return true;
}

// Client-safe view. In this MVP every note is visible to everyone as soon as
// it's added (no hide-until-reveal), so we return the whole board.
function publicView(board) {
  return {
    code: board.code,
    name: board.name,
    facilitatorId: board.facilitatorId,
    columns: board.columns,
    notes: board.notes,
    participants: Object.values(board.participants)
      .map((p) => ({
        id: p.id,
        name: p.name,
        isFacilitator: p.id === board.facilitatorId,
      }))
      .sort((a, b) => (a.isFacilitator === b.isFacilitator ? 0 : a.isFacilitator ? -1 : 1)),
  };
}

module.exports = {
  MAX_PARTICIPANTS,
  loadBoard,
  saveBoard,
  deleteBoard,
  createBoard,
  joinBoard,
  isFacilitator,
  addNote,
  updateNote,
  deleteNote,
  publicView,
};
