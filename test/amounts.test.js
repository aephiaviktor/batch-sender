'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { addThousandsSeparators, formatBaseUnits, parseTokenAmount } = require('../lib/amounts');

test('parses comma-formatted amounts exactly', () => {
  assert.equal(parseTokenAmount('1,234.567', 3), 1234567n);
});

test('rejects zero, malformed, negative, and over-precision amounts', () => {
  for (const value of ['', '0', '-1', '1e3', 'abc']) {
    assert.throws(() => parseTokenAmount(value, 2));
  }
  assert.throws(() => parseTokenAmount('1.001', 2), /more than 2 decimal places/);
});

test('formats base units without floating point arithmetic', () => {
  assert.equal(formatBaseUnits(1234567n, 3), '1234.567');
  assert.equal(formatBaseUnits(1200000n, 3), '1200');
});

test('adds display separators while preserving the decimal text', () => {
  assert.equal(addThousandsSeparators('0012345.6700'), '12,345.6700');
});
