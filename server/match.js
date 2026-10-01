// Answer normalisation and fuzzy matching.

function norm(s) {
  return String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(a|an|the) /, '');
}

// Keys ignore spacing so "star fruit" and "starfruit" collide.
function key(s) {
  return norm(s).replace(/ /g, '');
}

function variants(k) {
  const out = [k, k + 's'];
  if (k.endsWith('ies')) out.push(k.slice(0, -3) + 'y');
  if (k.endsWith('es')) out.push(k.slice(0, -2));
  if (k.endsWith('s')) out.push(k.slice(0, -1));
  return out;
}

function levenshtein(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

// keys: Map<key, answerId>. An exact hit (allowing plurals) is accepted outright;
// a near miss comes back as a spelling suggestion for the player to confirm.
// Returns { id, exact } or null.
function findAnswer(keys, raw) {
  const k = key(raw);
  if (!k) return null;
  for (const v of variants(k)) {
    if (keys.has(v)) return { id: keys.get(v), exact: true };
  }
  // Typo tolerance scales with length; short words must be exact.
  const max = k.length >= 9 ? 3 : k.length >= 6 ? 2 : k.length >= 4 ? 1 : 0;
  if (!max) return null;
  let best = null;
  let bestDist = max + 1;
  for (const [cand, id] of keys) {
    const d = levenshtein(k, cand, max);
    if (d < bestDist) {
      best = id;
      bestDist = d;
    }
  }
  return best == null ? null : { id: best, exact: false };
}

module.exports = { norm, key, findAnswer };
