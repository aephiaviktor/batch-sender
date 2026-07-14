'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { Keypair } = require('@solana/web3.js');
const { loadPublicConfig, savePublicConfig } = require('../lib/local-store');

test('saves and reloads public wallet settings without secret material', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'batch-sender-settings-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const addresses = Array.from({ length: 4 }, () => Keypair.generate().publicKey.toBase58());

  await savePublicConfig(directory, {
    rpcUrl: 'https://rpc.example.test',
    profiles: {
      'mud-ledger': { address: addresses[0], derivationPath: "44'/501'/1'" },
      'oni-ledger': { address: addresses[1], derivationPath: "44'/501'/2'" },
      'ustur-ledger': { address: addresses[2], derivationPath: "44'/501'/3'" },
      'gm-hot-wallet': { address: addresses[3] },
    },
  });

  const stored = await loadPublicConfig(directory);
  assert.equal(stored.rpcUrl, 'https://rpc.example.test');
  assert.equal(stored.profiles['mud-ledger'].address, addresses[0]);
  assert.equal(stored.profiles['mud-ledger'].derivationPath, "44'/501'/1'");
  assert.deepEqual(Object.keys(stored.profiles['gm-hot-wallet']), ['address']);
});

test('rejects invalid RPC URLs and wallet addresses', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'batch-sender-settings-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  await assert.rejects(() => savePublicConfig(directory, { rpcUrl: 'file:///secret', profiles: {} }), /http:\/\//);
  await assert.rejects(() => savePublicConfig(directory, {
    rpcUrl: 'https://rpc.example.test',
    profiles: { 'mud-ledger': { address: 'not-a-wallet' } },
  }), /not a valid Solana public key/);
});
