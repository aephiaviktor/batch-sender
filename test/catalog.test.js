'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { TOKEN_BY_MINT, TOKEN_CATALOG } = require('../lib/catalog');

test('catalog contains every GM Market Bot asset group', () => {
  const counts = TOKEN_CATALOG.reduce((result, token) => {
    result[token.group] = (result[token.group] || 0) + 1;
    return result;
  }, {});

  assert.deepEqual(counts, {
    raw: 12,
    components: 25,
    ships: 60,
    'crew-packs': 7,
    'ship-parts': 58,
  });
  assert.equal(TOKEN_CATALOG.length, 162);
});

test('catalog mints are unique and indexed', () => {
  assert.equal(TOKEN_BY_MINT.size, TOKEN_CATALOG.length);
  for (const token of TOKEN_CATALOG) {
    assert.equal(TOKEN_BY_MINT.get(token.mint), token);
  }
});
