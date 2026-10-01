// Quest mode: the same game turned sideways. The egg marches left to right
// through seven lands, earns a piece of armor every 100 points, and meets a
// dragon at every prompt. An answer worth 60+ slays it.
(function () {
  const OE = window.OE;
  if (OE.mode !== 'quest') return;

  const MAX = 700;
  const PX = 9; // world pixels per point
  const SLAY = 60;
  const TAU = Math.PI * 2;
  const INK = '#3b2416';

  OE.ZONES = [
    'Henhouse Hamlet',
    'Whispering Woods',
    'Mirror Marsh',
    'Crystal Hollow',
    'Stormpeak Pass',
    'Cinder Wastes',
    "The Dragon's Keep",
  ];

  OE.FORMS = [
    { name: 'Bare Egg', emoji: '🥚', gear: 'nothing but nerve', blurb: 'No armor. No plan. Still brave.' },
    { name: 'Squire', emoji: '🗡️', gear: 'Wooden Sword', blurb: 'A stick with ambitions.' },
    { name: 'Footman', emoji: '⛑️', gear: 'Iron Helm', blurb: 'Head protected. Mostly.' },
    { name: 'Knight', emoji: '🛡️', gear: 'Kite Shield', blurb: 'Properly armed and dangerous.' },
    { name: 'Champion', emoji: '🎖️', gear: "Champion's Cape", blurb: 'Bards have started taking notes.' },
    { name: 'Paladin', emoji: '✨', gear: 'Golden Plate', blurb: 'Shining from shell to sole.' },
    { name: 'Dragonslayer', emoji: '🔥', gear: 'Flameblade', blurb: 'Dragons check under the bed for you.' },
    { name: 'Egg of Legend', emoji: '👑', gear: 'Crown of the Realm', blurb: 'A perfect quest. Songs will be sung.' },
  ];

  const DRAGONS = [
    { name: 'Mossback Whelp', body: '#5fbf6a', belly: '#d8f0a8', wing: '#3f9a55' },
    { name: 'Thornwing', body: '#3fb0a0', belly: '#c9f2e0', wing: '#2a8a80' },
    { name: 'Marsh Wyrm', body: '#5a8ff0', belly: '#cfe2ff', wing: '#3a68c8' },
    { name: 'Crystal Drake', body: '#a274ea', belly: '#ecd9ff', wing: '#7a4cc8' },
    { name: 'Stormfang', body: '#a9d8ee', belly: '#ffffff', wing: '#6fa8c8' },
    { name: 'Cinderjaw', body: '#e8623a', belly: '#ffd08a', wing: '#b83a22' },
    { name: 'Yolkscorch the Dragon King', body: '#7a4f9a', belly: '#ff6a5a', wing: '#4f2f6e', king: true },
  ];

  // sky top, sky bottom, ground, far-mountain tint
  const LAND = [
    ['#7cc7ff', '#e6f6ff', '#7cc96b', '#9fd0e8'],
    ['#5fb8a0', '#d9f3c4', '#3f8f55', '#7fc0a0'],
    ['#8f9fd8', '#ecd9f2', '#4f9a8a', '#a9a6d6'],
    ['#221d50', '#5a4a9a', '#4a3f8a', '#3a3276'],
    ['#55688c', '#cfdcea', '#e3edf5', '#8ea2be'],
    ['#33151a', '#b5452a', '#5a2a22', '#6a2a24'],
    ['#1c1030', '#c0455a', '#3a2c48', '#4a2244'],
    ['#1c1030', '#c0455a', '#3a2c48', '#4a2244'],
  ].map((row) => row.map((c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]));

  const canvas = document.getElementById('world');
  const ctx = canvas.getContext('2d');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let W = 0;
  let H = 0;
  let dpr = 1;
  let k = 1; // scene scale for small screens
  let time = 0;
  let camX = 0;
  let shake = 0;
  let pressure = 0; // 0–1 as the clock runs down

  const hero = { s: 0, mood: 'happy', soot: 0, swing: 0, stride: 0, moving: false, squash: 0 };
  let dragon = null;
  let slain = 0;
  let met = 0;
  let tween = null;
  const particles = [];
  const texts = [];
  const motes = [];

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    k = Math.max(0.62, Math.min(1.35, W / 900, H / 760));
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    motes.length = 0;
    for (let i = 0; i < 40; i++) motes.push({ x: Math.random() * W, y: Math.random() * H, p: Math.random() * TAU, v: 0.3 + Math.random() * 0.7 });
  }

  const hash = (x, y) => {
    const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return v - Math.floor(v);
  };
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const sleep = (ms) => new Promise((r) => setTimeout(r, reducedMotion ? ms * 0.3 : ms));
  const heroR = () => 26 * k;
  const heroScreenX = () => (W < 700 ? W * 0.2 : W * 0.3);
  const groundY = (x) => H * 0.8 + Math.sin(x * 0.0045) * 12 + Math.sin(x * 0.011) * 5;
  const levelFor = (s) => (s >= MAX ? 7 : Math.min(6, Math.floor(s / 100)));

  function landColor(pts, i, shade = 1, alpha = 1) {
    const p = clamp(pts / 100, 0, 7);
    const a = Math.min(6, Math.floor(p));
    // hold each land's palette, then blend quickly across the border
    const t = clamp((p - a - 0.8) / 0.2, 0, 1);
    const c = LAND[a][i].map((v, j) => Math.round(clamp(lerp(v, LAND[a + 1][i][j], t) * shade, 0, 255)));
    return `rgba(${c[0]},${c[1]},${c[2]},${alpha})`;
  }

  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  /* ---------- the hero ---------- */

  // Drawn around the egg's centre. level 0–7 decides the gear.
  function drawHero(c, level, R, t, mood, pose) {
    const swing = (pose && pose.swing) || 0;
    const stride = (pose && pose.stride) || 0;
    const soot = (pose && pose.soot) || 0;
    const gold = level >= 5;
    const metal = gold ? '#ffcf3f' : '#b9c4cf';
    const metalDark = gold ? '#c98a00' : '#7d8894';
    const lw = Math.max(1.5, R * 0.09);

    // cape
    if (level >= 4) {
      c.beginPath();
      c.moveTo(-R * 0.5, -R * 0.55);
      c.quadraticCurveTo(-R * 1.5, -R * 0.1, -R * (1.5 + 0.15 * Math.sin(t * 5)), R * 0.95);
      c.quadraticCurveTo(-R * 0.9, R * (0.8 + 0.08 * Math.sin(t * 6)), -R * 0.35, R * 0.8);
      c.closePath();
      c.fillStyle = level >= 7 ? '#7a3fd0' : '#d2382c';
      c.fill();
      c.lineWidth = lw;
      c.strokeStyle = INK;
      c.lineJoin = 'round';
      c.stroke();
    }

    // feet
    c.fillStyle = INK;
    for (const side of [-1, 1]) {
      const lift = Math.max(0, Math.sin(stride + (side > 0 ? Math.PI : 0))) * R * 0.22;
      c.beginPath();
      c.ellipse(side * R * 0.34 + R * 0.08, R * 1.14 - lift, R * 0.26, R * 0.13, 0, 0, TAU);
      c.fill();
    }

    OE.drawEgg(c, 0, R, t, mood);

    // armor is painted inside the egg's outline
    c.save();
    OE.eggPath(c, R);
    c.clip();
    if (level >= 2) {
      c.fillStyle = metal;
      c.fillRect(-R * 1.2, R * 0.42, R * 2.4, R);
      c.fillStyle = metalDark;
      c.fillRect(-R * 1.2, R * 0.42, R * 2.4, R * 0.09);
      c.fillStyle = 'rgba(255,255,255,0.35)';
      c.fillRect(-R * 0.5, R * 0.55, R * 0.16, R * 0.6);
    } else if (level === 1) {
      c.fillStyle = '#8a5a34';
      c.fillRect(-R * 1.2, R * 0.5, R * 2.4, R * 0.2);
      c.fillStyle = '#ffcf3f';
      c.fillRect(-R * 0.12, R * 0.48, R * 0.24, R * 0.24);
    }
    if (level >= 2) {
      // helm with a brow line and nose guard
      c.fillStyle = metal;
      c.fillRect(-R * 1.2, -R * 1.3, R * 2.4, R * 0.86);
      c.fillStyle = metalDark;
      c.fillRect(-R * 1.2, -R * 0.52, R * 2.4, R * 0.1);
      c.fillRect(-R * 0.07, -R * 0.52, R * 0.14, R * 0.42);
      c.fillStyle = 'rgba(255,255,255,0.4)';
      c.beginPath();
      c.ellipse(-R * 0.32, -R * 0.85, R * 0.12, R * 0.2, -0.5, 0, TAU);
      c.fill();
    }
    if (soot > 0) {
      c.fillStyle = `rgba(30, 20, 20, ${0.55 * soot})`;
      c.fillRect(-R * 1.2, -R * 1.3, R * 2.4, R * 2.6);
    }
    c.restore();
    OE.eggPath(c, R);
    c.lineWidth = lw;
    c.strokeStyle = INK;
    c.stroke();

    // plume or crown
    if (level >= 7) {
      c.beginPath();
      const cy = -R * 1.08;
      c.moveTo(-R * 0.42, cy);
      c.lineTo(-R * 0.5, cy - R * 0.5);
      c.lineTo(-R * 0.22, cy - R * 0.26);
      c.lineTo(0, cy - R * 0.62);
      c.lineTo(R * 0.22, cy - R * 0.26);
      c.lineTo(R * 0.5, cy - R * 0.5);
      c.lineTo(R * 0.42, cy);
      c.closePath();
      c.fillStyle = '#ffd23f';
      c.fill();
      c.stroke();
      c.fillStyle = '#e0364a';
      c.beginPath();
      c.arc(0, cy - R * 0.2, R * 0.08, 0, TAU);
      c.fill();
    } else if (level >= 4) {
      c.beginPath();
      c.moveTo(0, -R * 1.1);
      c.quadraticCurveTo(-R * 0.2, -R * 1.9, -R * (0.85 + 0.1 * Math.sin(t * 5)), -R * 1.5);
      c.quadraticCurveTo(-R * 0.4, -R * 1.45, 0, -R * 1.1);
      c.fillStyle = '#e0364a';
      c.fill();
      c.stroke();
    }

    // shield on the leading side
    if (level >= 3) {
      c.save();
      c.translate(R * 0.62, R * 0.3);
      c.beginPath();
      c.moveTo(-R * 0.42, -R * 0.45);
      c.lineTo(R * 0.42, -R * 0.45);
      c.quadraticCurveTo(R * 0.46, R * 0.25, 0, R * 0.62);
      c.quadraticCurveTo(-R * 0.46, R * 0.25, -R * 0.42, -R * 0.45);
      c.closePath();
      c.fillStyle = gold ? '#ffcf3f' : '#3f73d8';
      c.fill();
      c.lineWidth = lw;
      c.strokeStyle = INK;
      c.stroke();
      c.beginPath();
      c.arc(0, -R * 0.02, R * 0.17, 0, TAU);
      c.fillStyle = gold ? '#ffffff' : '#ffcf3f';
      c.fill();
      c.restore();
    }

    // sword: rests over the shoulder, sweeps forward on a swing
    if (level >= 1) {
      c.save();
      c.translate(-R * 0.7, R * 0.2);
      const a = lerp(-2.5, -0.15, Math.sin(Math.min(1, swing) * Math.PI) ** 0.7);
      c.rotate(swing > 0 ? a : -2.5 + Math.sin(t * 2.2) * 0.04);
      const len = R * (level >= 6 ? 2.1 : 1.75);
      if (level >= 6) {
        const g = c.createRadialGradient(len * 0.6, 0, 2, len * 0.6, 0, len * 0.75);
        g.addColorStop(0, 'rgba(255, 170, 40, 0.6)');
        g.addColorStop(1, 'rgba(255, 120, 20, 0)');
        c.fillStyle = g;
        c.fillRect(-len * 0.2, -len * 0.75, len * 1.6, len * 1.5);
      }
      c.lineJoin = 'round';
      c.beginPath();
      c.moveTo(R * 0.3, -R * 0.13);
      c.lineTo(len, -R * 0.1);
      c.lineTo(len + R * 0.25, 0);
      c.lineTo(len, R * 0.1);
      c.lineTo(R * 0.3, R * 0.13);
      c.closePath();
      c.fillStyle = level === 1 ? '#b98952' : level >= 6 ? '#ffb02e' : '#e6edf3';
      c.fill();
      c.lineWidth = lw;
      c.strokeStyle = INK;
      c.stroke();
      if (level >= 6) {
        c.fillStyle = '#fff3a0';
        for (let i = 0; i < 4; i++) {
          const fx = R * 0.5 + (i / 4) * (len - R * 0.5);
          const fh = R * (0.3 + 0.18 * Math.sin(t * 14 + i * 2));
          c.beginPath();
          c.moveTo(fx, -R * 0.1);
          c.quadraticCurveTo(fx + R * 0.1, -R * 0.1 - fh, fx + R * 0.3, -R * 0.1);
          c.fill();
        }
      }
      c.fillStyle = level === 1 ? '#7a5235' : gold ? '#c98a00' : '#7d8894';
      roundRect(c, R * 0.2, -R * 0.32, R * 0.14, R * 0.64, R * 0.05);
      c.fill();
      c.stroke();
      roundRect(c, -R * 0.12, -R * 0.09, R * 0.34, R * 0.18, R * 0.06);
      c.fill();
      c.stroke();
      c.restore();
    }
  }

  /* ---------- dragons ---------- */

  function drawDragon(c, d, t) {
    const def = d.def;
    const flap = Math.sin(t * (d.airborne ? 11 : 2.6)) * (d.airborne ? 0.55 : 0.14);
    const lw = 3;
    c.lineJoin = 'round';
    c.lineCap = 'round';
    const stroke = () => {
      c.lineWidth = lw;
      c.strokeStyle = INK;
      c.stroke();
    };
    const wing = (back) => {
      c.save();
      c.translate(8, -78);
      c.rotate(-0.5 + flap * (back ? 0.8 : 1) - (back ? 0.25 : 0));
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(30, -74);
      c.lineTo(96, -66);
      c.quadraticCurveTo(84, -44, 70, -34);
      c.quadraticCurveTo(66, -22, 48, -14);
      c.quadraticCurveTo(40, -2, 22, 2);
      c.closePath();
      c.fillStyle = back ? def.wing : def.body;
      c.fill();
      stroke();
      c.beginPath();
      c.moveTo(30, -74);
      c.lineTo(70, -34);
      c.moveTo(30, -74);
      c.lineTo(48, -14);
      c.lineWidth = 2;
      c.strokeStyle = 'rgba(59, 36, 22, 0.5)';
      c.stroke();
      c.restore();
    };

    wing(true);

    // tail
    c.beginPath();
    c.moveTo(40, -44);
    c.quadraticCurveTo(110, -30, 118, -70 + Math.sin(t * 3) * 6);
    c.quadraticCurveTo(96, -50, 46, -70);
    c.closePath();
    c.fillStyle = def.body;
    c.fill();
    stroke();
    c.beginPath();
    c.moveTo(118, -70 + Math.sin(t * 3) * 6);
    c.lineTo(134, -88 + Math.sin(t * 3) * 6);
    c.lineTo(110, -86 + Math.sin(t * 3) * 6);
    c.closePath();
    c.fillStyle = def.wing;
    c.fill();
    stroke();

    // legs
    c.fillStyle = def.body;
    for (const lx of [-26, 22]) {
      roundRect(c, lx - 11, -30, 22, 32, 9);
      c.fill();
      stroke();
    }

    // body and belly
    c.beginPath();
    c.ellipse(0, -56, 60, 40, 0, 0, TAU);
    c.fillStyle = def.body;
    c.fill();
    stroke();
    c.save();
    c.clip();
    c.beginPath();
    c.ellipse(-12, -34, 46, 26, 0, 0, TAU);
    c.fillStyle = def.belly;
    c.fill();
    c.restore();

    // back spikes
    c.fillStyle = def.wing;
    for (let i = 0; i < 4; i++) {
      const sx = 4 + i * 15;
      const sy = -95 + i * i * 2.2;
      c.beginPath();
      c.moveTo(sx - 7, sy + 4);
      c.lineTo(sx + 3, sy - 13);
      c.lineTo(sx + 9, sy + 6);
      c.closePath();
      c.fill();
      stroke();
    }

    // neck and head lean in when breathing fire
    const lean = d.state === 'fire' ? -16 : Math.sin(t * 2) * 3;
    const hx = -84 + lean;
    const hy = -124 + Math.sin(t * 2.4) * 3;
    c.beginPath();
    c.moveTo(-34, -84);
    c.quadraticCurveTo(-60, -100, hx + 18, hy + 12);
    c.lineTo(hx + 34, hy - 6);
    c.quadraticCurveTo(-36, -128, -14, -92);
    c.closePath();
    c.fillStyle = def.body;
    c.fill();
    stroke();

    // horns
    c.fillStyle = '#fff1c9';
    for (const o of [0, 14]) {
      c.beginPath();
      c.moveTo(hx + 12 + o, hy - 14);
      c.lineTo(hx + 26 + o, hy - 38);
      c.lineTo(hx + 24 + o, hy - 10);
      c.closePath();
      c.fill();
      stroke();
    }
    // head
    c.beginPath();
    c.ellipse(hx + 10, hy, 26, 19, 0, 0, TAU);
    c.fillStyle = def.body;
    c.fill();
    stroke();
    // snout
    roundRect(c, hx - 34, hy - 6, 40, 22, 10);
    c.fill();
    stroke();
    c.fillStyle = INK;
    c.beginPath();
    c.arc(hx - 26, hy + 1, 2.2, 0, TAU);
    c.fill();
    // jaw line and a tooth
    c.beginPath();
    c.moveTo(hx - 30, hy + 9);
    c.lineTo(hx + 2, hy + 9);
    c.lineWidth = 2;
    c.stroke();
    c.fillStyle = '#fff';
    c.beginPath();
    c.moveTo(hx - 20, hy + 9);
    c.lineTo(hx - 16, hy + 16);
    c.lineTo(hx - 12, hy + 9);
    c.fill();
    // eye
    c.fillStyle = '#fff6c2';
    c.beginPath();
    c.ellipse(hx + 8, hy - 5, 7.5, 8.5, 0, 0, TAU);
    c.fill();
    c.lineWidth = 2;
    c.strokeStyle = INK;
    c.stroke();
    c.fillStyle = INK;
    c.beginPath();
    c.ellipse(hx + 6, hy - 4, 2.6, 5, 0, 0, TAU);
    c.fill();
    c.beginPath();
    c.moveTo(hx - 3, hy - 15);
    c.lineTo(hx + 17, hy - 11);
    c.lineWidth = 3.5;
    c.stroke();

    if (def.king) {
      c.beginPath();
      const cy = hy - 20;
      c.moveTo(hx - 4, cy);
      c.lineTo(hx - 8, cy - 20);
      c.lineTo(hx + 2, cy - 10);
      c.lineTo(hx + 9, cy - 24);
      c.lineTo(hx + 16, cy - 10);
      c.lineTo(hx + 26, cy - 20);
      c.lineTo(hx + 22, cy);
      c.closePath();
      c.fillStyle = '#ffd23f';
      c.fill();
      stroke();
    }

    wing(false);

    return { hx, hy };
  }

  function drawDragonAt(d) {
    const gy = groundY(d.x);
    const x = d.x - camX + d.ox;
    const y = gy + d.oy;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(d.scale * d.pop, d.scale * d.pop);
    ctx.rotate(d.spin);
    ctx.globalAlpha = d.alpha;
    if (!d.airborne) {
      ctx.fillStyle = 'rgba(20, 10, 30, 0.25)';
      ctx.beginPath();
      ctx.ellipse(0, 4, 70, 12, 0, 0, TAU);
      ctx.fill();
    }
    const head = drawDragon(ctx, d, time);
    if (d.flash > 0) {
      // impact star where the blade lands
      ctx.globalAlpha = Math.min(1, d.flash * 1.6);
      ctx.fillStyle = '#fff6c2';
      OE.sparkle(ctx, -58, -46, 24 + 44 * (1 - d.flash));
      ctx.fillStyle = '#ffffff';
      OE.sparkle(ctx, -58, -46, 12 + 24 * (1 - d.flash));
    }
    ctx.restore();
    d.mouth = { x: x + (head.hx - 34) * d.scale, y: y + (head.hy + 6) * d.scale };
    // as the clock runs down the dragon draws breath: fire gathers in its jaws
    if (d.state === 'idle' && pressure > 0) {
      const r = (14 + 46 * pressure) * d.scale * (0.9 + 0.1 * Math.sin(time * 18));
      const glow = ctx.createRadialGradient(d.mouth.x, d.mouth.y, 1, d.mouth.x, d.mouth.y, r);
      glow.addColorStop(0, `rgba(255, 240, 170, ${0.95 * pressure})`);
      glow.addColorStop(0.4, `rgba(255, 150, 40, ${0.8 * pressure})`);
      glow.addColorStop(1, 'rgba(255, 90, 20, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(d.mouth.x, d.mouth.y, r, 0, TAU);
      ctx.fill();
      if (Math.random() < pressure * 0.5) {
        particles.push({ x: d.mouth.x + camX, y: d.mouth.y, vx: -40 - Math.random() * 90, vy: (Math.random() - 0.5) * 80, life: 1, decay: 2.2, size: 3 + Math.random() * 3, color: '#ffb02e', gravity: -40 });
      }
    }

    // name and health
    if (d.state === 'idle' || d.state === 'hit' || d.state === 'fire') {
      const bw = 104 * k;
      const by = y - 196 * d.scale - 12;
      ctx.font = `600 ${Math.round(13 * Math.max(0.85, k))}px Fredoka, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(30, 16, 10, 0.75)';
      ctx.strokeText(d.def.name, x, by - 8);
      ctx.fillStyle = '#fff3d6';
      ctx.fillText(d.def.name, x, by - 8);
      ctx.fillStyle = 'rgba(30, 16, 10, 0.8)';
      roundRect(ctx, x - bw / 2 - 3, by - 3, bw + 6, 14, 7);
      ctx.fill();
      ctx.fillStyle = '#e0364a';
      roundRect(ctx, x - bw / 2, by, Math.max(8, bw * (d.hpShown / SLAY)), 8, 4);
      ctx.fill();
    }
  }

  function spawnDragon(i) {
    const def = DRAGONS[Math.min(i, DRAGONS.length - 1)];
    const scale = (def.king ? 1.3 : 0.82 + i * 0.06) * k;
    const heroX = hero.s * PX;
    dragon = {
      def,
      scale,
      x: heroX + 10 * PX + heroR() * 1.4 + 100 * scale,
      ox: W * 0.7,
      oy: -H * 0.5,
      state: 'enter',
      t: 0,
      airborne: true,
      hp: SLAY,
      hpShown: SLAY,
      flash: 0,
      alpha: 1,
      spin: 0,
      pop: 1,
      mouth: null,
    };
  }

  function updateDragon(dt) {
    const d = dragon;
    if (!d) return;
    d.t += dt;
    d.flash = Math.max(0, d.flash - dt * 4);
    d.hpShown += (d.hp - d.hpShown) * (1 - Math.exp(-dt * 10));
    if (d.state === 'enter') {
      const p = clamp(d.t / 1.1, 0, 1);
      const e = 1 - (1 - p) ** 3;
      d.ox = W * 0.7 * (1 - e);
      d.oy = -H * 0.5 * (1 - e) - Math.sin(p * Math.PI) * 30;
      if (p >= 1) {
        d.state = 'idle';
        d.airborne = false;
        d.ox = 0;
        d.oy = 0;
        shake = Math.max(shake, 5);
        burst(d.x, groundY(d.x), 12, ['rgba(255,255,255,0.7)', landColor(hero.s, 2, 1.2)], 120);
      }
    } else if (d.state === 'hit') {
      d.ox = Math.max(0, 22 - d.t * 60);
    } else if (d.state === 'flee') {
      d.airborne = true;
      d.ox += dt * (160 + d.t * 520);
      d.oy -= dt * (120 + d.t * 420);
      if (d.oy < -H) dragon = null;
    } else if (d.state === 'dead') {
      d.spin += dt * 9;
      d.pop = Math.max(0, 1 - d.t / 0.55);
      d.oy -= dt * 60;
      if (d.pop <= 0) dragon = null;
    } else if (d.state === 'fire') {
      if (d.mouth) {
        const hx = hero.s * PX - camX;
        const hy = groundY(hero.s * PX) - heroR();
        for (let i = 0; i < 4; i++) {
          const a = Math.atan2(hy - d.mouth.y, hx - d.mouth.x) + (Math.random() - 0.5) * 0.45;
          const v = 420 + Math.random() * 260;
          particles.push({
            x: d.mouth.x + camX,
            y: d.mouth.y,
            vx: Math.cos(a) * v,
            vy: Math.sin(a) * v,
            life: 1,
            decay: 2.4,
            size: 7 + Math.random() * 9,
            color: ['#ffd23f', '#ff9a1a', '#ff5a1f'][Math.floor(Math.random() * 3)],
            gravity: -60,
          });
        }
      }
      hero.soot = Math.min(1, hero.soot + dt * 2);
      shake = Math.max(shake, 3);
      if (d.t > 0.95) {
        d.state = 'flee';
        d.t = 0;
      }
    }
  }

  /* ---------- scenery ---------- */

  function cloud(x, y, r, alpha) {
    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.6, 0, TAU);
    ctx.arc(x + r * 0.7, y + r * 0.1, r * 0.48, 0, TAU);
    ctx.arc(x - r * 0.7, y + r * 0.12, r * 0.42, 0, TAU);
    ctx.arc(x + r * 0.2, y - r * 0.3, r * 0.45, 0, TAU);
    ctx.fill();
  }

  function drawSky(pts) {
    const g = ctx.createLinearGradient(0, 0, 0, H * 0.8);
    g.addColorStop(0, landColor(pts, 0));
    g.addColorStop(1, landColor(pts, 1));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    const dark = pts >= 290 && pts < 390 ? 1 : pts >= 490 ? 1 : 0;
    if (dark) {
      for (let i = 0; i < 60; i++) {
        const tw = 0.4 + 0.6 * Math.abs(Math.sin(time * 1.5 + i));
        ctx.fillStyle = `rgba(255,255,255,${0.7 * tw})`;
        ctx.fillRect(((hash(i, 1) * W * 1.4 - camX * 0.05) % W + W) % W, hash(i, 2) * H * 0.55, 2, 2);
      }
      ctx.fillStyle = pts >= 490 ? 'rgba(255, 190, 150, 0.85)' : 'rgba(230, 230, 255, 0.9)';
      ctx.beginPath();
      ctx.arc(W * 0.78, H * 0.16, 36 * k, 0, TAU);
      ctx.fill();
    } else {
      const sun = ctx.createRadialGradient(W * 0.8, H * 0.17, 8, W * 0.8, H * 0.17, 150);
      sun.addColorStop(0, 'rgba(255, 248, 205, 0.95)');
      sun.addColorStop(0.25, 'rgba(255, 232, 160, 0.55)');
      sun.addColorStop(1, 'rgba(255, 232, 160, 0)');
      ctx.fillStyle = sun;
      ctx.fillRect(W * 0.8 - 160, H * 0.17 - 160, 320, 320);
      for (let i = 0; i < 6; i++) {
        const span = W + 400;
        const x = (((hash(i, 4) * span + time * (5 + hash(i, 5) * 9) - camX * 0.08) % span) + span) % span - 200;
        cloud(x, 50 + hash(i, 6) * H * 0.32, 30 + hash(i, 7) * 34, 0.75);
      }
    }
  }

  function drawMountains(pts) {
    for (const [par, base, amp, shade, alpha] of [
      [0.12, 0.6, 0.3, 0.78, 0.9],
      [0.28, 0.68, 0.2, 0.62, 1],
    ]) {
      const step = 190;
      const off = camX * par;
      const first = Math.floor(off / step) - 1;
      ctx.fillStyle = landColor(pts, 3, shade, alpha);
      ctx.beginPath();
      ctx.moveTo(-10, H);
      for (let i = first; i * step - off < W + step; i++) {
        const x = i * step - off;
        const h = H * (base - amp * (0.35 + 0.65 * hash(i, par * 100)));
        ctx.lineTo(x, H * base + 20);
        ctx.lineTo(x + step * 0.5, h);
      }
      ctx.lineTo(W + 10, H);
      ctx.closePath();
      ctx.fill();
      // snow caps on the near range
      if (par > 0.2 && pts >= 390 && pts < 490) {
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        for (let i = first; i * step - off < W + step; i++) {
          const x = i * step - off + step * 0.5;
          const h = H * (base - amp * (0.35 + 0.65 * hash(i, par * 100)));
          ctx.beginPath();
          ctx.moveTo(x, h);
          ctx.lineTo(x - 26, h + 34);
          ctx.lineTo(x - 8, h + 26);
          ctx.lineTo(x + 6, h + 38);
          ctx.lineTo(x + 26, h + 34);
          ctx.closePath();
          ctx.fill();
        }
      }
    }
  }

  const PROPS = {
    cottage(x, y, s, r) {
      ctx.fillStyle = '#fff3d6';
      ctx.fillRect(x - 30 * s, y - 40 * s, 60 * s, 42 * s);
      ctx.fillStyle = ['#d2553a', '#8a5ad0', '#3f8fd8'][Math.floor(r * 3)];
      ctx.beginPath();
      ctx.moveTo(x - 38 * s, y - 38 * s);
      ctx.lineTo(x, y - 72 * s);
      ctx.lineTo(x + 38 * s, y - 38 * s);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#7a5235';
      roundRect(ctx, x - 8 * s, y - 24 * s, 16 * s, 26 * s, 7 * s);
      ctx.fill();
      ctx.fillStyle = '#ffe08a';
      ctx.fillRect(x + 13 * s, y - 30 * s, 10 * s, 10 * s);
    },
    fence(x, y, s) {
      ctx.strokeStyle = '#b98952';
      ctx.lineWidth = 4 * s;
      ctx.beginPath();
      ctx.moveTo(x - 40 * s, y - 14 * s);
      ctx.lineTo(x + 40 * s, y - 14 * s);
      for (let i = -2; i <= 2; i++) {
        ctx.moveTo(x + i * 18 * s, y);
        ctx.lineTo(x + i * 18 * s, y - 24 * s);
      }
      ctx.stroke();
    },
    tree(x, y, s, r) {
      ctx.fillStyle = '#7a5235';
      ctx.fillRect(x - 5 * s, y - 34 * s, 10 * s, 36 * s);
      ctx.fillStyle = r > 0.5 ? '#3f9d5a' : '#58b368';
      ctx.beginPath();
      ctx.arc(x, y - 56 * s, 32 * s, 0, TAU);
      ctx.arc(x - 20 * s, y - 40 * s, 20 * s, 0, TAU);
      ctx.arc(x + 20 * s, y - 40 * s, 20 * s, 0, TAU);
      ctx.fill();
    },
    hay(x, y, s) {
      ctx.fillStyle = '#e9c05a';
      ctx.beginPath();
      ctx.ellipse(x, y - 14 * s, 26 * s, 18 * s, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(160, 110, 30, 0.4)';
      ctx.fillRect(x - 22 * s, y - 16 * s, 44 * s, 3 * s);
    },
    pine(x, y, s, r, snowy) {
      ctx.fillStyle = '#5f4630';
      ctx.fillRect(x - 5 * s, y - 20 * s, 10 * s, 22 * s);
      for (let i = 0; i < 4; i++) {
        const w = (38 - i * 8) * s;
        const yy = y - (16 + i * 26) * s;
        ctx.fillStyle = snowy && i >= 2 ? '#f4fbff' : snowy ? '#4f8f86' : i % 2 ? '#2f7d4a' : '#27693f';
        ctx.beginPath();
        ctx.moveTo(x - w, yy);
        ctx.lineTo(x, yy - 40 * s);
        ctx.lineTo(x + w, yy);
        ctx.closePath();
        ctx.fill();
      }
    },
    snowPine(x, y, s, r) {
      PROPS.pine(x, y, s, r, true);
    },
    mushroom(x, y, s, r) {
      const big = 1 + r;
      ctx.fillStyle = '#fff1d6';
      roundRect(ctx, x - 8 * s * big, y - 30 * s * big, 16 * s * big, 32 * s * big, 6 * s);
      ctx.fill();
      ctx.fillStyle = ['#ff5d73', '#b574ff', '#ff9a3c', '#3fd6c6'][Math.floor(r * 4)];
      ctx.beginPath();
      ctx.ellipse(x, y - 30 * s * big, 30 * s * big, 22 * s * big, 0, Math.PI, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (const [dx, dy, rr] of [[-12, -38, 5], [5, -44, 6], [16, -36, 4]]) {
        ctx.beginPath();
        ctx.arc(x + dx * s * big, y + dy * s * big, rr * s * big, 0, TAU);
        ctx.fill();
      }
    },
    reeds(x, y, s, r) {
      for (let i = 0; i < 5; i++) {
        const sway = Math.sin(time * 1.6 + r * 9 + i) * 4;
        ctx.strokeStyle = '#2f6f5a';
        ctx.lineWidth = 3 * s;
        ctx.beginPath();
        ctx.moveTo(x + (i - 2) * 8 * s, y);
        ctx.quadraticCurveTo(x + (i - 2) * 8 * s, y - 30 * s, x + (i - 2) * 8 * s + sway, y - (46 + i * 5) * s);
        ctx.stroke();
        ctx.fillStyle = '#6b4526';
        ctx.beginPath();
        ctx.ellipse(x + (i - 2) * 8 * s + sway, y - (46 + i * 5) * s, 3.5 * s, 9 * s, 0, 0, TAU);
        ctx.fill();
      }
    },
    pond(x, y, s, r) {
      ctx.fillStyle = '#2f7f9a';
      ctx.beginPath();
      ctx.ellipse(x, y + 12 * s, 54 * s, 11 * s, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#9fe6ee';
      ctx.beginPath();
      ctx.ellipse(x, y + 10 * s, 48 * s, 8 * s, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#58b368';
      ctx.beginPath();
      ctx.ellipse(x - 14 * s + Math.sin(time + r * 7) * 3, y + 10 * s, 10 * s, 3.5 * s, 0, 0, TAU);
      ctx.fill();
    },
    stone(x, y, s) {
      ctx.fillStyle = 'rgba(40, 40, 60, 0.55)';
      ctx.beginPath();
      ctx.ellipse(x, y - 9 * s, 24 * s, 15 * s, 0, 0, TAU);
      ctx.ellipse(x + 18 * s, y - 5 * s, 13 * s, 9 * s, 0, 0, TAU);
      ctx.fill();
    },
    crystal(x, y, s, r) {
      const cols = r > 0.5 ? ['#9df3ff', '#57b7ff'] : ['#ffb3ec', '#c874ff'];
      for (const [dx, h, w, lean] of [[-16, 44, 11, -0.25], [0, 78, 14, 0.05], [18, 52, 11, 0.3]]) {
        ctx.fillStyle = cols[dx === 0 ? 0 : 1];
        ctx.beginPath();
        ctx.moveTo(x + (dx - w) * s, y);
        ctx.lineTo(x + (dx + lean * h) * s, y - h * s);
        ctx.lineTo(x + (dx + w) * s, y);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = `rgba(255,255,255,${0.5 + 0.5 * Math.sin(time * 3 + r * 30)})`;
      OE.sparkle(ctx, x + 4 * s, y - 72 * s, 8 * s);
    },
    stalagmite(x, y, s) {
      ctx.fillStyle = 'rgba(30, 24, 70, 0.7)';
      ctx.beginPath();
      ctx.moveTo(x - 18 * s, y);
      ctx.lineTo(x, y - 60 * s);
      ctx.lineTo(x + 18 * s, y);
      ctx.closePath();
      ctx.fill();
    },
    rock(x, y, s) {
      ctx.fillStyle = '#7f8ea6';
      ctx.beginPath();
      ctx.moveTo(x - 34 * s, y);
      ctx.lineTo(x - 18 * s, y - 38 * s);
      ctx.lineTo(x + 8 * s, y - 50 * s);
      ctx.lineTo(x + 34 * s, y);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(x - 18 * s, y - 38 * s);
      ctx.lineTo(x + 8 * s, y - 50 * s);
      ctx.lineTo(x + 16 * s, y - 34 * s);
      ctx.lineTo(x - 4 * s, y - 40 * s);
      ctx.lineTo(x - 22 * s, y - 28 * s);
      ctx.closePath();
      ctx.fill();
    },
    flag(x, y, s, r) {
      ctx.fillStyle = '#5f4630';
      ctx.fillRect(x - 2 * s, y - 70 * s, 4 * s, 72 * s);
      ctx.fillStyle = r > 0.5 ? '#e0364a' : '#ffcf3f';
      ctx.beginPath();
      ctx.moveTo(x + 2 * s, y - 70 * s);
      ctx.quadraticCurveTo(x + 22 * s, y - (66 + Math.sin(time * 5 + r * 9) * 4) * s, x + 40 * s, y - 60 * s);
      ctx.lineTo(x + 2 * s, y - 48 * s);
      ctx.closePath();
      ctx.fill();
    },
    deadTree(x, y, s) {
      ctx.strokeStyle = '#2a1512';
      ctx.lineWidth = 7 * s;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y - 50 * s);
      ctx.moveTo(x, y - 30 * s);
      ctx.lineTo(x - 22 * s, y - 56 * s);
      ctx.moveTo(x, y - 42 * s);
      ctx.lineTo(x + 20 * s, y - 70 * s);
      ctx.stroke();
    },
    lava(x, y, s, r) {
      const pulse = 0.7 + 0.3 * Math.sin(time * 2.4 + r * 20);
      const glow = ctx.createRadialGradient(x, y + 10 * s, 2, x, y + 10 * s, 70 * s);
      glow.addColorStop(0, `rgba(255, 150, 40, ${0.5 * pulse})`);
      glow.addColorStop(1, 'rgba(255, 110, 20, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(x - 70 * s, y - 60 * s, 140 * s, 140 * s);
      ctx.fillStyle = '#ff7a1a';
      ctx.beginPath();
      ctx.ellipse(x, y + 12 * s, 46 * s, 9 * s, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath();
      ctx.ellipse(x - 6 * s, y + 11 * s, 26 * s, 4.5 * s, 0, 0, TAU);
      ctx.fill();
      for (let i = 0; i < 3; i++) {
        const f = (time * 0.5 + i / 3 + r) % 1;
        ctx.fillStyle = `rgba(255, 200, 80, ${1 - f})`;
        ctx.beginPath();
        ctx.arc(x + Math.sin(f * 9 + i * 2) * 16 * s, y + 6 * s - f * 60 * s, 2.5 * s, 0, TAU);
        ctx.fill();
      }
    },
    skull(x, y, s) {
      ctx.fillStyle = '#e9dcc0';
      ctx.beginPath();
      ctx.arc(x, y - 12 * s, 12 * s, 0, TAU);
      ctx.fill();
      ctx.fillRect(x - 7 * s, y - 6 * s, 14 * s, 8 * s);
      ctx.fillStyle = '#2a1512';
      ctx.beginPath();
      ctx.arc(x - 4.5 * s, y - 13 * s, 3 * s, 0, TAU);
      ctx.arc(x + 4.5 * s, y - 13 * s, 3 * s, 0, TAU);
      ctx.fill();
    },
    tower(x, y, s, r) {
      const h = (120 + r * 90) * s;
      ctx.fillStyle = '#241a30';
      ctx.fillRect(x - 26 * s, y - h, 52 * s, h + 2);
      for (let i = -1; i <= 1; i++) ctx.fillRect(x + i * 20 * s - 8 * s, y - h - 12 * s, 16 * s, 14 * s);
      ctx.fillStyle = `rgba(255, 170, 60, ${0.7 + 0.3 * Math.sin(time * 4 + r * 30)})`;
      roundRect(ctx, x - 6 * s, y - h * 0.68, 12 * s, 20 * s, 6 * s);
      ctx.fill();
    },
    torch(x, y, s, r) {
      ctx.fillStyle = '#3a2a2a';
      ctx.fillRect(x - 3 * s, y - 44 * s, 6 * s, 46 * s);
      const f = 1 + 0.2 * Math.sin(time * 13 + r * 40);
      const glow = ctx.createRadialGradient(x, y - 52 * s, 2, x, y - 52 * s, 50 * s);
      glow.addColorStop(0, 'rgba(255, 170, 50, 0.6)');
      glow.addColorStop(1, 'rgba(255, 120, 20, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(x - 50 * s, y - 102 * s, 100 * s, 100 * s);
      ctx.fillStyle = '#ff8a1f';
      ctx.beginPath();
      ctx.moveTo(x - 8 * s, y - 44 * s);
      ctx.quadraticCurveTo(x, y - (44 + 30 * f) * s, x + 8 * s, y - 44 * s);
      ctx.fill();
    },
    gold(x, y, s, r) {
      ctx.fillStyle = '#e0a100';
      ctx.beginPath();
      ctx.moveTo(x - 44 * s, y + 2);
      ctx.quadraticCurveTo(x, y - (50 + r * 30) * s, x + 44 * s, y + 2);
      ctx.fill();
      ctx.fillStyle = '#ffd23f';
      for (let i = 0; i < 9; i++) {
        ctx.beginPath();
        ctx.ellipse(x + (hash(i, r * 50) - 0.5) * 60 * s, y - hash(i, r * 70) * 26 * s, 6 * s, 3 * s, 0, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = `rgba(255,255,255,${0.5 + 0.5 * Math.sin(time * 4 + r * 30)})`;
      OE.sparkle(ctx, x + 8 * s, y - 34 * s, 7 * s);
    },
  };

  const LAND_PROPS = [
    ['cottage', 'fence', 'tree', 'hay', 'tree', 'cottage'],
    ['pine', 'pine', 'mushroom', 'tree', 'pine'],
    ['reeds', 'pond', 'stone', 'reeds', 'mushroom'],
    ['crystal', 'stalagmite', 'crystal', 'mushroom', 'stalagmite'],
    ['snowPine', 'rock', 'rock', 'flag', 'snowPine'],
    ['deadTree', 'lava', 'stone', 'skull', 'lava'],
    ['tower', 'torch', 'gold', 'tower', 'gold'],
  ];

  function drawProps() {
    const cell = 150 * k;
    const first = Math.floor((camX - 200) / cell);
    for (let i = first; i * cell < camX + W + 200; i++) {
      if (hash(i, 11) > 0.78) continue;
      const x = (i + 0.2 + hash(i, 12) * 0.6) * cell;
      const pts = x / PX;
      const land = clamp(Math.floor(pts / 100), 0, 6);
      const list = LAND_PROPS[land];
      const kind = list[Math.floor(hash(i, 13) * list.length)];
      PROPS[kind](x - camX, groundY(x) - 16 * k, (0.85 + hash(i, 14) * 0.4) * k, hash(i, 15));
    }
  }

  function drawSigns() {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let z = 0; z <= 6; z++) {
      const wx = z * 100 * PX + (z === 0 ? -150 * k : 0);
      const x = wx - camX;
      if (x < -200 || x > W + 200) continue;
      const y = groundY(wx) - 18 * k;
      ctx.font = `600 ${Math.round(14 * Math.max(0.85, k))}px Fredoka, system-ui, sans-serif`;
      const label = OE.ZONES[z];
      const tw = ctx.measureText(label).width + 26;
      ctx.fillStyle = '#7a5235';
      ctx.fillRect(x - 4, y - 70 * k, 8, 72 * k);
      ctx.fillStyle = '#e9c98a';
      roundRect(ctx, x - tw / 2, y - 100 * k, tw, 34, 8);
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = INK;
      ctx.stroke();
      ctx.fillStyle = INK;
      ctx.fillText(label, x, y - 100 * k + 18);
    }
  }

  function drawGround(pts) {
    const trace = (dy) => {
      ctx.beginPath();
      ctx.moveTo(-10, H + 10);
      for (let x = -10; x <= W + 10; x += 16) ctx.lineTo(x, groundY(x + camX) + dy);
      ctx.lineTo(W + 10, H + 10);
      ctx.closePath();
    };
    // a ridge behind the road
    trace(-18 * k);
    ctx.fillStyle = landColor(pts, 2, 0.82);
    ctx.fill();
    trace(0);
    ctx.fillStyle = landColor(pts, 2);
    ctx.fill();
    // the road
    ctx.beginPath();
    for (let x = -10; x <= W + 10; x += 16) {
      const y = groundY(x + camX) + 8 * k;
      if (x === -10) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.lineCap = 'round';
    ctx.lineWidth = 26 * k;
    ctx.strokeStyle = 'rgba(20, 10, 30, 0.22)';
    ctx.stroke();
    ctx.lineWidth = 20 * k;
    ctx.strokeStyle = pts >= 590 ? '#8a7a8a' : '#f1dfb6';
    ctx.stroke();
    ctx.setLineDash([3, 18]);
    ctx.lineDashOffset = camX;
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(120, 80, 40, 0.3)';
    ctx.stroke();
    ctx.setLineDash([]);
    // darker earth toward the bottom edge
    const g = ctx.createLinearGradient(0, H * 0.84, 0, H);
    g.addColorStop(0, 'rgba(20, 10, 30, 0)');
    g.addColorStop(1, 'rgba(20, 10, 30, 0.35)');
    ctx.fillStyle = g;
    ctx.fillRect(0, H * 0.84, W, H * 0.16);
  }

  function drawCaveRoof(pts) {
    const a = clamp(1 - Math.abs(pts - 350) / 70, 0, 1);
    if (a <= 0) return;
    ctx.fillStyle = `rgba(22, 16, 56, ${a})`;
    const step = 90;
    const first = Math.floor(camX / step) - 1;
    ctx.beginPath();
    ctx.moveTo(-10, -10);
    for (let i = first; i * step - camX < W + step; i++) {
      const x = i * step - camX;
      ctx.lineTo(x, 30);
      ctx.lineTo(x + step * 0.5, 50 + hash(i, 21) * 110 * k);
    }
    ctx.lineTo(W + 10, -10);
    ctx.closePath();
    ctx.fill();
  }

  // a far-off dragon crossing the sky now and then
  function drawDistantDragon() {
    const cycle = (time * 0.035) % 1;
    if (cycle > 0.5) return;
    ctx.save();
    ctx.translate(W * (1.15 - cycle * 2.6), H * (0.2 + 0.05 * Math.sin(time * 0.7)));
    ctx.scale(0.3 * k, 0.3 * k);
    ctx.globalAlpha = 0.5;
    drawDragon(ctx, { def: { body: '#2a2030', belly: '#2a2030', wing: '#2a2030' }, airborne: true, state: 'idle', flash: 0 }, time);
    ctx.restore();
  }

  /* ---------- particles and text ---------- */

  function burst(x, y, n, colors, speed) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const v = (0.3 + Math.random()) * speed;
      particles.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - speed * 0.5,
        life: 1,
        decay: 0.8 + Math.random() * 0.9,
        size: 3 + Math.random() * 6,
        color: colors[Math.floor(Math.random() * colors.length)],
        gravity: 420,
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
      p.vy += p.gravity * dt;
      ctx.globalAlpha = Math.min(1, p.life * 1.4);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x - camX, p.y, p.size * (0.4 + p.life * 0.6), 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function say(x, y, text, color, size) {
    texts.push({ x, y, text, color, size: size || 30, life: 1 });
  }

  function drawTexts(dt) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = texts.length - 1; i >= 0; i--) {
      const f = texts[i];
      f.life -= dt * 0.75;
      if (f.life <= 0) {
        texts.splice(i, 1);
        continue;
      }
      f.y -= dt * 46;
      const pop = Math.min(1, (1 - f.life) * 9);
      ctx.font = `700 ${Math.round(f.size * k * (0.6 + 0.4 * pop))}px Fredoka, system-ui, sans-serif`;
      ctx.globalAlpha = Math.min(1, f.life * 2.2);
      ctx.lineWidth = 6;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = INK;
      ctx.strokeText(f.text, f.x - camX, f.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x - camX, f.y);
    }
    ctx.globalAlpha = 1;
  }

  function drawSlash() {
    if (hero.swing <= 0.25 || hero.swing >= 0.95) return;
    const x = hero.s * PX - camX;
    const y = groundY(hero.s * PX) - heroR() * 1.1;
    const p = (hero.swing - 0.25) / 0.7;
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = 1 - p;
    ctx.strokeStyle = levelFor(hero.s) >= 6 ? '#ffb02e' : '#ffffff';
    ctx.lineWidth = 9 * k * (1 - p * 0.5);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, 0, heroR() * 3, -1.25, -1.25 + 1.9 * Math.min(1, p * 1.6));
    ctx.stroke();
    ctx.restore();
  }

  function drawAtmosphere(dt, pts) {
    const land = clamp(Math.floor(pts / 100), 0, 6);
    const rising = land >= 5;
    const col = ['255,255,255', '210,255,200', '200,240,255', '200,180,255', '255,255,255', '255,170,70', '255,140,60'][land];
    for (const m of motes) {
      m.p += dt * m.v;
      m.y += (rising ? -30 : land === 4 ? 40 : 8) * m.v * dt;
      m.x += Math.sin(m.p) * 12 * dt - (land === 4 ? 30 * dt : 0);
      if (m.y < -10) m.y = H + 10;
      if (m.y > H + 10) m.y = -10;
      if (m.x < -10) m.x = W + 10;
      ctx.fillStyle = `rgba(${col}, ${0.25 + 0.35 * Math.abs(Math.sin(m.p * 1.3))})`;
      ctx.beginPath();
      ctx.arc(m.x, m.y, 1.4 + m.v * 1.8, 0, TAU);
      ctx.fill();
    }
    if (land >= 5 || land === 3) {
      const v = ctx.createRadialGradient(W / 2, H * 0.55, Math.min(W, H) * 0.4, W / 2, H * 0.55, Math.max(W, H) * 0.85);
      v.addColorStop(0, 'rgba(10, 4, 20, 0)');
      v.addColorStop(1, 'rgba(10, 4, 20, 0.5)');
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, W, H);
    }
  }

  /* ---------- loop ---------- */

  function drawHeroAt() {
    const wx = hero.s * PX;
    const R = heroR();
    const gy = groundY(wx);
    const hop = hero.moving ? Math.abs(Math.sin(hero.stride)) * R * 0.3 : 0;
    ctx.fillStyle = 'rgba(20, 10, 30, 0.28)';
    ctx.beginPath();
    ctx.ellipse(wx - camX, gy + 8 * k, R * 0.9, R * 0.26, 0, 0, TAU);
    ctx.fill();
    ctx.save();
    const jit = reducedMotion ? 0 : pressure * 3;
    ctx.translate(wx - camX + (Math.random() - 0.5) * jit, gy - R * 1.02 - hop + (hero.moving ? 0 : Math.sin(time * 2.2) * 1.5) + (Math.random() - 0.5) * jit);
    ctx.rotate((hero.moving ? 0.1 : 0) + (hero.mood === 'sad' ? Math.sin(time * 14) * 0.06 * hero.squash : 0) + (hero.swing > 0 ? 0.16 : 0));
    const sq = 1 + hero.squash * 0.14;
    ctx.scale(sq, 1 / sq);
    drawHero(ctx, levelFor(hero.s), R, time, hero.mood, hero);
    ctx.restore();
  }

  function update(dt) {
    if (tween) {
      tween.t += dt / tween.dur;
      const p = Math.min(1, tween.t);
      const e = p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
      const before = levelFor(hero.s);
      const prev = hero.s;
      hero.s = lerp(tween.from, tween.to, e);
      hero.stride += (hero.s - prev) * PX * 0.09;
      hero.moving = true;
      if (Math.random() < 0.4) {
        burst(hero.s * PX - 12, groundY(hero.s * PX) + 4, 1, ['rgba(255,255,255,0.6)', landColor(hero.s, 2, 1.25)], 60);
      }
      const level = levelFor(hero.s);
      if (level !== before) {
        burst(hero.s * PX, groundY(hero.s * PX) - heroR(), 36, ['#ffffff', '#ffd84d', '#b9c4cf', '#fff3c2'], 260);
        if (tween.onForm) tween.onForm(level);
      }
      if (tween.onStep) tween.onStep(hero.s);
      if (p >= 1) {
        const done = tween.done;
        tween = null;
        hero.moving = false;
        hero.squash = 0.6;
        done();
      }
    }
    if (hero.swingT != null) {
      hero.swingT += dt / 0.34;
      hero.swing = Math.min(1, hero.swingT);
      if (hero.swingT >= 1) {
        hero.swingT = null;
        hero.swing = 0;
      }
    }
    hero.squash *= Math.exp(-dt * 5);
    updateDragon(dt);
    shake *= Math.exp(-dt * 7);
    const target = hero.s * PX - heroScreenX();
    camX += (target - camX) * (1 - Math.exp(-dt * 5));
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    time += dt;
    update(dt);
    const pts = (camX + W * 0.45) / PX;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (shake > 0.3 && !reducedMotion) ctx.translate((Math.random() - 0.5) * shake * 2, (Math.random() - 0.5) * shake * 2);
    drawSky(pts);
    drawDistantDragon();
    drawMountains(pts);
    drawCaveRoof(pts);
    drawGround(pts);
    drawProps();
    drawSigns();
    if (dragon) drawDragonAt(dragon);
    drawHeroAt();
    drawSlash();
    drawParticles(dt);
    drawTexts(dt);
    drawAtmosphere(dt, pts);
    requestAnimationFrame(frame);
  }

  function moveTo(to, dur, hooks) {
    return new Promise((done) => {
      if (Math.abs(to - hero.s) < 0.01) return done();
      tween = { from: hero.s, to, t: 0, dur: reducedMotion ? Math.min(dur, 0.4) : dur, onStep: hooks.onStep, onForm: hooks.onForm, done };
    });
  }

  window.addEventListener('resize', resize);
  resize();
  camX = -heroScreenX();
  requestAnimationFrame(frame);

  OE.drawAvatar = (c, level, R, t, mood) => drawHero(c, level, R * 0.8, t, mood, null);
  OE.COPY = {
    distLabel: 'Journey',
    hint: 'rarer answers strike harder',
    submit: 'Strike',
    next: 'Onward ▶',
    last: 'See your legend',
    gain: (pts, m) => `+${pts} pts · dragon ${pts >= SLAY ? 'slain' : 'driven off'} · march ${m}`,
    toast: (form) => `${form.emoji}  New gear: ${form.gear}`,
    timeout: "Time's up. The dragon toasted you.",
    noGain: 'singed, and no ground gained',
    endDist: (m) => `${m} travelled`,
  };

  OE.world = {
    MAX,
    egg: hero,
    setAnchor() {},
    pressure(p) {
      pressure = p;
    },
    stats: () => ({ slain, met }),
    // a dragon lands in the road for this prompt
    encounter(i) {
      met = i + 1;
      spawnDragon(i);
    },
    // Charge, strike the dragon for `pts`, then march on to the new score.
    async rollTo(to, { onStep, onForm, pts } = {}) {
      to = clamp(to, 0, MAX);
      const hooks = { onStep, onForm };
      hero.mood = 'happy';
      hero.soot = 0;
      const d = dragon;
      if (d && d.state !== 'flee' && d.state !== 'dead') {
        const hit = pts == null ? to - hero.s : pts;
        await moveTo(Math.min(to, hero.s + 10), 0.38, hooks);
        hero.swingT = 0;
        await sleep(170);
        d.hp = Math.max(0, d.hp - hit);
        d.flash = 1;
        d.state = 'hit';
        d.t = 0;
        shake = 6 + hit * 0.16;
        const ix = d.x - 58 * d.scale;
        const iy = groundY(d.x) - 46 * d.scale;
        burst(ix, iy, 10 + hit / 4, ['#ffffff', '#ffd84d', '#ff9a1a'], 160 + hit * 2.4);
        say(ix - 30 * d.scale, iy - 150 * d.scale, `-${hit}`, hit >= SLAY ? '#ffd23f' : '#ffffff', 34 + hit * 0.16);
        await sleep(430);
        if (hit >= SLAY) {
          slain++;
          d.state = 'dead';
          d.t = 0;
          burst(d.x, groundY(d.x) - 70 * d.scale, 60, ['#ffd23f', '#ffe680', '#ffffff', d.def.body], 380);
          say(d.x, groundY(d.x) - 170 * d.scale, d.def.king ? 'DRAGON KING SLAIN!' : 'SLAIN!', '#ffd23f', 44);
          shake = 16;
        } else {
          d.state = 'flee';
          d.t = 0;
          say(d.x, groundY(d.x) - 170 * d.scale, hit <= 15 ? 'it yawned' : 'driven off', '#ffffff', 26);
        }
        await sleep(520);
      }
      await moveTo(to, 0.5 + Math.abs(to - hero.s) * 0.022, hooks);
    },
    jumpTo(s) {
      hero.s = clamp(s, 0, MAX);
      camX = hero.s * PX - heroScreenX();
    },
    // time ran out: the dragon breathes fire and leaves
    wobble() {
      hero.mood = 'sad';
      hero.squash = 1;
      if (dragon && dragon.state === 'idle') {
        dragon.state = 'fire';
        dragon.t = 0;
        say(hero.s * PX, groundY(hero.s * PX) - heroR() * 3.2, 'TOASTED', '#ff9a1a', 30);
      } else {
        hero.soot = 1;
      }
    },
    celebrate() {
      burst(hero.s * PX, groundY(hero.s * PX) - heroR(), 90, ['#ffd84d', '#ffffff', '#ff9a1a', '#ff8fb3', '#9df3ff'], 440);
    },
  };
})();
