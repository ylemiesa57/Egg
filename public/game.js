// Game flow: title → seven timed prompts → reveal + roll → end card.
(function () {
  const OE = window.OE;
  const world = OE.world;
  const $ = (id) => document.getElementById(id);

  const SECONDS = 25;
  const TIERS = [
    { pts: 10, name: 'SHELL', color: '#e4dccb', emoji: '⚪', flavor: "Everyone's first crack at it." },
    { pts: 15, name: 'HALF-BAKED', color: '#d8b98a', emoji: '🟤', flavor: 'Felt clever. The whole carton thought so too.' },
    { pts: 30, name: 'CARTON', color: '#a6dba9', emoji: '🟢', flavor: 'Solid. A dozen others said it.' },
    { pts: 60, name: 'FREE RANGE', color: '#8fd0f2', emoji: '🔵', flavor: 'Genuinely uncommon. Nice pull.' },
    { pts: 85, name: 'DOUBLE YOLK', color: '#ffa94d', emoji: '🟠', flavor: 'A deep cut. Barely anyone goes there.' },
    { pts: 100, name: 'GOLDEN EGG', color: '#ffd23f', emoji: '🌟', flavor: 'The rarest find on the hill.' },
  ];
  const CRACKED = { pts: 0, name: 'CRACKED', color: '#f0a79c', emoji: '💥', flavor: OE.COPY.timeout };
  const tierFor = (pts) => TIERS.find((t) => t.pts === pts) || CRACKED;

  const mode = OE.mode; // daily | unlimited | quest
  const COPY = OE.COPY;
  // quest draws from the same random pool as unlimited
  const apiMode = mode === 'daily' ? 'daily' : 'unlimited';
  const TITLES = {
    daily: { tagline: 'THE DAILY ROLL', number: (n) => `Roll #${n}`, start: '▼ Start rolling ▼', again: ['Play unlimited ∞', '?mode=unlimited'] },
    unlimited: { tagline: 'THE ENDLESS ROLL', number: () => 'Endless roll', start: '▼ Start rolling ▼', again: ['Roll again ∞', '?mode=unlimited'] },
    quest: {
      tagline: 'THE EPIC QUEST',
      number: () => 'Epic quest',
      start: '⚔ Begin the quest ⚔',
      again: ['Quest again ⚔', '?mode=quest'],
      pitch: '7 dragons · 25 seconds each · rarer answers strike harder',
      how: [
        'Seven prompts. A dragon lands in the road for each one.',
        '25 seconds to name one thing.',
        'Your answer is your sword stroke: the rarer it is, the harder it hits.',
        'Hit for 60 or more and the dragon is slain. Less, and it only flies off.',
        'Every 100 points earns new gear: sword, helm, shield, cape, golden plate, flameblade.',
        'Reach 700 and you are crowned the Egg of Legend.',
      ],
    },
  };
  const MODE_LINKS = [
    ['daily', 'Daily roll', './'],
    ['unlimited', 'Unlimited ∞', '?mode=unlimited'],
    ['quest', 'Quest ⚔', '?mode=quest'],
  ];
  let game = null;
  let idx = 0;
  let score = 0;
  let picks = [];
  let state = 'title';
  let deadline = 0;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const store = {
    get(k) {
      try {
        return JSON.parse(localStorage.getItem(k));
      } catch {
        return null;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem(k, JSON.stringify(v));
      } catch {}
    },
  };

  /* ---------- sound ---------- */

  let audio = null;
  let soundOn = store.get('oe:sound') !== false;
  function beep(freq, dur = 0.09, type = 'triangle', gain = 0.07, when = 0) {
    if (!soundOn) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const t = audio.currentTime + when;
      const osc = audio.createOscillator();
      const g = audio.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g).connect(audio.destination);
      osc.start(t);
      osc.stop(t + dur);
    } catch {}
  }
  const chord = (notes, gap = 0.09) => notes.forEach((f, i) => beep(f, 0.22, 'triangle', 0.07, i * gap));

  function syncSound() {
    $('sound').setAttribute('aria-pressed', String(soundOn));
    $('sound').setAttribute('aria-label', soundOn ? 'Turn sound off' : 'Turn sound on');
  }
  $('sound').addEventListener('click', () => {
    soundOn = !soundOn;
    store.set('oe:sound', soundOn);
    syncSound();
  });
  syncSound();

  /* ---------- helpers ---------- */

  async function api(path, body) {
    const res = await fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined);
    if (!res.ok) throw new Error(`${path} → ${res.status}`);
    return res.json();
  }

  let toastTimer;
  function toast(text) {
    const el = $('toast');
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
  }

  const metres = (s) => `${Math.round(s * 10).toLocaleString()} m`;

  function updateHud(s) {
    $('hud-dist').textContent = metres(s);
    $('hud-score').textContent = Math.round(s);
    $('hud-zone').textContent = OE.ZONES[Math.min(6, Math.floor(s / 100))];
    $('hud-form').textContent = OE.FORMS[s >= 700 ? 7 : Math.min(6, Math.floor(s / 100))].name;
  }

  /* ---------- title ---------- */

  const dailyKey = () => `oe:daily:${game.number}`;

  async function boot() {
    $('name').value = store.get('oe:name') || '';
    $('name').addEventListener('change', () => store.set('oe:name', $('name').value.trim()));
    const title = TITLES[mode];
    $('tagline').textContent = title.tagline;
    if (title.pitch) $('pitch').textContent = title.pitch;
    if (title.how) {
      $('how-list').replaceChildren(
        ...title.how.map((line) => {
          const li = document.createElement('li');
          li.textContent = line;
          return li;
        })
      );
    }
    $('again').textContent = title.again[0];
    $('again').href = title.again[1];
    $('hud-dist-label').textContent = COPY.distLabel;
    $('submit').textContent = COPY.submit;
    $('modes').replaceChildren(
      ...MODE_LINKS.filter(([m]) => m !== mode).map(([, label, href]) => {
        const a = document.createElement('a');
        a.className = 'chip-link';
        a.textContent = label;
        a.href = href;
        return a;
      })
    );
    try {
      game = await api(`/api/game?mode=${apiMode}`);
    } catch {
      $('start').textContent = "Can't reach the kitchen";
      return;
    }
    const start = $('start');
    start.disabled = false;
    const done = mode === 'daily' ? store.get(dailyKey()) : null;
    $('roll-number').textContent = title.number(game.number);
    if (done) {
      start.textContent = "See today's roll";
      start.addEventListener('click', () => {
        $('title').hidden = true;
        world.jumpTo(done.score);
        showEnd(done);
      });
    } else {
      start.textContent = title.start;
      start.addEventListener('click', startGame);
    }
  }

  function startGame() {
    $('title').hidden = true;
    $('hud').hidden = false;
    world.setAnchor(window.innerHeight < 620 ? 0.82 : 0.72);
    updateHud(0);
    beep(392, 0.12);
    nextPrompt();
  }

  /* ---------- prompt ---------- */

  async function nextPrompt() {
    const p = game.prompts[idx];
    state = 'countdown';
    $('result').hidden = true;
    $('prompt').hidden = false;
    $('prompt-count').textContent = `Prompt ${idx + 1} of ${game.prompts.length}`;
    $('prompt-text').textContent = p.text;
    const input = $('answer');
    input.value = '';
    input.disabled = true;
    $('submit').disabled = true;
    const fill = $('timer-fill');
    fill.style.transform = 'scaleX(1)';
    fill.classList.remove('low');
    const hint = $('prompt-hint');
    hint.classList.remove('bad');
    world.encounter(idx);
    for (let n = 3; n > 0; n--) {
      hint.textContent = `the clock starts in ${n}`;
      beep(330, 0.05, 'sine', 0.04);
      await sleep(650);
    }
    hint.textContent = COPY.hint;
    input.disabled = false;
    $('submit').disabled = false;
    input.focus();
    state = 'answering';
    deadline = performance.now() + SECONDS * 1000;
    requestAnimationFrame(tick);
  }

  function tick() {
    if (state !== 'answering' && state !== 'judging') return;
    const left = (deadline - performance.now()) / 1000;
    const fill = $('timer-fill');
    fill.style.transform = `scaleX(${Math.max(0, left / SECONDS)})`;
    fill.classList.toggle('low', left < 6);
    if (left <= 0 && state === 'answering') return timeUp();
    requestAnimationFrame(tick);
  }

  $('answer-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = $('answer');
    const typed = input.value.trim();
    if (state !== 'answering' || !typed) return;
    state = 'judging';
    let verdict;
    try {
      verdict = await api('/api/answer', { promptId: game.prompts[idx].id, answer: typed });
    } catch {
      verdict = null;
    }
    if (state !== 'judging') return;
    if (verdict && verdict.ok) return reveal(verdict, typed);
    state = 'answering';
    const hint = $('prompt-hint');
    hint.textContent = verdict ? "That's not in the cookbook. Try another." : 'The kitchen went quiet. Try again.';
    hint.classList.add('bad');
    input.classList.remove('shake');
    void input.offsetWidth;
    input.classList.add('shake');
    input.select();
    beep(140, 0.16, 'sawtooth', 0.04);
  });

  function timeUp() {
    state = 'reveal';
    picks.push({ promptId: game.prompts[idx].id, text: game.prompts[idx].text, answer: null, typed: '', pts: 0 });
    $('prompt').hidden = true;
    $('result').hidden = false;
    $('ladder').hidden = true;
    showVerdict(CRACKED, '— no answer —', COPY.noGain);
    world.wobble();
    beep(160, 0.3, 'sawtooth', 0.05);
    readyForNext();
  }

  /* ---------- reveal ---------- */

  function showVerdict(tier, said, gain, share) {
    $('verdict').hidden = false;
    const name = $('tier-name');
    name.textContent = tier.name;
    name.style.setProperty('--tier', tier.color);
    $('said').textContent = said;
    $('gain').textContent = gain;
    $('flavor').textContent = share != null ? `${tier.flavor} ${share}% of rollers said it.` : tier.flavor;
    $('next').hidden = true;
  }

  async function reveal(verdict, typed) {
    state = 'reveal';
    const tier = tierFor(verdict.pts);
    picks.push({ promptId: game.prompts[idx].id, text: game.prompts[idx].text, answer: verdict.answer, typed, pts: verdict.pts });
    $('prompt').hidden = true;
    $('result').hidden = false;
    $('verdict').hidden = true;
    $('next').hidden = true;
    const ladder = $('ladder');
    ladder.hidden = false;
    ladder.replaceChildren(
      ...TIERS.slice()
        .reverse()
        .map((t) => {
          const li = document.createElement('li');
          li.style.setProperty('--tier', t.color);
          li.innerHTML = `<span>${t.name}</span><span>${t.pts}</span>`;
          return li;
        })
    );
    const rows = [...ladder.children].reverse();
    const target = TIERS.indexOf(tier);
    for (let i = 0; i <= target; i++) {
      rows.forEach((r, j) => r.classList.toggle('on', j === i));
      beep(300 + i * 90, 0.07, 'square', 0.03);
      await sleep(190 + i * 55);
    }
    rows[target].classList.add('hit');
    if (verdict.pts === 100) chord([523, 659, 784, 1047]);
    else if (verdict.pts >= 60) chord([440, 554, 659]);
    else beep(262, 0.18);
    await sleep(620);

    ladder.hidden = true;
    showVerdict(tier, verdict.answer, COPY.gain(verdict.pts, metres(verdict.pts)), verdict.share);
    score += verdict.pts;
    await world.rollTo(score, {
      pts: verdict.pts,
      onStep: updateHud,
      onForm(form) {
        toast(COPY.toast(OE.FORMS[form]));
        chord([392, 523, 659], 0.07);
      },
    });
    updateHud(score);
    if (verdict.pts === 100) world.celebrate();
    readyForNext();
  }

  function readyForNext() {
    const next = $('next');
    next.textContent = idx + 1 < game.prompts.length ? COPY.next : COPY.last;
    next.hidden = false;
    next.focus();
    state = 'rolled';
  }

  $('next').addEventListener('click', () => {
    if (state !== 'rolled') return;
    idx++;
    if (idx < game.prompts.length) nextPrompt();
    else finish();
  });

  /* ---------- end ---------- */

  async function finish() {
    state = 'end';
    $('result').hidden = true;
    const record = { number: game.number, score, picks, reveals: {}, standings: null, quest: world.stats() };
    try {
      const res = await api('/api/run', {
        mode: apiMode,
        number: game.number,
        name: $('name').value.trim(),
        picks: picks.map((p) => ({ promptId: p.promptId, answer: p.typed })),
      });
      record.reveals = res.reveals;
      record.standings = res.standings;
    } catch {}
    if (mode === 'daily') store.set(dailyKey(), record);
    showEnd(record);
  }

  function showEnd(record) {
    const form = record.score >= 700 ? 7 : Math.min(6, Math.floor(record.score / 100));
    $('hud').hidden = true;
    $('end').hidden = false;
    $('end-eyebrow').textContent = `${TITLES[mode].number(record.number)} · you finished as`;
    $('end-form').textContent = OE.FORMS[form].name;
    $('end-score').textContent = record.score;
    $('end-dist').textContent = `${COPY.endDist(metres(record.score))} · ${OE.FORMS[form].blurb}`;

    const st = record.standings;
    $('end-rank').textContent = record.quest
      ? `⚔ Dragons slain: ${record.quest.slain} of ${record.picks.length}`
      : !st
      ? ''
      : st.total <= 1
        ? 'First egg down the hill today.'
        : `Rolled further than ${Math.round((st.below / (st.total - 1)) * 100)}% of today's ${st.total} eggs.`;

    $('recap').replaceChildren(
      ...record.picks.map((p) => {
        const tier = tierFor(p.pts);
        const li = document.createElement('li');
        li.style.setProperty('--tier', tier.color);
        const add = (cls, text) => {
          const el = document.createElement('span');
          el.className = cls;
          el.textContent = text;
          li.append(el);
          return el;
        };
        add('q', p.text);
        add('a', p.answer || '—');
        add('t', `${tier.name} · ${p.pts}`);
        const golden = record.reveals[p.promptId]?.golden;
        if (golden && p.pts !== 100) {
          const g = add('g', 'Golden egg: ');
          const b = document.createElement('b');
          b.textContent = golden;
          g.append(b);
        }
        return li;
      })
    );

    const board = $('board');
    board.hidden = !(st && st.top.length > 1);
    if (!board.hidden) {
      board.replaceChildren(
        ...st.top.map((r) => {
          const li = document.createElement('li');
          const n = document.createElement('span');
          n.textContent = r.name;
          const s = document.createElement('span');
          s.textContent = r.score;
          li.append(n, s);
          return li;
        })
      );
    }

    const pc = $('portrait');
    const pctx = pc.getContext('2d');
    let t = 0;
    (function drawPortrait() {
      if ($('end').hidden) return;
      t += 1 / 60;
      pctx.setTransform(1, 0, 0, 1, 0, 0);
      pctx.clearRect(0, 0, pc.width, pc.height);
      pctx.translate(pc.width / 2, pc.height / 2 + Math.sin(t * 2) * 3);
      OE.drawAvatar(pctx, form, mode !== 'quest' && form >= 6 ? 44 : 56, t, 'happy');
      requestAnimationFrame(drawPortrait);
    })();

    if (form === 7) world.celebrate();
    chord(form >= 4 ? [523, 659, 784, 1047] : [392, 494, 587]);

    $('share').onclick = async () => {
      const title = mode === 'daily' ? `Eggvolution #${record.number}` : mode === 'quest' ? 'Eggvolution ⚔ Quest' : 'Eggvolution ∞';
      const text = [
        `${title} ${OE.FORMS[form].emoji} ${OE.FORMS[form].name}`,
        `${record.score}/700 · ${COPY.endDist(metres(record.score))}` + (record.quest ? ` · ${record.quest.slain} dragons slain` : ''),
        record.picks.map((p) => tierFor(p.pts).emoji).join(''),
        location.origin,
      ].join('\n');
      try {
        await navigator.clipboard.writeText(text);
        toast('Copied to clipboard');
      } catch {
        toast('Copy failed');
      }
    };
  }

  boot();
})();
