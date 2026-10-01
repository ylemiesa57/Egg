const test = require('node:test');
const assert = require('node:assert');
const { normalCdf, scoreCurve, answerStanding } = require('./stats');

test('normal CDF hits the familiar landmarks', () => {
  assert.ok(Math.abs(normalCdf(0) - 0.5) < 1e-6);
  assert.ok(Math.abs(normalCdf(1) - 0.8413) < 1e-3);
  assert.ok(Math.abs(normalCdf(-1.96) - 0.025) < 1e-3);
});

test('with no games the curve is the starting guess', () => {
  const c = scoreCurve({ n: 0, sum: null, sumsq: null }, 240);
  assert.equal(c.mean, 240);
  assert.equal(c.sd, 90);
  assert.equal(c.percentile, 50);
});

test('real games pull the curve toward the data', () => {
  // 1,000 games that all scored 400–420
  const n = 1000;
  const scores = Array.from({ length: n }, (_, i) => 400 + (i % 3) * 10);
  const agg = { n, sum: scores.reduce((a, b) => a + b, 0), sumsq: scores.reduce((a, b) => a + b * b, 0) };
  const c = scoreCurve(agg, 500);
  assert.ok(c.mean > 395 && c.mean < 415);
  assert.ok(c.percentile >= 95);
});

test('rarer answers rank above more of the field', () => {
  const rows = [
    { answer: 'lemon', pts: 10, count: 60 },
    { answer: 'mango', pts: 15, count: 20 },
    { answer: 'quince', pts: 60, count: 15 },
    { answer: 'yellow dragon fruit', pts: 100, count: 5 },
  ];
  const common = answerStanding(rows, 'lemon', 10);
  const rare = answerStanding(rows, 'yellow dragon fruit', 100);
  assert.ok(common.percentile < 40);
  assert.ok(rare.percentile > 95);
  assert.equal(common.share, 60);
  assert.equal(rare.share, 5);
  assert.ok(Math.abs(common.tiers.reduce((a, b) => a + b, 0) - 1) < 0.01);
});

test('the exact-answer share is withheld until enough people have played', () => {
  assert.equal(answerStanding([{ answer: 'lemon', pts: 10, count: 3 }], 'lemon', 10).share, null);
});
