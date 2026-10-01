const test = require('node:test');
const assert = require('node:assert');
const { key, findAnswer } = require('./match');

const keys = new Map([
  ['lemon', 1],
  ['yellowdragonfruit', 2],
  ['buddhashand', 3],
  ['monet', 4],
  ['manet', 5],
  ['ps4', 6],
  ['ps5', 7],
  ['blueberry', 8],
]);
const exact = (id) => ({ id, exact: true });
const suggest = (id) => ({ id, exact: false });

test('normalises case, accents, punctuation, articles and spacing', () => {
  assert.equal(key("  The Buddha's-Hand "), 'buddhashand');
  assert.equal(key('Crème Brûlée'), 'cremebrulee');
  assert.deepEqual(findAnswer(keys, 'Yellow Dragon Fruit'), exact(2));
});

test('accepts plurals and singulars outright', () => {
  assert.deepEqual(findAnswer(keys, 'lemons'), exact(1));
  assert.deepEqual(findAnswer(keys, 'blueberries'), exact(8));
});

test('exact matches win over near neighbours', () => {
  assert.deepEqual(findAnswer(keys, 'monet'), exact(4));
  assert.deepEqual(findAnswer(keys, 'manet'), exact(5));
  assert.deepEqual(findAnswer(keys, 'ps5'), exact(7));
});

test('misspellings come back as suggestions, not accepted answers', () => {
  assert.deepEqual(findAnswer(keys, 'yelow dragonfriut'), suggest(2));
  assert.deepEqual(findAnswer(keys, 'bluebery'), suggest(8));
  assert.deepEqual(findAnswer(keys, 'lemmon'), suggest(1));
});

test('short or unrelated words get nothing', () => {
  assert.equal(findAnswer(keys, 'ps6'), null);
  assert.equal(findAnswer(keys, 'potato'), null);
  assert.equal(findAnswer(keys, '   '), null);
});
