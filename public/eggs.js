// The egg and its eight forms. Every form is drawn around (0, 0) with radius R.
(function () {
  const OE = (window.OE = window.OE || {});

  // daily and unlimited share the downhill world; quest is the side-scrolling one
  const requested = new URLSearchParams(location.search).get('mode');
  OE.mode = requested === 'unlimited' || requested === 'quest' ? requested : 'daily';

  OE.FORMS = [
    { name: 'Raw Egg', emoji: '🥚', blurb: 'Fresh from the nest. Barely rolled.' },
    { name: 'Hard-Boiled', emoji: '🥚', blurb: 'Firm, dependable, a little dry.' },
    { name: 'Soft-Boiled', emoji: '🍯', blurb: 'Jammy in the middle. Getting good.' },
    { name: 'Poached', emoji: '🫧', blurb: 'Delicate. Wobbly. Brunch-worthy.' },
    { name: 'Scrambled', emoji: '🧈', blurb: 'Tumbled into something fluffy.' },
    { name: 'Omelette', emoji: '🌯', blurb: 'Folded, golden, nearly there.' },
    { name: 'Fried Egg', emoji: '🍳', blurb: 'You made it to the skillet.' },
    { name: 'Golden Fried Egg', emoji: '🌟', blurb: 'Sunny-side up. A perfect roll.' },
  ];

  OE.formIndex = (score) => Math.min(7, Math.floor(score / 100));

  const INK = '#3b2416';

  function eggPath(ctx, R) {
    ctx.beginPath();
    for (let i = 0; i <= 40; i++) {
      const th = (i / 40) * Math.PI * 2;
      const x = 0.9 * R * Math.sin(th) * (1 - 0.18 * Math.cos(th));
      const y = -1.12 * R * Math.cos(th);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  OE.eggPath = eggPath;

  function blobPath(ctx, R, lobes, depth, phase) {
    ctx.beginPath();
    for (let i = 0; i <= 48; i++) {
      const th = (i / 48) * Math.PI * 2;
      const r = R * (1 + depth * Math.sin(th * lobes + phase) + depth * 0.5 * Math.sin(th * (lobes + 2) - phase * 1.7));
      const x = r * Math.cos(th);
      const y = r * Math.sin(th);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  function outline(ctx, R) {
    ctx.lineWidth = Math.max(1.5, R * 0.1);
    ctx.strokeStyle = INK;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }

  function face(ctx, R, t, y, mood) {
    const blink = t % 4.2 < 0.12 ? 0.15 : 1;
    ctx.fillStyle = INK;
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(sx * R * 0.3, y, R * 0.09, R * 0.12 * blink, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255, 120, 110, 0.45)';
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(sx * R * 0.48, y + R * 0.2, R * 0.12, R * 0.08, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.lineWidth = Math.max(1.2, R * 0.07);
    ctx.lineCap = 'round';
    ctx.strokeStyle = INK;
    if (mood === 'sad') ctx.arc(0, y + R * 0.34, R * 0.14, Math.PI * 1.15, Math.PI * 1.85);
    else ctx.arc(0, y + R * 0.12, R * 0.16, Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();
  }

  function shine(ctx, R, x, y) {
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath();
    ctx.ellipse(x, y, R * 0.14, R * 0.22, -0.5, 0, Math.PI * 2);
    ctx.fill();
  }

  const draw = [
    // 0 — raw: speckled shell
    (ctx, R, t, mood) => {
      eggPath(ctx, R);
      const g = ctx.createLinearGradient(0, -R, 0, R * 1.1);
      g.addColorStop(0, '#fff9ec');
      g.addColorStop(1, '#ecd9b6');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.fillStyle = 'rgba(150, 105, 60, 0.45)';
      const spots = [[-0.5, -0.5], [0.45, -0.7], [0.55, 0.45], [-0.55, 0.6], [0.1, 0.8], [-0.15, -0.85], [0.68, -0.1]];
      for (const [x, y] of spots) {
        ctx.beginPath();
        ctx.arc(x * R, y * R, R * 0.07, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      eggPath(ctx, R);
      outline(ctx, R);
      shine(ctx, R, -R * 0.42, -R * 0.55);
      face(ctx, R, t, R * 0.05, mood);
    },
    // 1 — hard-boiled: halved, firm pale yolk
    (ctx, R, t, mood) => {
      eggPath(ctx, R);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      outline(ctx, R);
      ctx.beginPath();
      ctx.arc(0, R * 0.22, R * 0.56, 0, Math.PI * 2);
      ctx.fillStyle = '#f3d86a';
      ctx.fill();
      ctx.lineWidth = Math.max(1, R * 0.05);
      ctx.strokeStyle = '#d9b84a';
      ctx.stroke();
      face(ctx, R, t, R * 0.16, mood);
    },
    // 2 — soft-boiled: shell cup, jammy yolk dripping over the edge
    (ctx, R, t, mood) => {
      eggPath(ctx, R);
      ctx.fillStyle = '#fffdf6';
      ctx.fill();
      ctx.save();
      eggPath(ctx, R);
      ctx.clip();
      // shell on the lower half with a cracked edge
      ctx.beginPath();
      ctx.moveTo(-R * 1.2, R * 0.15);
      const teeth = 7;
      for (let i = 0; i <= teeth; i++) {
        const x = -R * 1.2 + (i / teeth) * R * 2.4;
        ctx.lineTo(x, R * 0.15 + (i % 2 ? -R * 0.16 : R * 0.04));
      }
      ctx.lineTo(R * 1.2, R * 1.4);
      ctx.lineTo(-R * 1.2, R * 1.4);
      ctx.closePath();
      ctx.fillStyle = '#e9c9a0';
      ctx.fill();
      ctx.lineWidth = Math.max(1, R * 0.06);
      ctx.strokeStyle = INK;
      ctx.stroke();
      ctx.restore();
      // yolk
      ctx.beginPath();
      ctx.arc(0, -R * 0.42, R * 0.46, 0, Math.PI * 2);
      const g = ctx.createRadialGradient(-R * 0.1, -R * 0.55, R * 0.05, 0, -R * 0.42, R * 0.5);
      g.addColorStop(0, '#ffc23d');
      g.addColorStop(1, '#f58a07');
      ctx.fillStyle = g;
      ctx.fill();
      // drip
      const drip = R * (0.5 + 0.08 * Math.sin(t * 2));
      ctx.beginPath();
      ctx.moveTo(R * 0.18, -R * 0.1);
      ctx.quadraticCurveTo(R * 0.2, drip * 0.6, R * 0.3, drip);
      ctx.quadraticCurveTo(R * 0.44, drip * 0.6, R * 0.4, -R * 0.1);
      ctx.closePath();
      ctx.fillStyle = '#f58a07';
      ctx.fill();
      eggPath(ctx, R);
      outline(ctx, R);
      shine(ctx, R, -R * 0.16, -R * 0.6);
      face(ctx, R, t, R * 0.5, mood);
    },
    // 3 — poached: wobbly white with a yolk glowing through
    (ctx, R, t, mood) => {
      blobPath(ctx, R * 1.02, 3, 0.06, t * 2.4);
      ctx.fillStyle = '#fffef9';
      ctx.fill();
      outline(ctx, R);
      const g = ctx.createRadialGradient(0, R * 0.1, 0, 0, R * 0.1, R * 0.62);
      g.addColorStop(0, 'rgba(255, 190, 60, 0.95)');
      g.addColorStop(0.7, 'rgba(255, 205, 100, 0.5)');
      g.addColorStop(1, 'rgba(255, 220, 140, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, R * 0.1, R * 0.62, 0, Math.PI * 2);
      ctx.fill();
      shine(ctx, R, -R * 0.45, -R * 0.45);
      face(ctx, R, t, 0, mood);
    },
    // 4 — scrambled: a fluffy heap of curds
    (ctx, R, t, mood) => {
      const curds = [[0, 0.15, 0.78], [-0.5, 0.35, 0.5], [0.52, 0.3, 0.52], [-0.38, -0.42, 0.5], [0.4, -0.45, 0.48], [0, -0.62, 0.42], [0, 0.62, 0.45]];
      ctx.fillStyle = INK;
      for (const [x, y, r] of curds) {
        ctx.beginPath();
        ctx.arc(x * R, y * R, r * R + Math.max(1.5, R * 0.09), 0, Math.PI * 2);
        ctx.fill();
      }
      curds.forEach(([x, y, r], i) => {
        ctx.beginPath();
        ctx.arc(x * R, y * R, r * R, 0, Math.PI * 2);
        ctx.fillStyle = i % 2 ? '#ffd84d' : '#ffe680';
        ctx.fill();
      });
      ctx.strokeStyle = '#3f9b4b';
      ctx.lineWidth = Math.max(1.2, R * 0.07);
      ctx.lineCap = 'round';
      for (const [x, y, a] of [[-0.55, -0.3, 0.6], [0.5, 0.5, -0.5], [0.25, -0.72, 1.2], [-0.3, 0.7, 0.2]]) {
        ctx.beginPath();
        ctx.moveTo(x * R, y * R);
        ctx.lineTo(x * R + Math.cos(a) * R * 0.2, y * R + Math.sin(a) * R * 0.2);
        ctx.stroke();
      }
      face(ctx, R, t, R * 0.02, mood);
    },
    // 5 — omelette: rolled, with a browned spiral
    (ctx, R, t, mood) => {
      ctx.beginPath();
      ctx.arc(0, 0, R, 0, Math.PI * 2);
      const g = ctx.createRadialGradient(-R * 0.3, -R * 0.3, R * 0.1, 0, 0, R);
      g.addColorStop(0, '#ffe98a');
      g.addColorStop(1, '#f7b92e');
      ctx.fillStyle = g;
      ctx.fill();
      outline(ctx, R);
      ctx.beginPath();
      for (let i = 0; i <= 90; i++) {
        const th = (i / 90) * Math.PI * 5;
        const r = R * 0.92 * (1 - i / 105);
        const x = r * Math.cos(th);
        const y = r * Math.sin(th);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = 'rgba(176, 106, 20, 0.55)';
      ctx.lineWidth = Math.max(1.2, R * 0.07);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, R * 0.05, R * 0.5, 0, Math.PI * 2);
      ctx.fillStyle = '#ffe17a';
      ctx.fill();
      face(ctx, R, t, 0, mood);
    },
    // 6 — fried: crispy-edged white, big sunny yolk
    (ctx, R, t, mood) => fried(ctx, R, t, mood, false),
    // 7 — golden fried: the perfect roll
    (ctx, R, t, mood) => fried(ctx, R, t, mood, true),
  ];

  function fried(ctx, R, t, mood, golden) {
    if (golden) {
      const glow = ctx.createRadialGradient(0, 0, R * 0.6, 0, 0, R * 2.1);
      glow.addColorStop(0, 'rgba(255, 215, 80, 0.55)');
      glow.addColorStop(1, 'rgba(255, 215, 80, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, 0, R * 2.1, 0, Math.PI * 2);
      ctx.fill();
    }
    blobPath(ctx, R * 1.18, 5, 0.09, 1.3);
    ctx.fillStyle = golden ? '#fff6d6' : '#ffffff';
    ctx.fill();
    ctx.lineWidth = Math.max(2, R * 0.14);
    ctx.strokeStyle = golden ? '#e0a100' : '#b9772f';
    ctx.lineJoin = 'round';
    ctx.stroke();
    blobPath(ctx, R * 1.18 + Math.max(1, R * 0.07), 5, 0.09, 1.3);
    ctx.lineWidth = Math.max(1.2, R * 0.06);
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.6, 0, Math.PI * 2);
    const g = ctx.createRadialGradient(-R * 0.18, -R * 0.2, R * 0.05, 0, 0, R * 0.62);
    g.addColorStop(0, golden ? '#fff3a0' : '#ffd24a');
    g.addColorStop(1, golden ? '#ffb300' : '#ff9a1a');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = Math.max(1, R * 0.05);
    ctx.strokeStyle = golden ? '#c98a00' : '#d97a0a';
    ctx.stroke();
    shine(ctx, R * 0.8, -R * 0.26, -R * 0.3);
    face(ctx, R, t, R * 0.02, mood);
    if (golden) {
      ctx.fillStyle = '#fff8c9';
      for (let i = 0; i < 5; i++) {
        const a = t * 0.9 + (i * Math.PI * 2) / 5;
        const d = R * (1.5 + 0.15 * Math.sin(t * 3 + i));
        sparkle(ctx, Math.cos(a) * d, Math.sin(a) * d, R * (0.14 + 0.05 * Math.sin(t * 5 + i * 2)));
      }
    }
  }

  function sparkle(ctx, x, y, r) {
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const d = i % 2 ? r * 0.35 : r;
      ctx.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
    }
    ctx.closePath();
    ctx.fill();
  }
  OE.sparkle = sparkle;

  // form: 0–7, R: radius in px, t: seconds (for idle animation)
  OE.drawEgg = function (ctx, form, R, t, mood) {
    draw[form](ctx, R, t || 0, mood || 'happy');
  };
})();
