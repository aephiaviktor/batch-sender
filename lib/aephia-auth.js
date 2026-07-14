'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const VALIDATE_URL = 'https://api.aephia.com/token/validate';
const FILE_NAME = 'aephia-token.bin';

async function validateAephiaKey(token, fetchImpl = fetch) {
  const value = String(token || '').trim();
  if (!value) throw new Error('Aephia API key is required.');
  let response;
  try {
    response = await fetchImpl(VALIDATE_URL, {
      method: 'GET',
      headers: { Authorization: `Bearer ${value}` },
    });
  } catch {
    throw new Error('Aephia token service or network is unavailable.');
  }
  if (response.status === 204) return true;
  if (response.status === 401) throw new Error('Aephia API key was rejected. Enter a current key.');
  if (response.status >= 500) throw new Error('Aephia token service is temporarily unavailable.');
  throw new Error(`Unexpected Aephia token validation response: HTTP ${response.status}.`);
}

async function readAephiaKey(userDataPath, safeStorage) {
  let encrypted;
  try { encrypted = await fs.readFile(path.join(userDataPath, FILE_NAME)); }
  catch (error) { if (error?.code === 'ENOENT') return ''; throw error; }
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows protected storage is unavailable.');
  return safeStorage.decryptString(encrypted).trim();
}

async function saveAephiaKey(userDataPath, safeStorage, token, fetchImpl = fetch) {
  const value = String(token || '').trim();
  await validateAephiaKey(value, fetchImpl);
  if (process.platform !== 'win32') throw new Error('Aephia API key storage is only enabled in the native Windows app.');
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows protected storage is unavailable.');
  await fs.mkdir(userDataPath, { recursive: true });
  await fs.writeFile(path.join(userDataPath, FILE_NAME), safeStorage.encryptString(value), { mode: 0o600 });
  return { configured: true, valid: true, protection: 'Windows DPAPI' };
}

module.exports = { readAephiaKey, saveAephiaKey, validateAephiaKey, VALIDATE_URL };
