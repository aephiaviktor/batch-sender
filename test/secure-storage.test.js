'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { decryptString, encryptString } = require('../lib/secure-storage');

test('prefers Electron asynchronous secure-storage APIs', async () => {
  const calls = [];
  const storage = {
    isAsyncEncryptionAvailable: async () => true,
    encryptStringAsync: async (value) => { calls.push(['encrypt', value]); return Buffer.from('cipher'); },
    decryptStringAsync: async (value) => { calls.push(['decrypt', value.toString()]); return { result: 'plain', shouldReEncrypt: false }; },
  };
  assert.equal((await encryptString(storage, 'plain')).toString(), 'cipher');
  assert.equal(await decryptString(storage, Buffer.from('cipher')), 'plain');
  assert.deepEqual(calls, [['encrypt', 'plain'], ['decrypt', 'cipher']]);
});

test('falls back to the synchronous API for compatibility', async () => {
  const storage = {
    isEncryptionAvailable: () => true,
    encryptString: (value) => Buffer.from(value),
    decryptString: (value) => value.toString(),
  };
  assert.equal((await encryptString(storage, 'secret')).toString(), 'secret');
  assert.equal(await decryptString(storage, Buffer.from('secret')), 'secret');
});

test('rejects unavailable secure storage', async () => {
  await assert.rejects(encryptString({ isAsyncEncryptionAvailable: async () => false }, 'secret'), /unavailable/);
});
