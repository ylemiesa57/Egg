// SQLite storage: prompts, ranked answers, lookup keys, runs, and missed answers.
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { key, findAnswer } = require('./match');

const ROOT = path.join(__dirname, '..');
const DB_PATH = process.env.EGGVOLUTION_DB || (process.env.VERCEL ? ':memory:' : path.join(ROOT, 'data', 'eggvolution.db'));
const PROMPT_DIR = path.join(ROOT, 'data', 'prompts');

const TIERS = {
  10: 'SHELL',
  15: 'HALF-BAKED',
  30: 'CARTON',
  60: 'FREE RANGE',
  85: 'DOUBLE YOLK',
  100: 'GOLDEN EGG',
};

const db = new DatabaseSync(DB_PATH);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS prompts (
    id INTEGER PRIMARY KEY,
    text TEXT NOT NULL UNIQUE,
    category TEXT NOT NULL DEFAULT 'misc'
  );
  CREATE TABLE IF NOT EXISTS answers (
    id INTEGER PRIMARY KEY,
    prompt_id INTEGER NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
    answer TEXT NOT NULL,
    pts INTEGER NOT NULL CHECK (pts IN (10, 15, 30, 60, 85, 100)),
    picks INTEGER NOT NULL DEFAULT 0,
    UNIQUE (prompt_id, answer)
  );
  CREATE TABLE IF NOT EXISTS answer_keys (
    prompt_id INTEGER NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    answer_id INTEGER NOT NULL REFERENCES answers(id) ON DELETE CASCADE,
    PRIMARY KEY (prompt_id, key)
  );
  CREATE TABLE IF NOT EXISTS runs (
    id INTEGER PRIMARY KEY,
    mode TEXT NOT NULL,
    number INTEGER NOT NULL,
    name TEXT NOT NULL,
    score INTEGER NOT NULL,
    detail TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS runs_by_game ON runs (mode, number, score);
  CREATE TABLE IF NOT EXISTS misses (
    prompt_id INTEGER NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    raw TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (prompt_id, key)
  );
`);

// Sync the JSON seed files into the database. Safe to re-run: prompts are
// matched by text, answers by name (so pick counts survive a re-seed).
function seed() {
  const files = fs.readdirSync(PROMPT_DIR).filter((f) => f.endsWith('.json')).sort();
  const report = { prompts: 0, answers: 0, problems: [] };
  const upsertPrompt = db.prepare(
    'INSERT INTO prompts (text, category) VALUES (?, ?) ON CONFLICT(text) DO UPDATE SET category = excluded.category RETURNING id'
  );
  const upsertAnswer = db.prepare(
    'INSERT INTO answers (prompt_id, answer, pts) VALUES (?, ?, ?) ON CONFLICT(prompt_id, answer) DO UPDATE SET pts = excluded.pts RETURNING id'
  );
  const insertKey = db.prepare('INSERT OR IGNORE INTO answer_keys (prompt_id, key, answer_id) VALUES (?, ?, ?)');
  const seenPrompts = [];
  let unreadable = false;

  db.exec('BEGIN');
  try {
    for (const file of files) {
      let list;
      try {
        list = JSON.parse(fs.readFileSync(path.join(PROMPT_DIR, file), 'utf8'));
      } catch (err) {
        report.problems.push(`${file}: ${err.message}`);
        unreadable = true;
        continue;
      }
      for (const p of list) {
        if (!p.text || !Array.isArray(p.answers)) {
          report.problems.push(`${file}: malformed prompt ${JSON.stringify(p.text)}`);
          continue;
        }
        const promptId = upsertPrompt.get(p.text, p.category || 'misc').id;
        seenPrompts.push(promptId);
        db.prepare('DELETE FROM answer_keys WHERE prompt_id = ?').run(promptId);
        const keep = [];
        const usedKeys = new Map();
        for (const a of p.answers) {
          if (!a.a || !TIERS[a.pts]) {
            report.problems.push(`${p.text}: bad answer ${JSON.stringify(a)}`);
            continue;
          }
          const answerId = upsertAnswer.get(promptId, a.a, a.pts).id;
          keep.push(answerId);
          for (const name of [a.a, ...(a.alt || [])]) {
            const k = key(name);
            if (!k) continue;
            if (usedKeys.has(k)) {
              // spelling variants of one answer collapse to the same key; only a clash between answers matters
              if (usedKeys.get(k) !== answerId) report.problems.push(`${p.text}: "${name}" is claimed by two answers`);
              continue;
            }
            usedKeys.set(k, answerId);
            insertKey.run(promptId, k, answerId);
          }
          report.answers++;
        }
        db.prepare(
          `DELETE FROM answers WHERE prompt_id = ? AND id NOT IN (${keep.map(() => '?').join(',') || 'NULL'})`
        ).run(promptId, ...keep);
        report.prompts++;
      }
    }
    // never prune prompts on the strength of a file we couldn't read
    if (seenPrompts.length && !unreadable) {
      db.prepare(`DELETE FROM prompts WHERE id NOT IN (${seenPrompts.map(() => '?').join(',')})`).run(...seenPrompts);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  keyCache.clear();
  return report;
}

const keyCache = new Map();
function keysFor(promptId) {
  let keys = keyCache.get(promptId);
  if (!keys) {
    keys = new Map();
    for (const row of db.prepare('SELECT key, answer_id FROM answer_keys WHERE prompt_id = ?').all(promptId)) {
      keys.set(row.key, row.answer_id);
    }
    keyCache.set(promptId, keys);
  }
  return keys;
}

// Look up a typed answer. Returns { id, answer, pts, tier } or null.
function judge(promptId, raw) {
  const id = findAnswer(keysFor(promptId), raw);
  if (id == null) return null;
  const row = db.prepare('SELECT id, answer, pts, picks FROM answers WHERE id = ?').get(id);
  return { ...row, tier: TIERS[row.pts] };
}

function recordPick(answerId) {
  db.prepare('UPDATE answers SET picks = picks + 1 WHERE id = ?').run(answerId);
}

function recordMiss(promptId, raw) {
  const k = key(raw);
  if (!k || k.length > 60) return;
  db.prepare(
    'INSERT INTO misses (prompt_id, key, raw) VALUES (?, ?, ?) ON CONFLICT(prompt_id, key) DO UPDATE SET count = count + 1'
  ).run(promptId, k, String(raw).slice(0, 80));
}

// Share of players who gave this answer, once there's enough data to mean something.
function pickShare(promptId, answerId) {
  const total = db.prepare('SELECT SUM(picks) AS n FROM answers WHERE prompt_id = ?').get(promptId).n || 0;
  if (total < 10) return null;
  const mine = db.prepare('SELECT picks FROM answers WHERE id = ?').get(answerId).picks;
  return Math.round((mine / total) * 100);
}

function allPromptIds() {
  return db.prepare('SELECT id FROM prompts ORDER BY id').all().map((r) => r.id);
}

function getPrompts(ids) {
  const get = db.prepare('SELECT id, text, category FROM prompts WHERE id = ?');
  return ids.map((id) => get.get(id)).filter(Boolean);
}

// The golden egg plus a couple of deep cuts, shown after a game ends.
function reveal(promptId) {
  const rows = db
    .prepare('SELECT answer, pts FROM answers WHERE prompt_id = ? AND pts >= 85 ORDER BY pts DESC, answer')
    .all(promptId);
  return {
    golden: rows.find((r) => r.pts === 100)?.answer || null,
    deepCuts: rows.filter((r) => r.pts === 85).slice(0, 3).map((r) => r.answer),
  };
}

function saveRun({ mode, number, name, score, detail }) {
  db.prepare('INSERT INTO runs (mode, number, name, score, detail) VALUES (?, ?, ?, ?, ?)').run(
    mode,
    number,
    name,
    score,
    JSON.stringify(detail)
  );
}

function standings(mode, number, score) {
  const total = db.prepare('SELECT COUNT(*) AS n FROM runs WHERE mode = ? AND number = ?').get(mode, number).n;
  const below = db
    .prepare('SELECT COUNT(*) AS n FROM runs WHERE mode = ? AND number = ? AND score < ?')
    .get(mode, number, score).n;
  const top = db
    .prepare('SELECT name, score FROM runs WHERE mode = ? AND number = ? ORDER BY score DESC, id LIMIT 5')
    .all(mode, number);
  return { total, below, top };
}

module.exports = {
  db,
  TIERS,
  seed,
  judge,
  recordPick,
  recordMiss,
  pickShare,
  allPromptIds,
  getPrompts,
  reveal,
  saveRun,
  standings,
};
