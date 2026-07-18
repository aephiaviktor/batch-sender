'use strict';

async function requireSecureStorage(safeStorage) {
  const available = typeof safeStorage.isAsyncEncryptionAvailable === 'function'
    ? await safeStorage.isAsyncEncryptionAvailable()
    : safeStorage.isEncryptionAvailable();
  if (!available) throw new Error('Secure storage is unavailable on this computer.');
  if (process.platform === 'linux'
      && typeof safeStorage.getSelectedStorageBackend === 'function'
      && safeStorage.getSelectedStorageBackend() === 'basic_text') {
    throw new Error('A secure Linux keyring is required; Electron basic_text storage is not accepted.');
  }
}

async function encryptString(safeStorage, plaintext) {
  await requireSecureStorage(safeStorage);
  if (typeof safeStorage.encryptStringAsync === 'function') return safeStorage.encryptStringAsync(String(plaintext));
  return safeStorage.encryptString(String(plaintext));
}

async function decryptString(safeStorage, encrypted) {
  await requireSecureStorage(safeStorage);
  if (typeof safeStorage.decryptStringAsync === 'function') {
    const decrypted = await safeStorage.decryptStringAsync(encrypted);
    return typeof decrypted === 'string' ? decrypted : decrypted.result;
  }
  return safeStorage.decryptString(encrypted);
}

module.exports = { decryptString, encryptString, requireSecureStorage };
