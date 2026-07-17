'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const bs58 = require('bs58');
const { Keypair } = require('@solana/web3.js');

const STORE_FILENAME = 'hot-wallet.dpapi.json';

function decodeSecretText(rawSecret) {
  const text = String(rawSecret || '').trim();
  if (!text) throw new Error('Enter the GM hot-wallet signing secret.');

  let bytes;
  if (text.startsWith('[')) {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) throw new Error('Hot-wallet JSON must contain a byte array.');
    bytes = Uint8Array.from(parsed);
  } else {
    const hex = text.startsWith('0x') ? text.slice(2) : text;
    if (/^[0-9a-fA-F]+$/.test(hex) && hex.length % 2 === 0) {
      bytes = Uint8Array.from(Buffer.from(hex, 'hex'));
    } else {
      bytes = (bs58.decode || bs58.default.decode)(text);
    }
  }

  try {
    return Keypair.fromSecretKey(bytes);
  } catch (error) {
    throw new Error(`The entered value is not a valid Solana keypair: ${error?.message || String(error)}`);
  }
}

function storePath(userDataPath) {
  return path.join(userDataPath, STORE_FILENAME);
}

async function getHotWalletStatus(userDataPath) {
  try {
    const stored = JSON.parse(await fs.readFile(storePath(userDataPath), 'utf8'));
    return {
      configured: Boolean(stored?.ciphertext && stored?.publicKey),
      publicKey: String(stored?.publicKey || ''),
      protection: String(stored?.protection || ''),
    };
  } catch (error) {
    if (error?.code === 'ENOENT') return { configured: false, publicKey: '', protection: '' };
    throw error;
  }
}

async function importHotWallet(userDataPath, safeStorage, rawSecret, expectedPublicKey = '', replaceConfirmed = false) {
  if (process.platform !== 'win32') {
    throw new Error('GM hot-wallet secret storage is only enabled in the native Windows app so DPAPI protection is guaranteed.');
  }
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Windows protected storage is not available. The hot-wallet secret was not saved.');
  }
  const current = await getHotWalletStatus(userDataPath);
  if (current.configured && !replaceConfirmed) {
    throw new Error('Replacing the protected GM signing secret requires explicit confirmation.');
  }
  const keypair = decodeSecretText(rawSecret);
  if (expectedPublicKey && keypair.publicKey.toBase58() !== expectedPublicKey) {
    throw new Error('The entered signing secret does not match the configured GM hot-wallet address. Nothing was saved.');
  }
  const plaintext = Buffer.from(keypair.secretKey).toString('base64');
  const encrypted = safeStorage.encryptString(plaintext);
  const stored = {
    version: 1,
    publicKey: keypair.publicKey.toBase58(),
    protection: 'Windows DPAPI',
    ciphertext: encrypted.toString('base64'),
  };
  await fs.mkdir(userDataPath, { recursive: true });
  await fs.writeFile(storePath(userDataPath), JSON.stringify(stored, null, 2), { encoding: 'utf8', mode: 0o600 });
  return { configured: true, publicKey: stored.publicKey, protection: stored.protection };
}

async function removeHotWallet(userDataPath, removeConfirmed = false) {
  if (!removeConfirmed) throw new Error('Removing the protected GM signing secret requires explicit confirmation.');
  try {
    await fs.unlink(storePath(userDataPath));
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  return { configured: false, publicKey: '', protection: '' };
}

async function loadHotWallet(userDataPath, safeStorage, expectedPublicKey) {
  if (process.platform !== 'win32') throw new Error('GM hot-wallet signing is only enabled in the native Windows app.');
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows protected storage is unavailable.');
  const stored = JSON.parse(await fs.readFile(storePath(userDataPath), 'utf8'));
  const decrypted = safeStorage.decryptString(Buffer.from(String(stored.ciphertext || ''), 'base64'));
  const keypair = Keypair.fromSecretKey(Buffer.from(decrypted, 'base64'));
  if (expectedPublicKey && keypair.publicKey.toBase58() !== expectedPublicKey) {
    throw new Error('Protected GM hot-wallet key does not match the configured sender address.');
  }
  return keypair;
}

module.exports = { decodeSecretText, getHotWalletStatus, importHotWallet, loadHotWallet, removeHotWallet };
