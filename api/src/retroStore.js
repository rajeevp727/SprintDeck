'use strict';

const { CosmosClient } = require('@azure/cosmos');
const realtime = require('./realtime');

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

const memory = new Map(); // board fallback when no connection string
const containerCache = new Map(); // container name -> Promise<container>

// A board is treated as gone when EITHER it has had no activity for boardIdleMs
// (4h) or its total age exceeds boardMaxAgeMs (8h). Retros run longer than a
// poker round, so these are more generous than the poker limits.
const boardMaxAgeMs = 8 * 60 * 60 * 1000; // 8h
const boardIdleMs = 4 * 60 * 60 * 1000; // 4h
const maxParticipants = 30;
const maxNoteLen = 500;

// Action items persist across sprints in a separate, long-lived container keyed
// by the poker room code, so the next retro for that room can review them.
const ledgerContainerName = 'retroledger';
const ledgerTtlSeconds = 90 * 24 * 60 * 60; // ~90 days
const ledgerMemory = new Map(); // ledger fallback when no connection string

// Each participant is auto-assigned a colour (round-robin via the board's
// colorSeq), so all of that person's notes share one colour — no manual picking.
const participantColors = [
  '#ffd76a', '#a0e8a4', '#8fd0ff', '#f7a8c4', '#c9b3ff',
  '#ffb38a', '#7fe3d4', '#ffd0e0', '#c7e59a', '#9ab8ff',
];

function colorForSeq(seq) {
  return participantColors[seq % participantColors.length];
}

// Cached promise for a Cosmos container (created on first use). Shared by the
// board and ledger containers — both use partition key /code and native TTL.
function containerFor(name, ttlSeconds) {
  if (!conn) return null;
  if (!containerCache.has(name)) {
    const client = new CosmosClient(conn);
    const promise = (async () => {
      // Provisioned (free-tier) accounts need shared throughput; serverless
      // accounts reject it — try with, fall back to without.
      let database;
      try {
        ({ database } = await client.databases.createIfNotExists({ id: dbName, throughput: 400 }));
      } catch {
        ({ database } = await client.databases.createIfNotExists({ id: dbName }));
      }
      const { container } = await database.containers.createIfNotExists({
        id: name,
        partitionKey: { paths: ['/code'] },
        defaultTtl: ttlSeconds,
      });
      return container;
    })().catch((e) => {
      containerCache.delete(name); // don't cache a failed init — retry next time
      throw e;
    });
    containerCache.set(name, promise);
  }
  return containerCache.get(name);
}

const getContainer = () => containerFor(containerName, boardIdleMs / 1000);

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
// Action-items ledger (durable, keyed by poker room code) — carries a room's
// action items from one sprint's retro to the next.
// ───────────────────────────────────────────────────────────────────────────
const getLedgerContainer = () => containerFor(ledgerContainerName, ledgerTtlSeconds);

// Returns the room's stored action items ([{ id, text }]) or [] if none.
async function loadActionItems(roomCode) {
  const key = normalize(roomCode);
  if (!key) return [];
  const c = getLedgerContainer();
  if (c) {
    try {
      const { resource } = await (await c).item(key, key).read();
      return resource ? resource.items || [] : [];
    } catch (err) {
      if (err.code === 404) return [];
      throw err;
    }
  }
  return ledgerMemory.get(key) || [];
}

async function saveActionItems(roomCode, items) {
  const key = normalize(roomCode);
  if (!key) return;
  const c = getLedgerContainer();
  if (c) {
    await (await c).items.upsert({ id: key, code: key, items, ttl: ledgerTtlSeconds });
  } else {
    ledgerMemory.set(key, items);
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
  realtime.notifyGroup('retro:' + board.code); // push a "changed" ping (no-op if unconfigured)
}

async function deleteBoard(code) {
  const norm = normalize(code);
  await removeRaw(norm);
  // Explicit "ended" so connected members are pushed out immediately instead of
  // waiting out the not-found miss tolerance (there is no polling while pushed).
  realtime.notifyGroup('retro:' + norm, { t: 'ended' });
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
  // Carry the room's action items from its previous retro into a review checklist.
  const carry = await loadActionItems(roomCode);
  const board = {
    code,
    name: (name || '').trim() || 'Sprint Retrospective',
    facilitatorId: pid,
    roomCode: normalize(roomCode) || null, // parent poker room — unlinked on end
    // Every retro opens on a review gate: the facilitator reviews last sprint's
    // action items, then unlocks the board ('active').
    phase: 'review', // 'review' | 'active'
    carryOverItems: carry.map((it) => ({ id: it.id, text: it.text, done: false })),
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

// A member removes themselves from the board (the facilitator ends instead).
function leaveBoard(board, participantId) {
  if (participantId === board.facilitatorId) return false;
  if (!board.participants[participantId]) return false;
  delete board.participants[participantId];
  return true;
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

// Review-phase mutators. During 'review' the facilitator ticks off last sprint's
// carried-over action items, then opens the board for the new sprint.
function toggleCarryOverItem(board, itemId) {
  const item = (board.carryOverItems || []).find((i) => i.id === itemId);
  if (!item) return false;
  item.done = !item.done;
  return true;
}

function openBoard(board) {
  board.phase = 'active';
}

// The action items authored in this retro (the "Action items" column), captured
// on end so the room's next retro can review them.
function actionItemsFromBoard(board) {
  const col = board.columns.find((c) => /action items/i.test(c.title));
  if (!col) return [];
  return board.notes.filter((n) => n.columnId === col.id).map((n) => ({ id: n.id, text: n.text }));
}

// Client-safe view. In this MVP every note is visible to everyone as soon as
// it's added (no hide-until-reveal), so we return the whole board.
function publicView(board) {
  return {
    code: board.code,
    name: board.name,
    facilitatorId: board.facilitatorId,
    roomCode: board.roomCode ?? null,
    phase: board.phase || 'active',
    carryOverItems: board.carryOverItems || [],
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
  leaveBoard,
  addNote,
  updateNote,
  deleteNote,
  toggleCarryOverItem,
  openBoard,
  actionItemsFromBoard,
  saveActionItems,
  publicView,
};
