'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const bs58 = require('bs58');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { Keypair } = require('@solana/web3.js');
const { decodeSecretText, removeHotWallet } = require('../lib/hot-wallet-store');

test('decodes JSON-array and base58 secret-key imports in the main-process helper', () => {
  const source = Keypair.generate();
  assert.equal(decodeSecretText(JSON.stringify(Array.from(source.secretKey))).publicKey.toBase58(), source.publicKey.toBase58());
  assert.equal(decodeSecretText((bs58.encode || bs58.default.encode)(source.secretKey)).publicKey.toBase58(), source.publicKey.toBase58());
});

test('rejects invalid secret-key material', () => {
  assert.throws(() => decodeSecretText('[1,2,3]'), /valid Solana secret key/);
});

test('requires explicit confirmation before removing a protected secret key', async (t) => {
  const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), 'batch-sender-hot-wallet-'));
  t.after(() => fs.rm(userDataPath, { recursive: true, force: true }));
  const storeFile = path.join(userDataPath, 'hot-wallets.dpapi.json');
  await fs.writeFile(storeFile, JSON.stringify({ version: 2, wallets: { abc: { ciphertext: 'protected', publicKey: 'key' } } }));
  await assert.rejects(removeHotWallet(userDataPath, 'abc'), /explicit confirmation/);
  assert.deepEqual(await removeHotWallet(userDataPath, 'abc', true), { configured: false, publicKey: '', protection: '' });
  const stored = JSON.parse(await fs.readFile(storeFile, 'utf8'));
  assert.deepEqual(stored.wallets, {});
});
