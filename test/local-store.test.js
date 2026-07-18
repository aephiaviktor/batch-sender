'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { Keypair } = require('@solana/web3.js');
const { addWallet, loadPublicConfig, saveLedgerDerivationPath, savePublicConfig } = require('../lib/local-store');

test('saves and reloads a dynamic public wallet list without secret material', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'batch-sender-settings-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const addresses = Array.from({ length: 2 }, () => Keypair.generate().publicKey.toBase58());
  await savePublicConfig(directory, { rpcUrl: 'https://rpc.example.test', wallets: [
    { id: 'ledger-1', name: 'Main Ledger', kind: 'ledger', address: addresses[0], derivationPath: "44'/501'/1'" },
    { id: 'hot-1', name: 'Ops wallet', kind: 'hot-wallet', address: addresses[1] },
  ] });
  const stored = await loadPublicConfig(directory);
  assert.equal(stored.rpcUrl, 'https://rpc.example.test');
  assert.equal(stored.wallets[0].address, addresses[0]);
  assert.equal(stored.wallets[0].derivationPath, "44'/501'/1'");
  assert.equal(stored.wallets[1].kind, 'hot-wallet');
  assert.equal('secretKey' in stored.wallets[1], false);
});

test('migrates configured legacy profile slots into dynamic wallets', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'batch-sender-settings-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const address = Keypair.generate().publicKey.toBase58();
  await fs.writeFile(path.join(directory, 'config.json'), JSON.stringify({ rpcUrl: 'https://rpc.test', profiles: { 'mud-ledger': { address, derivationPath: "44'/501'/4'" } } }));
  const stored = await loadPublicConfig(directory);
  assert.deepEqual(stored.wallets[0], { id: 'mud-ledger', name: 'MUD Ledger', kind: 'ledger', address, derivationPath: "44'/501'/4'" });
});

test('adds wallets and caches a discovered Ledger path', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'batch-sender-settings-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const address = Keypair.generate().publicKey.toBase58();
  await savePublicConfig(directory, { rpcUrl: 'https://rpc.example.test' });
  const wallet = await addWallet(directory, { name: 'Ledger', kind: 'ledger', address });
  await saveLedgerDerivationPath(directory, wallet.id, "44'/501'/7'/0'");
  const stored = await loadPublicConfig(directory);
  assert.equal(stored.wallets[0].derivationPath, "44'/501'/7'/0'");
});

test('rejects invalid RPC URLs and wallet addresses', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'batch-sender-settings-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  await assert.rejects(() => savePublicConfig(directory, { rpcUrl: 'file:///secret' }), /http:\/\//);
  await assert.rejects(() => savePublicConfig(directory, { rpcUrl: 'https://rpc.test', wallets: [{ id: 'x', name: 'Bad', kind: 'ledger', address: 'nope' }] }), /valid Solana wallet/);
});
