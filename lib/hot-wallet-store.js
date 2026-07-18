'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const bs58 = require('bs58');
const { Keypair } = require('@solana/web3.js');

const STORE_FILENAME = 'hot-wallets.dpapi.json';
const LEGACY_FILENAME = 'hot-wallet.dpapi.json';

function decodeSecretText(rawSecret) {
  const text = String(rawSecret || '').trim();
  if (!text) throw new Error('Enter the hot-wallet secret key.');
  let bytes;
  if (text.startsWith('[')) {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) throw new Error('Secret-key JSON must contain a byte array.');
    bytes = Uint8Array.from(parsed);
  } else {
    const hex = text.startsWith('0x') ? text.slice(2) : text;
    bytes = /^[0-9a-fA-F]+$/.test(hex) && hex.length % 2 === 0
      ? Uint8Array.from(Buffer.from(hex, 'hex'))
      : (bs58.decode || bs58.default.decode)(text);
  }
  try { return Keypair.fromSecretKey(bytes); }
  catch (error) { throw new Error(`The entered value is not a valid Solana secret key: ${error?.message || String(error)}`); }
}

async function readStore(userDataPath) {
  try {
    const stored = JSON.parse(await fs.readFile(path.join(userDataPath, STORE_FILENAME), 'utf8'));
    return stored?.wallets && typeof stored.wallets === 'object' ? stored : { version: 2, wallets: {} };
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  try {
    const legacy = JSON.parse(await fs.readFile(path.join(userDataPath, LEGACY_FILENAME), 'utf8'));
    return { version: 2, wallets: legacy?.ciphertext ? { 'gm-hot-wallet': legacy } : {} };
  } catch (error) {
    if (error?.code === 'ENOENT') return { version: 2, wallets: {} };
    throw error;
  }
}

async function writeStore(userDataPath, store) {
  await fs.mkdir(userDataPath, { recursive: true });
  await fs.writeFile(path.join(userDataPath, STORE_FILENAME), JSON.stringify(store, null, 2), { encoding: 'utf8', mode: 0o600 });
}

async function getHotWalletStatuses(userDataPath) {
  const store = await readStore(userDataPath);
  return Object.fromEntries(Object.entries(store.wallets).map(([id, row]) => [id, {
    configured: Boolean(row?.ciphertext && row?.publicKey),
    publicKey: String(row?.publicKey || ''),
    protection: String(row?.protection || ''),
  }]));
}

async function importHotWallet(userDataPath, safeStorage, walletId, rawSecret) {
  if (process.platform !== 'win32') throw new Error('Hot-wallet secret-key storage is only enabled in the native Windows app so DPAPI protection is guaranteed.');
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows protected storage is not available. The secret key was not saved.');
  const id = String(walletId || '').trim();
  if (!id) throw new Error('Wallet ID is required.');
  const keypair = decodeSecretText(rawSecret);
  const encrypted = safeStorage.encryptString(Buffer.from(keypair.secretKey).toString('base64'));
  const store = await readStore(userDataPath);
  store.wallets[id] = {
    publicKey: keypair.publicKey.toBase58(),
    protection: 'Windows DPAPI',
    ciphertext: encrypted.toString('base64'),
  };
  await writeStore(userDataPath, store);
  return { configured: true, publicKey: store.wallets[id].publicKey, protection: 'Windows DPAPI' };
}

async function removeHotWallet(userDataPath, walletId, removeConfirmed = false) {
  if (!removeConfirmed) throw new Error('Removing the protected secret key requires explicit confirmation.');
  const store = await readStore(userDataPath);
  delete store.wallets[String(walletId || '')];
  await writeStore(userDataPath, store);
  return { configured: false, publicKey: '', protection: '' };
}

async function loadHotWallet(userDataPath, safeStorage, walletId, expectedPublicKey) {
  if (process.platform !== 'win32') throw new Error('Hot-wallet signing is only enabled in the native Windows app.');
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows protected storage is unavailable.');
  const store = await readStore(userDataPath);
  const stored = store.wallets[String(walletId || '')];
  if (!stored?.ciphertext) throw new Error('The selected wallet has no protected secret key.');
  const decrypted = safeStorage.decryptString(Buffer.from(stored.ciphertext, 'base64'));
  const keypair = Keypair.fromSecretKey(Buffer.from(decrypted, 'base64'));
  if (expectedPublicKey && keypair.publicKey.toBase58() !== expectedPublicKey) throw new Error('The protected secret key does not match the selected wallet.');
  return keypair;
}

module.exports = { decodeSecretText, getHotWalletStatuses, importHotWallet, loadHotWallet, removeHotWallet };
