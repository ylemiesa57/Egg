// How a run compares with everyone else's: a normal curve over total scores,
// and a per-answer comparison against all answers given to the same prompt.

const TIER_POINTS = [10, 15, 30, 60, 85, 100];

// Until enough real games exist, the numbers lean on these starting assumptions.
// Each behaves like that many imaginary earlier games and is outweighed as real ones arrive.
const SCORE_PRIOR = { mean: 240, sd: 90, weight: 25 };
const TIER_PRIOR = { shares: [0.4, 0.14, 0.26, 0.13, 0.05, 0.02], weight: 20 };

// Abramowitz–Stegun approximation of the standard normal CDF
function normalCdf(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

// agg: { n, sum, sumsq } over real runs. Returns the fitted curve and where `score` falls on it.
function scoreCurve(agg, score) {
  const n = agg.n || 0;
  const w = SCORE_PRIOR.weight;
  const total = n + w;
  const mean = (w * SCORE_PRIOR.mean + (agg.sum || 0)) / total;
  const priorSq = w * (SCORE_PRIOR.sd ** 2 + SCORE_PRIOR.mean ** 2);
  const variance = Math.max(30 ** 2, (priorSq + (agg.sumsq || 0)) / total - mean ** 2);
  const sd = Math.sqrt(variance);
  const z = (score - mean) / sd;
  return {
    n,
    mean: Math.round(mean),
    sd: Math.round(sd),
    z: Math.round(z * 100) / 100,
    percentile: Math.round(normalCdf(z) * 100),
  };
}

// rows: every recorded pick for one prompt ({ answer, pts, count }).
// Returns how the given answer ranks among them.
function answerStanding(rows, answer, pts) {
  const real = rows.reduce((sum, r) => sum + r.count, 0);
  const tiers = TIER_PRIOR.shares.map((s) => s * TIER_PRIOR.weight);
  for (const r of rows) {
    const i = TIER_POINTS.indexOf(r.pts);
    if (i >= 0) tiers[i] += r.count;
  }
  const total = real + TIER_PRIOR.weight;
  const shares = tiers.map((t) => t / total);
  const mine = TIER_POINTS.indexOf(pts);
  let percentile = 0;
  if (mine >= 0) {
    const below = shares.slice(0, mine).reduce((a, b) => a + b, 0);
    percentile = Math.round((below + shares[mine] / 2) * 100);
  }
  const same = rows.find((r) => r.answer === answer);
  return {
    n: real,
    percentile,
    tiers: shares.map((s) => Math.round(s * 1000) / 1000),
    // the exact-answer share only means something once a few people have played
    share: real >= 10 && same ? Math.round((same.count / real) * 100) : null,
  };
}

module.exports = { TIER_POINTS, normalCdf, scoreCurve, answerStanding };
