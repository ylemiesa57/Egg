// The game's content: prompts and their ranked answers.
// Loaded from data/prompts/*.json into an in-memory SQLite database at startup.
// Player data (accounts, runs, statistics) lives in store.js instead.
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { key, findAnswer } = require('./match');

const PROMPT_DIR = path.join(__dirname, '..', 'data', 'prompts');

const TIERS = {
  10: 'SHELL',
  15: 'HALF-BAKED',
  30: 'CARTON',
  60: 'FREE RANGE',
  85: 'DOUBLE YOLK',
  100: 'GOLDEN EGG',
};

const db = new DatabaseSync(':memory:');
db.exec(`
  CREATE TABLE prompts (
    id INTEGER PRIMARY KEY,
    text TEXT NOT NULL UNIQUE,
    category TEXT NOT NULL DEFAULT 'misc'
  );
  CREATE TABLE answers (
    id INTEGER PRIMARY KEY,
    prompt_id INTEGER NOT NULL REFERENCES prompts(id),
    answer TEXT NOT NULL,
    pts INTEGER NOT NULL CHECK (pts IN (10, 15, 30, 60, 85, 100)),
    UNIQUE (prompt_id, answer)
  );
  CREATE TABLE answer_keys (
    prompt_id INTEGER NOT NULL REFERENCES prompts(id),
    key TEXT NOT NULL,
    answer_id INTEGER NOT NULL REFERENCES answers(id),
    PRIMARY KEY (prompt_id, key)
  );
`);

// Prompt ids follow file order, so add new prompts at the end of a file (or in a new file) to keep them stable.
function load() {
  const report = { prompts: 0, answers: 0, problems: [] };
  const addPrompt = db.prepare('INSERT INTO prompts (text, category) VALUES (?, ?) RETURNING id');
  const addAnswer = db.prepare('INSERT INTO answers (prompt_id, answer, pts) VALUES (?, ?, ?) RETURNING id');
  const addKey = db.prepare('INSERT INTO answer_keys (prompt_id, key, answer_id) VALUES (?, ?, ?)');

  db.exec('BEGIN');
  for (const file of fs.readdirSync(PROMPT_DIR).filter((f) => f.endsWith('.json')).sort()) {
    let list;
    try {
      list = JSON.parse(fs.readFileSync(path.join(PROMPT_DIR, file), 'utf8'));
    } catch (err) {
      report.problems.push(`${file}: ${err.message}`);
      continue;
    }
    for (const p of list) {
      if (!p.text || !Array.isArray(p.answers)) {
        report.problems.push(`${file}: malformed prompt ${JSON.stringify(p.text)}`);
        continue;
      }
      let promptId;
      try {
        promptId = addPrompt.get(p.text, p.category || 'misc').id;
      } catch {
        report.problems.push(`${file}: duplicate prompt "${p.text}"`);
        continue;
      }
      const usedKeys = new Map();
      const usedNames = new Set();
      for (const a of p.answers) {
        if (!a.a || !TIERS[a.pts] || usedNames.has(a.a)) {
          report.problems.push(`${p.text}: bad answer ${JSON.stringify(a)}`);
          continue;
        }
        usedNames.add(a.a);
        const answerId = addAnswer.get(promptId, a.a, a.pts).id;
        for (const name of [a.a, ...(a.alt || [])]) {
          const k = key(name);
          if (!k) continue;
          if (usedKeys.has(k)) {
            // spelling variants of one answer collapse to the same key; only a clash between answers matters
            if (usedKeys.get(k) !== answerId) report.problems.push(`${p.text}: "${name}" is claimed by two answers`);
            continue;
          }
          usedKeys.set(k, answerId);
          addKey.run(promptId, k, answerId);
        }
        report.answers++;
      }
      report.prompts++;
    }
  }
  db.exec('COMMIT');
  return report;
}

const report = load();

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

// Look up a typed answer. Returns { answer, pts, tier, exact } or null.
// exact: false means it is only a spelling suggestion.
function judge(promptId, raw) {
  const hit = findAnswer(keysFor(promptId), raw);
  if (!hit) return null;
  const row = db.prepare('SELECT answer, pts FROM answers WHERE id = ?').get(hit.id);
  return { answer: row.answer, pts: row.pts, tier: TIERS[row.pts], exact: hit.exact };
}

function allPromptIds() {
  return db.prepare('SELECT id FROM prompts ORDER BY id').all().map((r) => r.id);
}

function getPrompts(ids) {
  const get = db.prepare('SELECT id, text, category FROM prompts WHERE id = ?');
  return ids.map((id) => get.get(id)).filter(Boolean).map((p) => ({ ...p }));
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

module.exports = { TIERS, report, judge, allPromptIds, getPrompts, reveal };
