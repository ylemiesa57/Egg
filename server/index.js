// Eggvolution server: static files + a small JSON API. No dependencies.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const content = require('./db');
const store = require('./store');
const auth = require('./auth');
const stats = require('./stats');

const PORT = Number(process.env.PORT) || 4747;
const PUBLIC = path.join(__dirname, '..', 'public');
const PROMPTS_PER_GAME = 7;
const LAUNCH = new Date(2026, 9, 1); // roll #1

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(list, rand) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function dailyNumber(now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(1, Math.round((today - LAUNCH) / 86400000) + 1);
}

// Each cycle is one seeded shuffle of every prompt, dealt out seven per day,
// so no prompt repeats until the whole deck has been played.
function dailyPromptIds(number) {
  const ids = content.allPromptIds();
  const daysPerCycle = Math.max(1, Math.floor(ids.length / PROMPTS_PER_GAME));
  const cycle = Math.floor((number - 1) / daysPerCycle);
  const slot = (number - 1) % daysPerCycle;
  const deck = shuffled(ids, mulberry32(0xe99 + cycle * 7919));
  return deck.slice(slot * PROMPTS_PER_GAME, (slot + 1) * PROMPTS_PER_GAME);
}

function send(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(data);
}

function readJson(req) {
  // Vercel's Node runtime has already read and parsed the body
  if (req.body !== undefined) {
    return Promise.resolve(typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {});
  }
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > 20000) {
        reject(new Error('body too large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

const now = () => Math.floor(Date.now() / 1000);

// Everything the end screen needs for one saved run: the answers, the golden eggs,
// where the score sits on the curve, and how each answer compares.
async function buildResult(run, extra = {}) {
  const picks = JSON.parse(run.detail);
  const prompts = picks.map((p) => p.text);
  const [[agg], pickRows, [today], [below]] = await store.batch([
    ['SELECT COUNT(*) AS n, SUM(score) AS sum, SUM(score * score) AS sumsq FROM runs WHERE mode = ?', [run.mode]],
    [`SELECT prompt, answer, pts, count FROM picks WHERE prompt IN (${prompts.map(() => '?').join(',') || "''"})`, prompts],
    ['SELECT COUNT(*) AS n FROM runs WHERE mode = ? AND number = ?', [run.mode, run.number]],
    ['SELECT COUNT(*) AS n FROM runs WHERE mode = ? AND number = ? AND score < ?', [run.mode, run.number, run.score]],
  ]);
  const reveals = {};
  for (const p of picks) reveals[p.promptId] = content.reveal(p.promptId);
  return {
    runId: run.id,
    mode: run.mode,
    number: run.number,
    score: run.score,
    picks,
    reveals,
    saved: run.user_id != null,
    quest: run.mode === 'quest' ? { slain: run.slain || 0 } : null,
    standings: run.mode === 'daily' ? { total: today.n, below: below.n } : null,
    analysis: {
      curve: stats.scoreCurve(agg, run.score),
      answers: picks.map((p) =>
        p.answer ? stats.answerStanding(pickRows.filter((r) => r.prompt === p.text), p.answer, p.pts) : null
      ),
    },
    ...extra,
  };
}

function requireAccounts() {
  if (!store.persistent) throw new auth.AuthError(503, 'Accounts are not available on this server yet.');
}

function requireUser(user) {
  if (!user) throw new auth.AuthError(401, 'Sign in first.');
}

const BOARDS = {
  today: (number) => [
    `SELECT u.id AS uid, u.username, r.score, r.id AS tiebreak FROM runs r JOIN users u ON u.id = r.user_id
     WHERE r.mode = 'daily' AND r.number = ? ORDER BY r.score DESC, r.id ASC LIMIT 1000`,
    [number],
  ],
  alltime: () => [
    `SELECT u.id AS uid, u.username, SUM(r.score) AS score, COUNT(*) AS games, MAX(r.score) AS best
     FROM runs r JOIN users u ON u.id = r.user_id WHERE r.mode = 'daily'
     GROUP BY u.id, u.username ORDER BY score DESC, games ASC LIMIT 1000`,
    [],
  ],
  quest: () => [
    `SELECT u.id AS uid, u.username, MAX(r.score) AS score, COUNT(*) AS games, MAX(r.slain) AS slain
     FROM runs r JOIN users u ON u.id = r.user_id WHERE r.mode = 'quest'
     GROUP BY u.id, u.username ORDER BY score DESC, games ASC LIMIT 1000`,
    [],
  ],
};

const routes = {
  'GET /api/game': (req, res, url) => {
    const mode = url.searchParams.get('mode') === 'unlimited' ? 'unlimited' : 'daily';
    let number;
    let ids;
    if (mode === 'daily') {
      number = dailyNumber();
      ids = dailyPromptIds(number);
    } else {
      number = Math.floor(Math.random() * 1e9);
      ids = shuffled(content.allPromptIds(), Math.random).slice(0, PROMPTS_PER_GAME);
    }
    send(res, 200, { mode, number, prompts: content.getPrompts(ids) });
  },

  'POST /api/answer': async (req, res) => {
    const { promptId, answer } = await readJson(req);
    if (!Number.isInteger(promptId) || typeof answer !== 'string') return send(res, 400, { error: 'bad request' });
    const hit = content.judge(promptId, answer.slice(0, 80));
    if (hit && hit.exact) return send(res, 200, { ok: true, answer: hit.answer, pts: hit.pts, tier: hit.tier });
    // a near miss is offered back as a spelling suggestion rather than silently accepted
    if (hit) return send(res, 200, { ok: false, suggest: hit.answer });
    const [prompt] = content.getPrompts([promptId]);
    const key = answer.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 60);
    if (prompt && key) {
      await store.all(
        'INSERT INTO misses (prompt, key, raw) VALUES (?, ?, ?) ON CONFLICT(prompt, key) DO UPDATE SET count = count + 1',
        [prompt.text, key, answer.slice(0, 80)]
      );
    }
    send(res, 200, { ok: false });
  },

  'GET /api/me': async (req, res) => {
    if (!store.persistent) return send(res, 200, { user: null, dailyRunId: null, accounts: false });
    const user = await auth.currentUser(req);
    const number = dailyNumber();
    let dailyRunId = null;
    if (user) {
      const run = await store.get("SELECT id FROM runs WHERE user_id = ? AND mode = 'daily' AND number = ?", [user.id, number]);
      dailyRunId = run ? run.id : null;
    }
    send(res, 200, { user: user && { username: user.username }, dailyRunId, accounts: true });
  },

  'POST /api/signup': async (req, res) => {
    requireAccounts();
    const { username, password } = await readJson(req);
    const user = await auth.signup(username, password);
    res.setHeader('Set-Cookie', await auth.startSession(user.id));
    send(res, 200, { user: { username: user.username } });
  },

  'POST /api/login': async (req, res) => {
    requireAccounts();
    const { username, password } = await readJson(req);
    const user = await auth.login(username, password);
    res.setHeader('Set-Cookie', await auth.startSession(user.id));
    send(res, 200, { user: { username: user.username } });
  },

  'POST /api/logout': async (req, res) => {
    res.setHeader('Set-Cookie', await auth.endSession(req));
    send(res, 200, { ok: true });
  },

  // Scores are recomputed here from the submitted answers, never trusted from the client.
  'POST /api/run': async (req, res) => {
    const body = await readJson(req);
    const mode = ['daily', 'unlimited', 'quest'].includes(body.mode) ? body.mode : 'daily';
    const number = mode === 'daily' ? dailyNumber() : Number(body.number) || 0;
    const submitted = Array.isArray(body.picks) ? body.picks.slice(0, PROMPTS_PER_GAME) : [];
    const allowed = mode === 'daily' ? new Set(dailyPromptIds(number)) : null;
    const seen = new Set();
    const picks = [];
    for (const p of submitted) {
      if (!Number.isInteger(p.promptId) || seen.has(p.promptId)) continue;
      if (allowed && !allowed.has(p.promptId)) continue;
      const [prompt] = content.getPrompts([p.promptId]);
      if (!prompt) continue;
      seen.add(p.promptId);
      const hit = typeof p.answer === 'string' ? content.judge(p.promptId, p.answer.slice(0, 80)) : null;
      const ok = hit && hit.exact;
      picks.push({ promptId: p.promptId, text: prompt.text, answer: ok ? hit.answer : null, pts: ok ? hit.pts : 0 });
    }
    const score = picks.reduce((sum, p) => sum + p.pts, 0);
    const slain = mode === 'quest' ? picks.filter((p) => p.pts >= 60).length : null;
    const user = store.persistent ? await auth.currentUser(req) : null;

    if (user && mode === 'daily') {
      const existing = await store.get("SELECT * FROM runs WHERE user_id = ? AND mode = 'daily' AND number = ?", [user.id, number]);
      if (existing) return send(res, 200, await buildResult(existing, { already: true }));
    }

    // guests get a token so the run can be attached to an account if they sign in afterwards
    const claim = user || !store.persistent ? null : require('node:crypto').randomBytes(18).toString('base64url');
    const [[run]] = await store.batch(
      [
        [
          'INSERT INTO runs (user_id, mode, number, score, slain, claim_hash, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *',
          [user ? user.id : null, mode, number, score, slain, claim && auth.sha256(claim), JSON.stringify(picks), now()],
        ],
        ...picks
          .filter((p) => p.answer)
          .map((p) => [
            `INSERT INTO picks (prompt, answer, pts, count) VALUES (?, ?, ?, 1)
             ON CONFLICT(prompt, answer) DO UPDATE SET count = count + 1, pts = excluded.pts`,
            [p.text, p.answer, p.pts],
          ]),
      ],
      { tx: true }
    );
    send(res, 200, await buildResult(run, { claim }));
  },

  'POST /api/claim': async (req, res) => {
    const user = await auth.currentUser(req);
    requireUser(user);
    const { runId, claim } = await readJson(req);
    if (!Number.isInteger(runId) || typeof claim !== 'string') return send(res, 400, { error: 'bad request' });
    try {
      const run = await store.get(
        'UPDATE runs SET user_id = ?, claim_hash = NULL WHERE id = ? AND claim_hash = ? AND user_id IS NULL RETURNING *',
        [user.id, runId, auth.sha256(claim)]
      );
      if (!run) return send(res, 404, { error: 'That run is no longer available to save.' });
      send(res, 200, await buildResult(run));
    } catch (err) {
      if (store.isUniqueViolation(err)) return send(res, 409, { error: 'You already have a roll saved for today.' });
      throw err;
    }
  },

  'GET /api/result': async (req, res, url) => {
    const user = await auth.currentUser(req);
    requireUser(user);
    const run = await store.get('SELECT * FROM runs WHERE id = ? AND user_id = ?', [Number(url.searchParams.get('id')) || 0, user.id]);
    if (!run) return send(res, 404, { error: 'not found' });
    send(res, 200, await buildResult(run));
  },

  'GET /api/leaderboard': async (req, res, url) => {
    const board = BOARDS[url.searchParams.get('board')] ? url.searchParams.get('board') : 'today';
    const number = dailyNumber();
    const [user, rows] = await Promise.all([auth.currentUser(req), store.all(...BOARDS[board](number))]);
    const ranked = rows.map((r, i) => ({
      rank: i + 1,
      username: r.username,
      score: r.score,
      games: r.games,
      best: r.best,
      slain: r.slain,
      you: !!user && r.uid === user.id,
    }));
    const me = ranked.find((r) => r.you) || null;
    send(res, 200, { board, number, players: ranked.length, rows: ranked.slice(0, 25), me });
  },
};

function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/index.html';
  const file = path.join(PUBLIC, path.normalize(rel));
  if (!file.startsWith(PUBLIC + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
}

async function handler(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const route = routes[`${req.method} ${url.pathname}`];
  if (!route) {
    if (url.pathname.startsWith('/api/')) return send(res, 404, { error: 'not found' });
    return serveStatic(req, res, url);
  }
  try {
    await route(req, res, url);
  } catch (err) {
    if (err instanceof auth.AuthError) return send(res, err.status, { error: err.message });
    console.error(err);
    if (!res.headersSent) send(res, 500, { error: 'server error' });
  }
}

if (require.main === module) {
  const { report } = content;
  for (const p of report.problems) console.warn('content: ' + p);
  http.createServer(handler).listen(PORT, () => {
    console.log(`Eggvolution — ${report.prompts} prompts, ${report.answers} answers (player data: ${store.backendName})`);
    console.log(`http://localhost:${PORT}`);
  });
}

module.exports = { handler, dailyNumber, dailyPromptIds };
