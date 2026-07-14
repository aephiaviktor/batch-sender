'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const bs58 = require('bs58');
const { Keypair } = require('@solana/web3.js');
const { decodeSecretText } = require('../lib/hot-wallet-store');

test('decodes JSON-array and base58 keypair imports in the main-process helper', () => {
  const source = Keypair.generate();
  const fromJson = decodeSecretText(JSON.stringify(Array.from(source.secretKey)));
  const fromBase58 = decodeSecretText((bs58.encode || bs58.default.encode)(source.secretKey));
  assert.equal(fromJson.publicKey.toBase58(), source.publicKey.toBase58());
  assert.equal(fromBase58.publicKey.toBase58(), source.publicKey.toBase58());
});

test('rejects invalid key material', () => {
  assert.throws(() => decodeSecretText('[1,2,3]'), /valid Solana keypair/);
});
