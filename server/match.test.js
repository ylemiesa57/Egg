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

test('normalises case, accents, punctuation, articles and spacing', () => {
  assert.equal(key("  The Buddha's-Hand "), 'buddhashand');
  assert.equal(key('Crème Brûlée'), 'cremebrulee');
  assert.equal(findAnswer(keys, 'Yellow Dragon Fruit'), 2);
});

test('accepts plurals and singulars', () => {
  assert.equal(findAnswer(keys, 'lemons'), 1);
  assert.equal(findAnswer(keys, 'blueberries'), 8);
});

test('exact matches win over near neighbours', () => {
  assert.equal(findAnswer(keys, 'monet'), 4);
  assert.equal(findAnswer(keys, 'manet'), 5);
  assert.equal(findAnswer(keys, 'ps5'), 7);
});

test('tolerates typos in longer words only', () => {
  assert.equal(findAnswer(keys, 'yelow dragonfruit'), 2);
  assert.equal(findAnswer(keys, 'blueberrry'), 8);
  assert.equal(findAnswer(keys, 'ps6'), null);
  assert.equal(findAnswer(keys, 'potato'), null);
  assert.equal(findAnswer(keys, '   '), null);
});
