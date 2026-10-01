// Accounts and leaderboards: the sign-in dialog, the leaderboard dialog,
// and the small account row on the title screen.
(function () {
  const OE = window.OE;
  const $ = (id) => document.getElementById(id);
  const listeners = [];
  let user = null;
  let dailyRunId = null;
  let authMode = 'login';
  let pendingAuth = null;

  async function api(path, body) {
    const res = await fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Something went wrong. Try again.');
    return data;
  }

  function render() {
    $('account-name').textContent = user ? `@${user.username}` : 'Playing as a guest';
    $('account-action').textContent = user ? 'Sign out' : 'Sign in';
  }

  function setUser(next) {
    user = next;
    render();
    listeners.forEach((fn) => fn(user));
  }

  /* ---------- sign in / create account ---------- */

  function setAuthMode(mode) {
    authMode = mode;
    const signup = mode === 'signup';
    $('auth-title').textContent = signup ? 'Create an account' : 'Sign in';
    $('auth-submit').textContent = signup ? 'Create account' : 'Sign in';
    $('auth-switch').textContent = signup ? 'Have an account? Sign in' : 'New here? Create an account';
    $('auth-password').autocomplete = signup ? 'new-password' : 'current-password';
    $('auth-note').hidden = !signup;
    $('auth-error').textContent = '';
  }

  // Resolves with the user once they sign in, or null if they close the dialog.
  function openAuth(reason) {
    setAuthMode('login');
    $('auth-reason').textContent = reason || 'Save your scores and climb the leaderboard.';
    $('auth-form').reset();
    $('auth').showModal();
    return new Promise((resolve) => {
      pendingAuth = resolve;
    });
  }

  $('auth-switch').addEventListener('click', () => setAuthMode(authMode === 'login' ? 'signup' : 'login'));
  $('auth-close').addEventListener('click', () => $('auth').close());
  $('auth').addEventListener('close', () => {
    if (pendingAuth) pendingAuth(user);
    pendingAuth = null;
  });
  $('auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const submit = $('auth-submit');
    submit.disabled = true;
    $('auth-error').textContent = '';
    try {
      const data = await api(authMode === 'signup' ? '/api/signup' : '/api/login', {
        username: $('auth-username').value.trim(),
        password: $('auth-password').value,
      });
      setUser(data.user);
      $('auth').close();
    } catch (err) {
      $('auth-error').textContent = err.message;
    } finally {
      submit.disabled = false;
    }
  });

  $('account-action').addEventListener('click', async () => {
    if (!user) return openAuth();
    await api('/api/logout', {}).catch(() => {});
    // a signed-out page should not keep showing the account's daily result
    location.reload();
  });

  /* ---------- leaderboard ---------- */

  const BOARD_COLUMNS = {
    today: { score: 'Score', extra: null },
    alltime: { score: 'Total', extra: (r) => `${r.games} ${r.games === 1 ? 'roll' : 'rolls'} · best ${r.best}` },
    quest: { score: 'Best', extra: (r) => `${r.slain || 0} slain · ${r.games} ${r.games === 1 ? 'quest' : 'quests'}` },
  };

  function boardRow(r, columns) {
    const tr = document.createElement('tr');
    if (r.you) tr.className = 'you';
    const cell = (text, cls) => {
      const td = document.createElement('td');
      td.textContent = text;
      if (cls) td.className = cls;
      tr.append(td);
    };
    cell(r.rank, 'rank');
    cell(r.username + (r.you ? ' (you)' : ''), 'who');
    cell(columns.extra ? columns.extra(r) : '', 'extra');
    cell(r.score, 'num');
    return tr;
  }

  async function loadBoard(board) {
    for (const tab of document.querySelectorAll('#board-tabs button')) {
      tab.setAttribute('aria-selected', String(tab.dataset.board === board));
    }
    const body = $('board-body');
    const status = $('board-status');
    body.replaceChildren();
    status.textContent = 'Loading…';
    try {
      const data = await api(`/api/leaderboard?board=${board}`);
      const columns = BOARD_COLUMNS[data.board];
      $('board-score-head').textContent = columns.score;
      body.replaceChildren(...data.rows.map((r) => boardRow(r, columns)));
      // show the signed-in player's own row even when it falls outside the top 25
      if (data.me && data.me.rank > data.rows.length) body.append(boardRow(data.me, columns));
      status.textContent = data.rows.length
        ? data.board === 'today'
          ? `Roll #${data.number} · ${data.players} ${data.players === 1 ? 'player' : 'players'}`
          : `${data.players} ${data.players === 1 ? 'player' : 'players'}`
        : data.board === 'today'
          ? 'Nobody has saved a roll today. Be the first.'
          : 'No scores yet.';
      $('board-hint').hidden = !!user;
    } catch (err) {
      status.textContent = err.message;
    }
  }

  function openBoard(board) {
    $('board').showModal();
    loadBoard(board || (OE.mode === 'quest' ? 'quest' : 'today'));
  }

  $('board-tabs').addEventListener('click', (e) => {
    const tab = e.target.closest('button[data-board]');
    if (tab) loadBoard(tab.dataset.board);
  });
  $('board-close').addEventListener('click', () => $('board').close());
  $('board-signin').addEventListener('click', async () => {
    $('board').close();
    if (await openAuth()) openBoard();
  });
  for (const btn of document.querySelectorAll('[data-open-board]')) btn.addEventListener('click', () => openBoard());

  OE.account = {
    api,
    get user() {
      return user;
    },
    get dailyRunId() {
      return dailyRunId;
    },
    onChange(fn) {
      listeners.push(fn);
    },
    openAuth,
    openBoard,
    // resolves once we know who (if anyone) is signed in
    ready: api('/api/me')
      .then((me) => {
        user = me.user;
        dailyRunId = me.dailyRunId;
        // a server with no database can't keep accounts, so don't offer them
        document.body.classList.toggle('no-accounts', me.accounts === false);
      })
      .catch(() => {})
      .then(render),
  };
})();
