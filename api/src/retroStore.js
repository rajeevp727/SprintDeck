'use strict';

const { CosmosClient } = require('@azure/cosmos');

// ───────────────────────────────────────────────────────────────────────────
// Retrospective board store — parallel to store.js (planning poker) but fully
// isolated so the shipped poker flow is never touched.
//
// Boards live in a SEPARATE Cosmos container ("retros") in the same database
// ("sprintdeck"). If no COSMOS_CONNECTION_STRING is configured it falls back to
// an in-memory Map (single instance, local dev). Cosmos native TTL auto-deletes
// idle boards (see boardIdleMs).
// ───────────────────────────────────────────────────────────────────────────
const conn = process.env.COSMOS_CONNECTION_STRING || '';
const dbName = 'sprintdeck';
const containerName = 'retros';

const memory = new Map(); // fallback when no connection string
let containerPromise = null;

// A board is treated as gone when EITHER it has had no activity for boardIdleMs
// (4h) or its total age exceeds boardMaxAgeMs (8h). Retros run longer than a
// poker round, so these are more generous than the poker limits.
const boardMaxAgeMs = 8 * 60 * 60 * 1000; // 8h
const boardIdleMs = 4 * 60 * 60 * 1000; // 4h
const maxParticipants = 30;
const maxNoteLen = 500;

// Each participant is auto-assigned a colour (round-robin via the board's
// colorSeq), so all of that person's notes share one colour — no manual picking.
const participantColors = [
  '#ffd76a', '#a0e8a4', '#8fd0ff', '#f7a8c4', '#c9b3ff',
  '#ffb38a', '#7fe3d4', '#ffd0e0', '#c7e59a', '#9ab8ff',
];

function colorForSeq(seq) {
  return participantColors[seq % participantColors.length];
}

function getContainer() {
  if (!conn) return null;
  if (!containerPromise) {
    const client = new CosmosClient(conn);
    containerPromise = (async () => {
      // Provisioned (free-tier) accounts need shared throughput; serverless
      // accounts reject it — try with, fall back to without.
      let database;
      try {
        ({ database } = await client.databases.createIfNotExists({ id: dbName, throughput: 400 }));
      } catch {
        ({ database } = await client.databases.createIfNotExists({ id: dbName }));
      }
      const { container } = await database.containers.createIfNotExists({
        id: containerName,
        partitionKey: { paths: ['/code'] },
        defaultTtl: boardIdleMs / 1000,
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
      ttl: boardIdleMs / 1000, // refresh idle expiry on every write
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
const codeChars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L ambiguity

function randomCode() {
  let code = '';
  for (let i = 0; i < 5; i++) code += codeChars[Math.floor(Math.random() * codeChars.length)];
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
  return now - b.lastActivity > boardIdleMs || now - b.createdAt > boardMaxAgeMs;
}

async function genUniqueCode() {
  let code;
  do {
    code = randomCode();
  } while (await readRaw(code));
  return code;
}

const codeRe = /^[A-Z0-9-]{3,24}$/;

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

async function createBoard(name, facilitatorName, desiredCode, roomCode) {
  let code;
  const wanted = normalize(desiredCode);
  if (wanted) {
    if (!codeRe.test(wanted)) return { error: 'invalid' };
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
    roomCode: normalize(roomCode) || null, // parent poker room — unlinked on end
    columns: defaultColumns(),
    notes: [], // [{ id, columnId, authorId, authorName, text, color, createdAt }]
    participants: {
      [pid]: { id: pid, name: (facilitatorName || '').trim() || 'Facilitator', color: colorForSeq(0) },
    },
    colorSeq: 1, // next participant's colour index (facilitator took 0)
    createdAt: now,
    lastActivity: now,
  };
  await writeRaw(board);
  return { board, participantId: pid };
}

async function joinBoard(code, name) {
  const board = await loadBoard(code);
  if (!board) return { error: 'not_found' };
  if (Object.keys(board.participants).length >= maxParticipants) {
    return { error: 'full' };
  }
  const pid = genId();
  const seq = board.colorSeq || Object.keys(board.participants).length;
  board.participants[pid] = { id: pid, name: (name || '').trim() || 'Guest', color: colorForSeq(seq) };
  board.colorSeq = seq + 1;
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
function addNote(board, participantId, columnId, text) {
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
    text: body.slice(0, maxNoteLen),
    color: author.color || colorForSeq(0), // the author's auto-assigned colour
    createdAt: Date.now(),
  });
  return true;
}

// A participant may edit their own note. Text and column are optional partial
// updates. Colour is not editable — it's fixed to the author's assigned colour.
function updateNote(board, participantId, noteId, patch) {
  const note = board.notes.find((n) => n.id === noteId);
  if (!note) return false;
  if (note.authorId !== participantId) return false; // only the author edits their note
  if (typeof patch.text === 'string') {
    const body = patch.text.trim();
    if (!body) return false;
    note.text = body.slice(0, maxNoteLen);
  }
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
        color: p.color || colorForSeq(0),
        isFacilitator: p.id === board.facilitatorId,
      }))
      .sort((a, b) => (a.isFacilitator === b.isFacilitator ? 0 : a.isFacilitator ? -1 : 1)),
  };
}

module.exports = {
  maxParticipants,
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
