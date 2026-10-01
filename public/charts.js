// End-screen charts: the score curve, and a small tier distribution per answer.
// One accent colour marks "you"; everything else stays neutral.
(function () {
  const OE = window.OE;
  const NS = 'http://www.w3.org/2000/svg';
  const ACCENT = '#d9690d';
  const NEUTRAL = '#d8ccb4';
  const INK = '#3b2416';
  const MUTED = 'rgba(59, 36, 22, 0.62)';
  const TIER_NAMES = ['Shell', 'Half-Baked', 'Carton', 'Free Range', 'Double Yolk', 'Golden Egg'];

  function el(name, attrs, parent) {
    const node = document.createElementNS(NS, name);
    for (const k in attrs) node.setAttribute(k, attrs[k]);
    if (parent) parent.append(node);
    return node;
  }

  function normalCdf(z) {
    const t = 1 / (1 + 0.2316419 * Math.abs(z));
    const d = 0.3989423 * Math.exp((-z * z) / 2);
    const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return z > 0 ? 1 - p : p;
  }

  // curve: { mean, sd, n, percentile }, score: this run's total
  function scoreCurve(host, curve, score) {
    const W = 480;
    const H = 190;
    const left = 14;
    const right = W - 14;
    const top = 30;
    const base = 150;
    const x = (s) => left + (s / 700) * (right - left);
    const pdf = (s) => Math.exp(-((s - curve.mean) ** 2) / (2 * curve.sd ** 2));
    const y = (s) => base - pdf(s) * (base - top);

    host.replaceChildren();
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img' }, host);
    svg.setAttribute(
      'aria-label',
      `Bell curve of total scores, average ${curve.mean}. Your score of ${score} is higher than about ${curve.percentile}% of games.`
    );

    let line = '';
    for (let s = 0; s <= 700; s += 7) line += `${s ? 'L' : 'M'}${x(s).toFixed(1)},${y(s).toFixed(1)}`;
    // everything at or below your score is the share of games you beat
    let beaten = `M${x(0)},${base}`;
    for (let s = 0; s <= score; s += 7) beaten += `L${x(s).toFixed(1)},${y(s).toFixed(1)}`;
    beaten += `L${x(score).toFixed(1)},${y(score).toFixed(1)}L${x(score).toFixed(1)},${base}Z`;

    el('path', { d: `${line}L${right},${base}L${left},${base}Z`, fill: NEUTRAL, opacity: 0.45 }, svg);
    el('path', { d: beaten, fill: ACCENT, opacity: 0.22 }, svg);
    el('path', { d: line, fill: 'none', stroke: INK, 'stroke-width': 2, 'stroke-linejoin': 'round' }, svg);
    el('line', { x1: left, x2: right, y1: base, y2: base, stroke: 'rgba(59,36,22,0.3)', 'stroke-width': 1 }, svg);

    for (let s = 0; s <= 700; s += 100) {
      el('line', { x1: x(s), x2: x(s), y1: base, y2: base + 4, stroke: 'rgba(59,36,22,0.3)', 'stroke-width': 1 }, svg);
      const t = el('text', { x: x(s), y: base + 17, 'text-anchor': 'middle', 'font-size': 11, fill: MUTED }, svg);
      t.textContent = s;
    }

    // the average, marked quietly
    el('line', { x1: x(curve.mean), x2: x(curve.mean), y1: y(curve.mean), y2: base, stroke: 'rgba(59,36,22,0.35)', 'stroke-width': 1 }, svg);
    const avg = el('text', { x: x(curve.mean), y: base + 31, 'text-anchor': 'middle', 'font-size': 11, fill: MUTED }, svg);
    avg.textContent = `average ${curve.mean}`;

    // you
    const sx = x(score);
    el('line', { x1: sx, x2: sx, y1: top - 8, y2: base, stroke: ACCENT, 'stroke-width': 2 }, svg);
    el('circle', { cx: sx, cy: y(score), r: 5, fill: ACCENT, stroke: '#fff8e7', 'stroke-width': 2 }, svg);
    const anchor = sx > W * 0.72 ? 'end' : sx < W * 0.28 ? 'start' : 'middle';
    const you = el('text', { x: sx + (anchor === 'end' ? -6 : anchor === 'start' ? 6 : 0), y: top - 14, 'text-anchor': anchor, 'font-size': 13, 'font-weight': 700, fill: INK }, svg);
    you.textContent = `You · ${score}`;

    // hover: read any score off the curve
    const cross = el('line', { y1: top, y2: base, stroke: INK, 'stroke-width': 1, opacity: 0 }, svg);
    const dot = el('circle', { r: 4, fill: INK, opacity: 0 }, svg);
    const tip = document.createElement('div');
    tip.className = 'chart-tip';
    tip.hidden = true;
    host.append(tip);
    const hit = el('rect', { x: left, y: top - 10, width: right - left, height: base - top + 10, fill: 'transparent' }, svg);
    const move = (e) => {
      const box = svg.getBoundingClientRect();
      const px = ((e.clientX - box.left) / box.width) * W;
      const s = Math.max(0, Math.min(700, Math.round((((px - left) / (right - left)) * 700) / 5) * 5));
      cross.setAttribute('x1', x(s));
      cross.setAttribute('x2', x(s));
      cross.setAttribute('opacity', 0.4);
      dot.setAttribute('cx', x(s));
      dot.setAttribute('cy', y(s));
      dot.setAttribute('opacity', 1);
      tip.hidden = false;
      tip.textContent = `${s} points beats about ${Math.round(normalCdf((s - curve.mean) / curve.sd) * 100)}% of games`;
      const tx = (x(s) / W) * box.width;
      tip.style.left = `${Math.max(90, Math.min(box.width - 90, tx))}px`;
    };
    const leave = () => {
      cross.setAttribute('opacity', 0);
      dot.setAttribute('opacity', 0);
      tip.hidden = true;
    };
    hit.addEventListener('pointermove', move);
    hit.addEventListener('pointerdown', move);
    hit.addEventListener('pointerleave', leave);
  }

  // shares: six fractions, commonest tier first. mine: index of this answer's tier (or -1).
  function tierBars(shares, mine) {
    const W = 78;
    const H = 26;
    const bw = 10;
    const gap = 3;
    const max = Math.max(...shares, 0.01);
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'tier-bars', role: 'img' });
    svg.setAttribute(
      'aria-label',
      'Share of answers in each tier: ' + shares.map((s, i) => `${TIER_NAMES[i]} ${Math.round(s * 100)}%`).join(', ')
    );
    shares.forEach((s, i) => {
      const h = Math.max(2, (s / max) * (H - 2));
      const bar = el('rect', { x: i * (bw + gap), y: H - h, width: bw, height: h, rx: 2, fill: i === mine ? ACCENT : NEUTRAL }, svg);
      const title = el('title', {}, bar);
      title.textContent = `${TIER_NAMES[i]}: ${Math.round(s * 100)}% of answers${i === mine ? ' (yours)' : ''}`;
    });
    return svg;
  }

  OE.charts = { scoreCurve, tierBars };
})();
