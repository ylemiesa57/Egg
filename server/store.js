// Persistent storage for accounts, sessions, runs and answer statistics.
//
// One SQL dialect (SQLite), two backends:
//   - Turso over HTTP when TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are set (production)
//   - a local file through node:sqlite otherwise (in memory on Vercel, where there is no disk)
const path = require('node:path');

const TURSO_URL = process.env.TURSO_DATABASE_URL;
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL,
    username_key TEXT NOT NULL UNIQUE,
    pass_hash TEXT NOT NULL,
    pass_salt TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    expires_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS login_attempts (
    username_key TEXT PRIMARY KEY,
    count INTEGER NOT NULL,
    window_start INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS runs (
    id INTEGER PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    mode TEXT NOT NULL,
    number INTEGER NOT NULL,
    score INTEGER NOT NULL,
    slain INTEGER,
    claim_hash TEXT,
    detail TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS runs_by_mode ON runs (mode, number, score)`,
  // one saved daily roll per account per day
  `CREATE UNIQUE INDEX IF NOT EXISTS runs_one_daily ON runs (user_id, number) WHERE mode = 'daily' AND user_id IS NOT NULL`,
  `CREATE TABLE IF NOT EXISTS picks (
    prompt TEXT NOT NULL,
    answer TEXT NOT NULL,
    pts INTEGER NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (prompt, answer)
  )`,
  `CREATE TABLE IF NOT EXISTS misses (
    prompt TEXT NOT NULL,
    key TEXT NOT NULL,
    raw TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (prompt, key)
  )`,
];

/* ---------- local backend ---------- */

function localBackend() {
  const { DatabaseSync } = require('node:sqlite');
  const file =
    process.env.EGGVOLUTION_DB || (process.env.VERCEL ? ':memory:' : path.join(__dirname, '..', 'data', 'eggvolution.db'));
  const db = new DatabaseSync(file);
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL');
  return {
    name: file === ':memory:' ? 'memory' : 'sqlite file',
    async batch(stmts, { tx } = {}) {
      if (tx) db.exec('BEGIN');
      try {
        const out = stmts.map(([sql, args = []]) => db.prepare(sql).all(...args).map((row) => ({ ...row })));
        if (tx) db.exec('COMMIT');
        return out;
      } catch (err) {
        if (tx) db.exec('ROLLBACK');
        throw err;
      }
    },
  };
}

/* ---------- Turso backend (Hrana over HTTP, no client library needed) ---------- */

function encode(v) {
  if (v === null || v === undefined) return { type: 'null' };
  if (typeof v === 'number') return Number.isInteger(v) ? { type: 'integer', value: String(v) } : { type: 'float', value: v };
  return { type: 'text', value: String(v) };
}

function decode(cell) {
  if (cell.type === 'null') return null;
  if (cell.type === 'integer') return Number(cell.value);
  return cell.value;
}

function tursoBackend() {
  const endpoint = TURSO_URL.replace(/^libsql:\/\//, 'https://').replace(/\/$/, '') + '/v2/pipeline';
  return {
    name: 'turso',
    async batch(stmts, { tx } = {}) {
      const list = tx ? [['BEGIN'], ...stmts, ['COMMIT']] : stmts;
      const requests = list.map(([sql, args = []]) => ({ type: 'execute', stmt: { sql, args: args.map(encode) } }));
      requests.push({ type: 'close' });
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${TURSO_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ requests }),
      });
      if (!res.ok) throw new Error(`database request failed: ${res.status}`);
      const { results } = await res.json();
      const out = [];
      for (let i = 0; i < list.length; i++) {
        const r = results[i];
        if (!r || r.type !== 'ok') throw new Error((r && r.error && r.error.message) || 'database statement failed');
        const { cols, rows } = r.response.result;
        out.push(rows.map((row) => Object.fromEntries(row.map((cell, j) => [cols[j].name, decode(cell)]))));
      }
      return tx ? out.slice(1, -1) : out;
    },
  };
}

const backend = TURSO_URL && TURSO_TOKEN ? tursoBackend() : localBackend();

let ready;
function init() {
  ready = ready || backend.batch(SCHEMA.map((sql) => [sql]));
  return ready;
}

// Run several statements in one round trip. Each is [sql, args]. Returns one row array per statement.
async function batch(stmts, opts) {
  await init();
  return backend.batch(stmts, opts);
}

async function all(sql, args) {
  return (await batch([[sql, args]]))[0];
}

async function get(sql, args) {
  return (await all(sql, args))[0] || null;
}

const isUniqueViolation = (err) => /UNIQUE constraint failed/i.test(String(err && err.message));

// Without a real database (serverless with no Turso configured) each function instance
// has its own throwaway memory, so accounts and leaderboards cannot work.
const persistent = backend.name !== 'memory';

module.exports = { batch, all, get, isUniqueViolation, backendName: backend.name, persistent };
