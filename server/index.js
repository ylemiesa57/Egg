// Eggvolution server: static files + a small JSON API. No dependencies.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const store = require('./db');

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
  const ids = store.allPromptIds();
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
      ids = shuffled(store.allPromptIds(), Math.random).slice(0, PROMPTS_PER_GAME);
    }
    send(res, 200, { mode, number, prompts: store.getPrompts(ids) });
  },

  'POST /api/answer': async (req, res) => {
    const { promptId, answer } = await readJson(req);
    if (!Number.isInteger(promptId) || typeof answer !== 'string') return send(res, 400, { error: 'bad request' });
    const hit = store.judge(promptId, answer.slice(0, 80));
    if (!hit) {
      store.recordMiss(promptId, answer);
      return send(res, 200, { ok: false });
    }
    store.recordPick(hit.id);
    send(res, 200, {
      ok: true,
      answer: hit.answer,
      pts: hit.pts,
      tier: hit.tier,
      share: store.pickShare(promptId, hit.id),
    });
  },

  // Scores are recomputed here from the submitted answers, never trusted from the client.
  'POST /api/run': async (req, res) => {
    const body = await readJson(req);
    const mode = body.mode === 'unlimited' ? 'unlimited' : 'daily';
    const number = mode === 'daily' ? dailyNumber() : Number(body.number) || 0;
    const picks = Array.isArray(body.picks) ? body.picks.slice(0, PROMPTS_PER_GAME) : [];
    const allowed = mode === 'daily' ? new Set(dailyPromptIds(number)) : null;
    const seen = new Set();
    let score = 0;
    const detail = [];
    for (const p of picks) {
      if (!Number.isInteger(p.promptId) || seen.has(p.promptId)) continue;
      if (allowed && !allowed.has(p.promptId)) continue;
      seen.add(p.promptId);
      const hit = typeof p.answer === 'string' ? store.judge(p.promptId, p.answer) : null;
      score += hit ? hit.pts : 0;
      detail.push({ promptId: p.promptId, answer: hit ? hit.answer : null, pts: hit ? hit.pts : 0 });
    }
    const name = String(body.name || '').replace(/[^\p{L}\p{N} _.'-]/gu, '').trim().slice(0, 20) || 'anonymous egg';
    if (mode === 'daily') store.saveRun({ mode, number, name, score, detail });
    const reveals = {};
    for (const id of seen) reveals[id] = store.reveal(id);
    send(res, 200, { score, reveals, standings: mode === 'daily' ? store.standings(mode, number, score) : null });
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
    console.error(err);
    if (!res.headersSent) send(res, 500, { error: 'server error' });
  }
}

if (process.env.VERCEL) {
  // serverless: each instance seeds its own in-memory database on cold start
  store.seed();
} else if (require.main === module) {
  const report = store.seed();
  for (const p of report.problems) console.warn('seed: ' + p);
  http.createServer(handler).listen(PORT, () => {
    console.log(`Eggvolution — ${report.prompts} prompts, ${report.answers} answers`);
    console.log(`http://localhost:${PORT}`);
  });
}

module.exports = { handler, dailyNumber, dailyPromptIds };
