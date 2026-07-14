'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_LEDGER_PATH, getCommonLedgerPaths, normalizeLedgerPath } = require('../lib/ledger-signer');

test('normalizes Ledger path notation without changing path semantics', () => {
  assert.equal(normalizeLedgerPath("m/44’/501’/0’"), "44'/501'/0'");
  assert.equal(normalizeLedgerPath(''), DEFAULT_LEDGER_PATH);
});

test('Ledger fallback paths cover indices 0 through 30 and final-segment variants', () => {
  const paths = getCommonLedgerPaths();
  assert.ok(paths.includes("44'/501'/30'"));
  assert.ok(paths.includes("44'/501'/30'/0'"));
  assert.ok(paths.includes("44'/501'/30'/0"));
  assert.ok(paths.includes("44'/501'/30'/0/0"));
  assert.ok(paths.includes("501'/30'/0/0"));
  assert.equal(paths.length, new Set(paths).size);
});
