// Accounts: username + password, with a session cookie.
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const store = require('./store');

const scrypt = promisify(crypto.scrypt);
const COOKIE = 'egg_session';
const SESSION_DAYS = 30;
const MAX_ATTEMPTS = 10;
const ATTEMPT_WINDOW = 15 * 60;

const now = () => Math.floor(Date.now() / 1000);
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const userKey = (name) => name.toLowerCase();

class AuthError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function checkCredentials(username, password) {
  if (typeof username !== 'string' || !/^[A-Za-z0-9_-]{3,20}$/.test(username)) {
    throw new AuthError(400, 'Usernames are 3–20 letters, numbers, dashes or underscores.');
  }
  if (typeof password !== 'string' || password.length < 8 || password.length > 200) {
    throw new AuthError(400, 'Passwords need at least 8 characters.');
  }
}

async function hashPassword(password, salt) {
  return (await scrypt(password, salt, 64)).toString('hex');
}

async function signup(username, password) {
  checkCredentials(username, password);
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = await hashPassword(password, salt);
  try {
    const row = await store.get(
      'INSERT INTO users (username, username_key, pass_hash, pass_salt, created_at) VALUES (?, ?, ?, ?, ?) RETURNING id, username',
      [username, userKey(username), hash, salt, now()]
    );
    return row;
  } catch (err) {
    if (store.isUniqueViolation(err)) throw new AuthError(409, 'That username is taken.');
    throw err;
  }
}

async function login(username, password) {
  if (typeof username !== 'string' || typeof password !== 'string') throw new AuthError(400, 'Enter a username and password.');
  const key = userKey(username.slice(0, 40));
  const [[attempt], [user]] = await store.batch([
    ['SELECT count, window_start FROM login_attempts WHERE username_key = ?', [key]],
    ['SELECT id, username, pass_hash, pass_salt FROM users WHERE username_key = ?', [key]],
  ]);
  const live = attempt && now() - attempt.window_start < ATTEMPT_WINDOW;
  if (live && attempt.count >= MAX_ATTEMPTS) throw new AuthError(429, 'Too many attempts. Try again in a few minutes.');

  // hash even when the user doesn't exist, so the response time doesn't reveal which names are taken
  const hash = await hashPassword(password, user ? user.pass_salt : 'no-such-user');
  const ok = user && crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(user.pass_hash, 'hex'));
  if (!ok) {
    await store.all(
      `INSERT INTO login_attempts (username_key, count, window_start) VALUES (?, 1, ?)
       ON CONFLICT(username_key) DO UPDATE SET
         count = CASE WHEN ? - window_start >= ? THEN 1 ELSE count + 1 END,
         window_start = CASE WHEN ? - window_start >= ? THEN ? ELSE window_start END`,
      [key, now(), now(), ATTEMPT_WINDOW, now(), ATTEMPT_WINDOW, now()]
    );
    throw new AuthError(401, 'Wrong username or password.');
  }
  if (attempt) await store.all('DELETE FROM login_attempts WHERE username_key = ?', [key]);
  return { id: user.id, username: user.username };
}

// Creates a session and returns the Set-Cookie header value.
async function startSession(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  await store.all('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)', [
    sha256(token),
    userId,
    now() + SESSION_DAYS * 86400,
  ]);
  return cookie(token, SESSION_DAYS * 86400);
}

function cookie(value, maxAge) {
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${process.env.VERCEL ? '; Secure' : ''}`;
}

function tokenFrom(req) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const [name, value] = part.trim().split('=');
    if (name === COOKIE && value) return value;
  }
  return null;
}

// The signed-in user for this request, or null.
async function currentUser(req) {
  const token = tokenFrom(req);
  if (!token) return null;
  return store.get(
    'SELECT u.id, u.username FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?',
    [sha256(token), now()]
  );
}

// Ends the session and returns the Set-Cookie header value that clears it.
async function endSession(req) {
  const token = tokenFrom(req);
  if (token) await store.all('DELETE FROM sessions WHERE token_hash = ?', [sha256(token)]);
  return cookie('', 0);
}

module.exports = { AuthError, signup, login, startSession, endSession, currentUser, sha256 };
