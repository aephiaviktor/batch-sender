'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { decryptString, encryptString } = require('./secure-storage');

const VALIDATE_URL = 'https://api.aephia.com/token/validate';
const FILE_NAME = 'aephia-token.bin';

function normalizeAephiaKey(token) {
  let value = String(token || '').trim();
  value = value.replace(/^AEPHIA_API_KEY\s*=\s*/i, '').trim();
  value = value.replace(/^Bearer\s+/i, '').trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1).trim();
  }
  return value;
}

async function validateAephiaKey(token, fetchImpl = fetch) {
  const value = normalizeAephiaKey(token);
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
  if (response.status === 200 || response.status === 204) return true;
  if (response.status === 401) throw new Error('Aephia API key was rejected. Enter a current key.');
  if (response.status >= 500) throw new Error('Aephia token service is temporarily unavailable.');
  throw new Error(`Unexpected Aephia token validation response: HTTP ${response.status}.`);
}

async function readAephiaKey(userDataPath, safeStorage) {
  let encrypted;
  try { encrypted = await fs.readFile(path.join(userDataPath, FILE_NAME)); }
  catch (error) { if (error?.code === 'ENOENT') return ''; throw error; }
  return (await decryptString(safeStorage, encrypted)).trim();
}

async function saveAephiaKey(userDataPath, safeStorage, token, fetchImpl = fetch) {
  const value = normalizeAephiaKey(token);
  await validateAephiaKey(value, fetchImpl);
  await fs.mkdir(userDataPath, { recursive: true });
  await fs.writeFile(path.join(userDataPath, FILE_NAME), await encryptString(safeStorage, value), { mode: 0o600 });
  return { configured: true, valid: true, protection: 'Secure storage' };
}

module.exports = { normalizeAephiaKey, readAephiaKey, saveAephiaKey, validateAephiaKey, VALIDATE_URL };
