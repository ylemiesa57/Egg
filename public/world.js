// The hill: a tall scrolling world with a switchback path from the Nest (0)
// down to the Great Skillet (700). Everything is drawn procedurally on canvas.
(function () {
  const OE = window.OE;
  if (OE.mode === 'quest') return;
  const MAX = 700;
  const PX = 9; // world pixels of descent per point
  const LEG = 35; // points per switchback
  const TAU = Math.PI * 2;

  OE.ZONES = [
    'The Nest',
    'Geyser Meadows',
    'Simmer Springs',
    'Whirlpool Hollows',
    'The Scramble',
    'Butterfall Slopes',
    'The Great Skillet',
  ];

  // Ground colour at each zone boundary; blended in between.
  const GROUND = ['#e2f6ea', '#8fd694', '#35a08c', '#4f5fc4', '#7a48ad', '#b8502c', '#3a2622', '#1c1210'];
  const NOTES = [
    [22, 'the air is thin and smells of cloud'],
    [62, 'last pine before the tree line'],
    [128, 'geysers erupt every four minutes. roughly.'],
    [168, 'eight minutes in a geyser: hard-boiled'],
    [232, 'the springs here never quite boil'],
    [272, 'mushrooms taller than a henhouse'],
    [328, 'the pools stir themselves'],
    [372, 'no vinegar needed'],
    [428, 'loose crystal. mind your step. you have no feet.'],
    [472, 'everything arrives here in pieces'],
    [528, 'the rivers are 82% butter'],
    [572, 'fold in thirds and carry on'],
    [628, 'the ground has started to sizzle'],
    [668, 'few eggs have rolled this far'],
    [694, 'the centre of the skillet. a perfect roll ends here.'],
  ];

  const canvas = document.getElementById('world');
  const ctx = canvas.getContext('2d');
  let W = 0;
  let H = 0;
  let dpr = 1;
  let time = 0;
  let cam = -400;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const egg = { s: 0, angle: 0, mood: 'happy', squash: 0, rolling: false };
  const particles = [];
  const motes = [];
  let anchor = 0.6;
  let roll = null;
  let pressure = 0; // 0–1 as the clock runs down

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    motes.length = 0;
    for (let i = 0; i < 46; i++) motes.push({ x: Math.random() * W, y: Math.random() * H, p: Math.random() * TAU, v: 0.3 + Math.random() * 0.7 });
  }

  const hash = (x, y, k) => {
    const v = Math.sin(x * 127.1 + y * 311.7 + k * 74.7) * 43758.5453;
    return v - Math.floor(v);
  };
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const eggR = () => clamp(W * 0.04, 20, 30);
  const pathHalf = () => Math.min(W * 0.38, 430);
  const hillHalf = (y) => 80 + 44 * Math.sqrt(Math.max(y + 40, 0));

  function hex(c) {
    return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
  }
  const GROUND_RGB = GROUND.map(hex);
  function groundAt(pts, shade) {
    const p = clamp(pts / 100, 0, 7);
    const i = Math.min(6, Math.floor(p));
    const t = p - i;
    const k = shade == null ? 1 : shade;
    const c = GROUND_RGB[i].map((v, j) => Math.round(clamp(lerp(v, GROUND_RGB[i + 1][j], t) * k, 0, 255)));
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  }

  // Position on the path for a score s (0–700), in world coordinates.
  function pathPos(s) {
    const u = s / LEG + 0.5;
    const leg = Math.floor(u);
    const t = u - leg;
    const dir = leg % 2 === 0 ? 1 : -1;
    return { x: W / 2 + dir * (t * 2 - 1) * pathHalf(), y: s * PX, dir };
  }

  /* ---------- sky ---------- */

  function drawSky() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#8f7fe8');
    g.addColorStop(0.45, '#f3a6c8');
    g.addColorStop(0.8, '#ffd9a8');
    g.addColorStop(1, '#fff3cf');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    const par = -cam * 0.35;

    // two moons and a low sun
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath();
    ctx.arc(W * 0.16, 90 + par * 0.4, 34, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 214, 236, 0.8)';
    ctx.beginPath();
    ctx.arc(W * 0.16 + 62, 62 + par * 0.4, 13, 0, TAU);
    ctx.fill();
    const sun = ctx.createRadialGradient(W * 0.82, 150 + par * 0.5, 10, W * 0.82, 150 + par * 0.5, 150);
    sun.addColorStop(0, 'rgba(255, 246, 200, 0.95)');
    sun.addColorStop(0.25, 'rgba(255, 226, 150, 0.6)');
    sun.addColorStop(1, 'rgba(255, 226, 150, 0)');
    ctx.fillStyle = sun;
    ctx.fillRect(W * 0.82 - 160, 150 + par * 0.5 - 160, 320, 320);

    // floating islands
    for (const [fx, fy, sc] of [[0.1, 250, 1], [0.9, 330, 0.8], [0.72, 60, 0.55], [0.3, 40, 0.45]]) {
      if (W < 700 && fy < 100) continue; // keep the title clear on narrow screens
      const x = W * fx;
      const y = fy + par * (0.5 + sc * 0.3) + Math.sin(time * 0.5 + fx * 9) * 5;
      island(x, y, 70 * sc);
    }
    // clouds
    for (let i = 0; i < 7; i++) {
      const speed = 6 + hash(i, 1, 1) * 10;
      const x = ((hash(i, 2, 3) * (W + 400) + time * speed) % (W + 400)) - 200;
      const y = 40 + hash(i, 5, 2) * 420 + par * 0.7;
      cloud(x, y, 34 + hash(i, 3, 3) * 38, 0.7);
    }
  }

  function island(x, y, r) {
    ctx.fillStyle = '#8a6bbf';
    ctx.beginPath();
    ctx.moveTo(x - r, y);
    ctx.quadraticCurveTo(x - r * 0.4, y + r * 1.3, x, y + r * 1.5);
    ctx.quadraticCurveTo(x + r * 0.5, y + r * 1.1, x + r, y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#9be0a8';
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.28, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillRect(x + r * 0.35, y + r * 0.1, r * 0.09, r * 1.6);
    ctx.fillStyle = '#5fbf7d';
    ctx.beginPath();
    ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.26, 0, TAU);
    ctx.fill();
  }

  function cloud(x, y, r, alpha) {
    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.6, 0, TAU);
    ctx.arc(x + r * 0.7, y + r * 0.1, r * 0.48, 0, TAU);
    ctx.arc(x - r * 0.7, y + r * 0.12, r * 0.42, 0, TAU);
    ctx.arc(x + r * 0.2, y - r * 0.3, r * 0.45, 0, TAU);
    ctx.fill();
  }

  /* ---------- hill ---------- */

  function drawHill() {
    const top = -40;
    const y0 = Math.max(cam, top);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    for (let i = 0; i <= 8; i++) {
      g.addColorStop(i / 8, groundAt((cam + (H * i) / 8) / PX));
    }
    ctx.fillStyle = g;
    ctx.beginPath();
    const cx = W / 2;
    if (y0 === top) {
      ctx.moveTo(cx - hillHalf(top), top - cam);
      ctx.bezierCurveTo(cx - 50, top - 30 - cam, cx + 50, top - 30 - cam, cx + hillHalf(top), top - cam);
    } else {
      ctx.moveTo(cx - hillHalf(y0), 0);
      ctx.lineTo(cx + hillHalf(y0), 0);
    }
    // the slope flares fastest near the summit, so sample it finely there
    const ys = [];
    for (let y = y0; y <= cam + H + 30; y += y < 200 ? 5 : 30) ys.push(y);
    for (const y of ys) ctx.lineTo(cx + hillHalf(y), y - cam);
    for (const y of ys.reverse()) ctx.lineTo(cx - hillHalf(y), y - cam);
    ctx.closePath();
    ctx.fill();
    ctx.save();
    ctx.clip();

    // contour bands give the slope some body
    const first = Math.floor(cam / 120) * 120;
    for (let y = first; y < cam + H + 120; y += 120) {
      if (y < -40) continue;
      ctx.beginPath();
      for (let x = -20; x <= W + 20; x += 40) {
        const yy = y - cam + Math.sin(x * 0.011 + y * 0.02) * 16 + Math.sin(x * 0.027 + y) * 6;
        if (x === -20) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.lineWidth = 26;
      ctx.strokeStyle = 'rgba(0, 0, 30, 0.045)';
      ctx.stroke();
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(255,255,255,0.07)';
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawZoneLines() {
    ctx.font = '600 13px Fredoka, system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    for (let z = 1; z <= 6; z++) {
      const y = z * 100 * PX - cam;
      if (y < -40 || y > H + 40) continue;
      ctx.setLineDash([3, 9]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
      ctx.setLineDash([]);
      const label = `${OE.ZONES[z].toUpperCase()}  ·  ${OE.FORMS[z].name.toUpperCase()}`;
      const tw = ctx.measureText(label).width + 28;
      const x = z % 2 ? 16 : W - tw - 16;
      ctx.fillStyle = 'rgba(30, 16, 10, 0.72)';
      roundRect(x, y - 14, tw, 28, 14);
      ctx.fill();
      ctx.fillStyle = '#fff3d6';
      ctx.textAlign = 'left';
      ctx.fillText(label, x + 14, y + 1);
    }
    ctx.font = '500 13px Fredoka, system-ui, sans-serif';
    NOTES.forEach(([pts, text]) => {
      const y = pts * PX - cam;
      if (y < -20 || y > H + 20) return;
      const p = pathPos(pts);
      // put the note on whichever side the path isn't
      const left = p.x > W / 2;
      ctx.textAlign = left ? 'left' : 'right';
      const label = left ? `──  ${text}` : `${text}  ──`;
      if (ctx.measureText(label).width > Math.abs(p.x - (left ? 0 : W)) - 60) return;
      ctx.shadowColor = pts < 90 ? 'transparent' : 'rgba(10, 4, 20, 0.7)';
      ctx.shadowBlur = 6;
      ctx.fillStyle = pts < 90 ? 'rgba(40, 60, 70, 0.6)' : 'rgba(255, 255, 255, 0.62)';
      ctx.fillText(label, left ? 14 : W - 14, y);
      ctx.shadowBlur = 0;
    });
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawPath() {
    const sA = clamp((cam - 80) / PX, 0, MAX);
    const sB = clamp((cam + H + 80) / PX, 0, MAX);
    if (sB <= sA) return;
    const pts = [pathPos(sA)];
    for (let k = Math.ceil(sA / LEG - 0.5); (k + 0.5) * LEG < sB; k++) {
      if ((k + 0.5) * LEG > sA) pts.push(pathPos((k + 0.5) * LEG - 1e-6));
    }
    pts.push(pathPos(sB));
    const trace = () => {
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y - cam) : ctx.moveTo(p.x, p.y - cam)));
    };
    const w = clamp(W * 0.045, 26, 40);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    trace();
    ctx.lineWidth = w + 10;
    ctx.strokeStyle = 'rgba(20, 10, 30, 0.28)';
    ctx.stroke();
    const g = ctx.createLinearGradient(0, 0, 0, H);
    const depth = (y) => clamp((cam + y) / PX / MAX, 0, 1);
    for (const f of [0, 0.5, 1]) {
      const d = depth(H * f);
      g.addColorStop(f, d > 0.84 ? '#ffd65c' : `rgb(${Math.round(lerp(255, 236, d))},${Math.round(lerp(244, 214, d))},${Math.round(lerp(214, 178, d))})`);
    }
    trace();
    ctx.lineWidth = w;
    ctx.strokeStyle = g;
    ctx.stroke();
    trace();
    ctx.setLineDash([2, 16]);
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(120, 80, 40, 0.3)';
    ctx.stroke();
    ctx.setLineDash([]);
  }

  /* ---------- props ---------- */

  const PROPS = {
    pine(x, y, s) {
      ctx.fillStyle = '#7a5a3a';
      ctx.fillRect(x - 3 * s, y - 8 * s, 6 * s, 10 * s);
      for (let i = 0; i < 3; i++) {
        const w = (22 - i * 5) * s;
        const yy = y - (8 + i * 14) * s;
        ctx.fillStyle = i === 2 ? '#f4fff8' : '#4fae8a';
        ctx.beginPath();
        ctx.moveTo(x - w, yy);
        ctx.lineTo(x, yy - 22 * s);
        ctx.lineTo(x + w, yy);
        ctx.closePath();
        ctx.fill();
      }
    },
    mist(x, y, s, r) {
      cloud(x + Math.sin(time * 0.3 + r * 9) * 30, y, 30 * s, 0.55);
    },
    tree(x, y, s, r) {
      ctx.fillStyle = '#7a5235';
      ctx.fillRect(x - 3 * s, y - 16 * s, 6 * s, 18 * s);
      ctx.fillStyle = r > 0.5 ? '#3f9d5a' : '#58b368';
      ctx.beginPath();
      ctx.arc(x, y - 30 * s, 19 * s, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.beginPath();
      ctx.arc(x - 6 * s, y - 36 * s, 8 * s, 0, TAU);
      ctx.fill();
    },
    flower(x, y, s, r) {
      ctx.strokeStyle = '#2f7d4a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y - 14 * s);
      ctx.stroke();
      ctx.fillStyle = ['#ff8fb3', '#ffe066', '#ffffff', '#c59cff'][Math.floor(r * 4)];
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU + Math.sin(time + r * 20) * 0.1;
        ctx.beginPath();
        ctx.arc(x + Math.cos(a) * 5 * s, y - 14 * s + Math.sin(a) * 5 * s, 4 * s, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = '#ff9a1a';
      ctx.beginPath();
      ctx.arc(x, y - 14 * s, 3 * s, 0, TAU);
      ctx.fill();
    },
    geyser(x, y, s, r) {
      ctx.fillStyle = '#cdbf9f';
      ctx.beginPath();
      ctx.ellipse(x, y, 22 * s, 9 * s, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#7fd6e8';
      ctx.beginPath();
      ctx.ellipse(x, y - 2 * s, 12 * s, 4.5 * s, 0, 0, TAU);
      ctx.fill();
      const cycle = (time * 0.35 + r * 5) % 1;
      const burst = cycle < 0.35 ? Math.sin((cycle / 0.35) * Math.PI) : 0;
      if (burst > 0) {
        ctx.fillStyle = 'rgba(190, 240, 255, 0.85)';
        ctx.beginPath();
        ctx.moveTo(x - 5 * s, y - 2 * s);
        ctx.quadraticCurveTo(x, y - 90 * s * burst, x + 5 * s, y - 2 * s);
        ctx.fill();
      }
      for (let i = 0; i < 4; i++) {
        const f = (time * 0.4 + i / 4 + r) % 1;
        ctx.fillStyle = `rgba(255,255,255,${0.5 * (1 - f)})`;
        ctx.beginPath();
        ctx.arc(x + Math.sin(f * 6 + i) * 8 * s, y - 10 * s - f * 60 * s, (5 + f * 10) * s, 0, TAU);
        ctx.fill();
      }
    },
    mushroom(x, y, s, r) {
      const cap = ['#ff5d73', '#b574ff', '#ff9a3c', '#3fd6c6'][Math.floor(r * 4)];
      const glow = ctx.createRadialGradient(x, y - 24 * s, 2, x, y - 24 * s, 46 * s);
      glow.addColorStop(0, 'rgba(255, 250, 200, 0.28)');
      glow.addColorStop(1, 'rgba(255, 250, 200, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(x - 46 * s, y - 70 * s, 92 * s, 92 * s);
      ctx.fillStyle = '#fff1d6';
      roundRect(x - 6 * s, y - 24 * s, 12 * s, 26 * s, 5 * s);
      ctx.fill();
      ctx.fillStyle = cap;
      ctx.beginPath();
      ctx.ellipse(x, y - 24 * s, 24 * s, 18 * s, 0, Math.PI, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (const [dx, dy, rr] of [[-10, -30, 4], [4, -36, 5], [13, -28, 3]]) {
        ctx.beginPath();
        ctx.arc(x + dx * s, y + dy * s, rr * s, 0, TAU);
        ctx.fill();
      }
    },
    pool(x, y, s, r) {
      ctx.fillStyle = '#1f6f8f';
      ctx.beginPath();
      ctx.ellipse(x, y, 34 * s, 13 * s, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#6fe0e6';
      ctx.beginPath();
      ctx.ellipse(x, y - 2 * s, 30 * s, 10.5 * s, 0, 0, TAU);
      ctx.fill();
      // slow whirl
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 2; i++) {
        const a = time * 1.4 + r * 6 + i * Math.PI;
        ctx.beginPath();
        ctx.ellipse(x, y - 2 * s, (10 + i * 10) * s, (3.5 + i * 3.5) * s, 0, a, a + 1.8);
        ctx.stroke();
      }
    },
    crystal(x, y, s, r) {
      const cols = r > 0.5 ? ['#9df3ff', '#57b7ff'] : ['#ffb3ec', '#c874ff'];
      for (const [dx, h, w, lean] of [[-10, 26, 7, -0.25], [0, 44, 9, 0.05], [11, 30, 7, 0.3]]) {
        ctx.fillStyle = cols[dx === 0 ? 0 : 1];
        ctx.beginPath();
        ctx.moveTo(x + (dx - w) * s, y);
        ctx.lineTo(x + (dx + lean * h) * s, y - h * s);
        ctx.lineTo(x + (dx + w) * s, y);
        ctx.closePath();
        ctx.fill();
      }
      const tw = 0.5 + 0.5 * Math.sin(time * 3 + r * 30);
      ctx.fillStyle = `rgba(255,255,255,${tw})`;
      OE.sparkle(ctx, x + 2 * s, y - 40 * s, 6 * s);
    },
    boulder(x, y, s, r, pts) {
      ctx.fillStyle = groundAt(pts, 0.62);
      ctx.beginPath();
      ctx.ellipse(x, y - 8 * s, 20 * s, 13 * s, 0, 0, TAU);
      ctx.ellipse(x + 14 * s, y - 4 * s, 11 * s, 8 * s, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      ctx.beginPath();
      ctx.ellipse(x - 5 * s, y - 13 * s, 9 * s, 4 * s, -0.3, 0, TAU);
      ctx.fill();
    },
    vent(x, y, s, r) {
      const pulse = 0.6 + 0.4 * Math.sin(time * 2.2 + r * 20);
      const glow = ctx.createRadialGradient(x, y, 2, x, y, 44 * s);
      glow.addColorStop(0, `rgba(255, 170, 40, ${0.55 * pulse})`);
      glow.addColorStop(1, 'rgba(255, 120, 20, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(x - 44 * s, y - 44 * s, 88 * s, 88 * s);
      ctx.strokeStyle = '#2a1410';
      ctx.lineWidth = 7 * s;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x - 22 * s, y + 3 * s);
      ctx.lineTo(x - 6 * s, y - 3 * s);
      ctx.lineTo(x + 6 * s, y + 4 * s);
      ctx.lineTo(x + 22 * s, y - 2 * s);
      ctx.stroke();
      ctx.strokeStyle = `rgba(255, 190, 60, ${pulse})`;
      ctx.lineWidth = 2.5 * s;
      ctx.stroke();
      for (let i = 0; i < 3; i++) {
        const f = (time * 0.5 + i / 3 + r) % 1;
        ctx.fillStyle = `rgba(255, 200, 80, ${1 - f})`;
        ctx.beginPath();
        ctx.arc(x + Math.sin(f * 9 + i * 2) * 10 * s, y - f * 50 * s, 2 * s, 0, TAU);
        ctx.fill();
      }
    },
    butter(x, y, s) {
      ctx.fillStyle = 'rgba(255, 214, 80, 0.5)';
      ctx.beginPath();
      ctx.ellipse(x, y + 3 * s, 30 * s, 9 * s, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#ffe680';
      roundRect(x - 15 * s, y - 14 * s, 30 * s, 16 * s, 3 * s);
      ctx.fill();
      ctx.fillStyle = '#fff5b8';
      roundRect(x - 15 * s, y - 14 * s, 30 * s, 5 * s, 3 * s);
      ctx.fill();
    },
    bacon(x, y, s, r) {
      for (const [off, col, lw] of [[0, '#b23a3a', 13], [0, '#f4c9b0', 4]]) {
        ctx.strokeStyle = col;
        ctx.lineWidth = lw * s;
        ctx.lineCap = 'round';
        ctx.beginPath();
        for (let i = 0; i <= 12; i++) {
          const xx = x + (i - 6) * 7 * s;
          const yy = y + off + Math.sin(i * 1.1 + r * 6) * 4 * s;
          if (i) ctx.lineTo(xx, yy);
          else ctx.moveTo(xx, yy);
        }
        ctx.stroke();
      }
    },
    oil(x, y, s, r) {
      for (let i = 0; i < 4; i++) {
        const f = (time * (0.6 + i * 0.13) + r * 3 + i * 0.27) % 1;
        ctx.strokeStyle = `rgba(255, 226, 130, ${0.8 * (1 - f)})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x + (hash(i, r * 99, 1) - 0.5) * 50 * s, y + (hash(i, r * 99, 2) - 0.5) * 20 * s, (2 + f * 9) * s, 0, TAU);
        ctx.stroke();
      }
    },
  };

  const ZONE_PROPS = [
    ['pine', 'pine', 'mist', 'boulder', 'pine'],
    ['tree', 'flower', 'flower', 'geyser', 'tree', 'flower'],
    ['mushroom', 'mushroom', 'pool', 'flower', 'mushroom'],
    ['pool', 'crystal', 'pool', 'boulder', 'mushroom'],
    ['crystal', 'boulder', 'boulder', 'crystal', 'vent'],
    ['vent', 'butter', 'boulder', 'vent', 'butter'],
    ['butter', 'bacon', 'oil', 'oil', 'vent'],
  ];

  function drawProps() {
    const cw = 118;
    const ch = 104;
    const cx = W / 2;
    const clear = clamp(W * 0.045, 26, 40) + 34;
    const row0 = Math.floor((cam - 120) / ch);
    const row1 = Math.floor((cam + H + 120) / ch);
    const col0 = Math.floor(-cx / cw) - 1;
    const col1 = Math.ceil(cx / cw) + 1;
    for (let row = row0; row <= row1; row++) {
      for (let col = col0; col <= col1; col++) {
        if (hash(col, row, 1) > 0.6) continue;
        const x = cx + (col + 0.15 + hash(col, row, 2) * 0.7) * cw;
        const y = (row + 0.15 + hash(col, row, 3) * 0.7) * ch;
        const pts = y / PX;
        if (pts < 4 || pts > MAX - 22) continue;
        if (Math.abs(x - cx) > hillHalf(y) - 36) continue;
        // keep the road clear (checked a little above and below, since props have height)
        if (Math.abs(x - pathPos(clamp(pts, 0, MAX)).x) < clear + 14) continue;
        if (Math.abs(x - pathPos(clamp(pts - 4, 0, MAX)).x) < clear) continue;
        const list = ZONE_PROPS[Math.min(6, Math.floor(pts / 100))];
        const r = hash(col, row, 4);
        const kind = list[Math.floor(hash(col, row, 5) * list.length)];
        PROPS[kind](x, y - cam, 0.8 + hash(col, row, 6) * 0.5, r, pts);
      }
    }
  }

  function drawNest() {
    const p = pathPos(0);
    const y = p.y - cam + 6;
    if (y < -60 || y > H + 60) return;
    const r = eggR() * 1.7;
    ctx.fillStyle = '#8a5a34';
    ctx.beginPath();
    ctx.ellipse(p.x, y, r, r * 0.42, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#5f3b1f';
    ctx.lineWidth = 2;
    for (let i = 0; i < 14; i++) {
      const a = hash(i, 7, 7) * Math.PI;
      const xx = p.x + (hash(i, 3, 9) - 0.5) * r * 1.7;
      ctx.beginPath();
      ctx.moveTo(xx - Math.cos(a) * 9, y - Math.sin(a) * 4 + 2);
      ctx.lineTo(xx + Math.cos(a) * 9, y + Math.sin(a) * 4 + 2);
      ctx.stroke();
    }
    ctx.fillStyle = '#6b4526';
    ctx.beginPath();
    ctx.ellipse(p.x, y - 3, r * 0.74, r * 0.24, 0, 0, TAU);
    ctx.fill();
  }

  function drawSkillet() {
    const p = pathPos(MAX);
    const y = p.y - cam + 30;
    if (y < -400 || y > H + 400) return;
    const rx = Math.min(W * 0.44, 380);
    const ry = rx * 0.4;
    // heat from below
    const heat = ctx.createRadialGradient(p.x, y + ry, 10, p.x, y + ry, rx * 1.5);
    heat.addColorStop(0, `rgba(255, 120, 30, ${0.5 + 0.1 * Math.sin(time * 3)})`);
    heat.addColorStop(1, 'rgba(255, 80, 20, 0)');
    ctx.fillStyle = heat;
    ctx.fillRect(p.x - rx * 1.5, y + ry - rx * 1.5, rx * 3, rx * 3);
    // flames lick out from under the near rim
    for (let i = 0; i < 17; i++) {
      const a = Math.PI * (0.12 + (0.76 * i) / 16);
      const bx = p.x + Math.cos(a) * rx * 0.97;
      const by = y + 14 + Math.sin(a) * ry * 0.9;
      const fh = (26 + 16 * Math.sin(time * 6 + i * 1.7)) * (0.5 + 0.5 * Math.sin(a));
      ctx.fillStyle = i % 2 ? '#ff8a1f' : '#ffc233';
      ctx.beginPath();
      ctx.moveTo(bx - 15, by);
      ctx.quadraticCurveTo(bx + Math.cos(a) * 10, by + ry * 0.12 + fh * 1.7, bx + 15, by);
      ctx.fill();
    }
    // handle
    ctx.fillStyle = '#17110f';
    roundRect(p.x + rx * 0.9, y - 16, rx * 1.2, 32, 16);
    ctx.fill();
    // pan
    ctx.fillStyle = '#0f0b0a';
    ctx.beginPath();
    ctx.ellipse(p.x, y + 14, rx, ry, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#3b3230';
    ctx.beginPath();
    ctx.ellipse(p.x, y, rx, ry, 0, 0, TAU);
    ctx.fill();
    const inner = ctx.createRadialGradient(p.x, y, 10, p.x, y, rx);
    inner.addColorStop(0, '#4a3324');
    inner.addColorStop(0.6, '#2a1f1b');
    inner.addColorStop(1, '#191312');
    ctx.fillStyle = inner;
    ctx.beginPath();
    ctx.ellipse(p.x, y + 4, rx * 0.9, ry * 0.86, 0, 0, TAU);
    ctx.fill();
    // butter sheen and bubbles
    ctx.fillStyle = 'rgba(255, 214, 80, 0.2)';
    ctx.beginPath();
    ctx.ellipse(p.x, y + 4, rx * 0.5, ry * 0.45, 0, 0, TAU);
    ctx.fill();
    for (let i = 0; i < 14; i++) {
      const f = (time * (0.5 + hash(i, 1, 8) * 0.6) + hash(i, 2, 8)) % 1;
      const a = hash(i, 3, 8) * TAU;
      const d = 0.2 + hash(i, 4, 8) * 0.6;
      ctx.strokeStyle = `rgba(255, 230, 140, ${0.7 * (1 - f)})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.x + Math.cos(a) * rx * d, y + 4 + Math.sin(a) * ry * d * 0.9, 2 + f * 8, 0, TAU);
      ctx.stroke();
    }
  }

  /* ---------- egg, particles, atmosphere ---------- */

  function drawEgg() {
    const p = pathPos(egg.s);
    const R = eggR();
    const x = p.x;
    const y = p.y - cam - R * 0.95;
    const hop = egg.rolling && !reducedMotion ? Math.abs(Math.sin(egg.angle * 1.5)) * R * 0.12 : 0;
    ctx.fillStyle = 'rgba(20, 10, 30, 0.28)';
    ctx.beginPath();
    ctx.ellipse(x, p.y - cam + 3, R * 0.9, R * 0.28, 0, 0, TAU);
    ctx.fill();
    ctx.save();
    const bob = egg.rolling ? 0 : Math.sin(time * 2.2) * 1.5;
    // nerves: the egg trembles and sweats as time runs out
    const jit = reducedMotion ? 0 : pressure * 3;
    if (pressure > 0.2 && Math.random() < pressure * 0.25) {
      particles.push({ x: x + (Math.random() - 0.5) * R * 1.6, y: p.y - R * 1.9, vx: (Math.random() - 0.5) * 60, vy: -50, life: 1, decay: 1.8, size: 3, color: '#9fdcff' });
    }
    ctx.translate(x + (Math.random() - 0.5) * jit, y - hop + bob + (Math.random() - 0.5) * jit);
    ctx.rotate(egg.angle + (egg.mood === 'sad' ? Math.sin(time * 14) * 0.08 * egg.squash : 0));
    const sq = 1 + egg.squash * 0.16;
    ctx.scale(sq, 1 / sq);
    OE.drawEgg(ctx, formFor(egg.s), R, time, egg.mood);
    ctx.restore();
  }

  // The egg only turns golden at a true 700.
  function formFor(s) {
    return s >= MAX ? 7 : Math.min(6, Math.floor(s / 100));
  }

  function burst(x, y, n, colors, speed) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const v = (0.3 + Math.random()) * speed;
      particles.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - speed * 0.4,
        life: 1,
        decay: 0.7 + Math.random() * 0.9,
        size: 3 + Math.random() * 5,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }
  }

  function drawParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= p.decay * dt;
      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 260 * dt;
      ctx.globalAlpha = Math.min(1, p.life * 1.4);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y - cam, p.size * (0.4 + p.life * 0.6), 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  const MOTE_COLORS = ['255,255,255', '255,250,210', '190,255,220', '170,220,255', '230,190,255', '255,180,80', '255,140,50'];
  function drawAtmosphere(dt) {
    const pts = (cam + H * 0.5) / PX;
    const zone = clamp(Math.floor(pts / 100), 0, 6);
    const depth = clamp(pts / MAX, 0, 1);
    if (depth > 0.15) {
      const v = ctx.createRadialGradient(W / 2, H * 0.55, Math.min(W, H) * 0.35, W / 2, H * 0.55, Math.max(W, H) * 0.85);
      v.addColorStop(0, 'rgba(10, 4, 20, 0)');
      v.addColorStop(1, `rgba(10, 4, 20, ${0.55 * depth})`);
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, W, H);
    }
    const rising = zone >= 5;
    for (const m of motes) {
      m.p += dt * m.v;
      m.y += (rising ? -26 : 9) * m.v * dt;
      m.x += Math.sin(m.p) * 12 * dt;
      if (m.y < -10) m.y = H + 10;
      if (m.y > H + 10) m.y = -10;
      ctx.fillStyle = `rgba(${MOTE_COLORS[zone]}, ${0.25 + 0.35 * Math.abs(Math.sin(m.p * 1.3))})`;
      ctx.beginPath();
      ctx.arc(m.x, m.y, 1.4 + m.v * 1.6, 0, TAU);
      ctx.fill();
    }
  }

  /* ---------- loop ---------- */

  function update(dt) {
    if (roll) {
      roll.t += dt / roll.dur;
      const k = roll.t >= 1 ? 1 : roll.t < 0.5 ? 4 * roll.t ** 3 : 1 - (-2 * roll.t + 2) ** 3 / 2;
      const before = pathPos(egg.s);
      const prevForm = formFor(egg.s);
      egg.s = lerp(roll.from, roll.to, k);
      const after = pathPos(egg.s);
      const dist = Math.hypot(after.x - before.x, after.y - before.y);
      egg.angle += (after.dir * dist) / eggR();
      if (dist > 0.5 && Math.random() < 0.5) {
        burst(after.x - after.dir * 10, after.y, 1, ['rgba(255,255,255,0.7)', groundAt(egg.s, 1.25)], 50);
      }
      const form = formFor(egg.s);
      if (form !== prevForm) {
        burst(after.x, after.y - eggR(), 34, ['#ffffff', '#ffd84d', '#ff9a1a', '#fff3c2'], 230);
        if (roll.onForm) roll.onForm(form);
      }
      if (roll.onStep) roll.onStep(egg.s);
      if (roll.t >= 1) {
        const done = roll.done;
        roll = null;
        egg.rolling = false;
        egg.squash = 1;
        done();
      }
    } else {
      // settle upright
      const rest = Math.round(egg.angle / TAU) * TAU;
      egg.angle += (rest - egg.angle) * (1 - Math.exp(-dt * 7));
    }
    egg.squash *= Math.exp(-dt * 5);
    const target = pathPos(egg.s).y - H * anchor;
    cam += (target - cam) * (1 - Math.exp(-dt * 4.5));
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    time += dt;
    update(dt);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (cam < 700) drawSky();
    drawHill();
    drawSkillet();
    drawPath();
    drawNest();
    drawProps();
    drawZoneLines();
    drawEgg();
    drawParticles(dt);
    drawAtmosphere(dt);
    requestAnimationFrame(frame);
  }

  window.addEventListener('resize', resize);
  resize();
  cam = pathPos(0).y - H * anchor;
  requestAnimationFrame(frame);

  OE.drawAvatar = OE.drawEgg;
  OE.COPY = {
    distLabel: 'Downhill',
    hint: 'rarer answers roll further',
    submit: 'Roll',
    next: 'Roll on ▼',
    last: 'See your egg',
    gain: (pts, m) => `+${pts} pts · roll ${m}`,
    toast: (form) => `${form.emoji}  New form: ${form.name}`,
    timeout: "Time's up. You sat there and wobbled.",
    noGain: 'no ground gained',
    endDist: (m) => `${m} downhill`,
  };

  OE.world = {
    MAX,
    encounter() {},
    pressure(p) {
      pressure = p;
    },
    stats: () => null,
    egg,
    setAnchor(a) {
      anchor = a;
    },
    // Roll the egg to a new score. Resolves when it comes to rest.
    rollTo(to, { onStep, onForm } = {}) {
      to = clamp(to, 0, MAX);
      const delta = Math.abs(to - egg.s);
      return new Promise((done) => {
        if (delta < 0.01) return done();
        egg.rolling = true;
        egg.mood = 'happy';
        roll = { from: egg.s, to, t: 0, dur: reducedMotion ? 0.6 : 1.1 + delta * 0.028, onStep, onForm, done };
      });
    },
    jumpTo(s) {
      egg.s = clamp(s, 0, MAX);
      cam = pathPos(egg.s).y - H * anchor;
    },
    wobble() {
      egg.mood = 'sad';
      egg.squash = 1;
    },
    celebrate() {
      const p = pathPos(egg.s);
      burst(p.x, p.y - eggR(), 90, ['#ffd84d', '#ffffff', '#ff9a1a', '#ff8fb3', '#9df3ff'], 420);
    },
  };
})();
