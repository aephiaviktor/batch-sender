'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const bs58 = require('bs58');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { Keypair } = require('@solana/web3.js');
const { decodeSecretText, removeHotWallet } = require('../lib/hot-wallet-store');

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

test('requires explicit confirmation before removing the protected signing secret', async () => {
  const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), 'batch-sender-hot-wallet-'));
  const storeFile = path.join(userDataPath, 'hot-wallet.dpapi.json');
  await fs.writeFile(storeFile, '{"ciphertext":"protected"}');
  await assert.rejects(removeHotWallet(userDataPath), /explicit confirmation/);
  assert.equal(await fs.readFile(storeFile, 'utf8'), '{"ciphertext":"protected"}');
  assert.deepEqual(await removeHotWallet(userDataPath, true), { configured: false, publicKey: '', protection: '' });
  await assert.rejects(fs.stat(storeFile), { code: 'ENOENT' });
  await fs.rm(userDataPath, { recursive: true, force: true });
});
