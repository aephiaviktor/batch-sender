'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { normalizeAephiaKey, validateAephiaKey } = require('../lib/aephia-auth');

test('accepts a 204 Aephia token validation response with bearer auth', async () => {
  let request;
  await validateAephiaKey('test-token', async (url, options) => {
    request = { url, options };
    return { status: 204 };
  });
  assert.equal(request.url, 'https://api.aephia.com/token/validate');
  assert.equal(request.options.method, 'GET');
  assert.equal(request.options.headers.Authorization, 'Bearer test-token');
});

test('rejects missing and unauthorized Aephia API keys', async () => {
  await assert.rejects(() => validateAephiaKey('', async () => ({ status: 204 })), /required/);
  await assert.rejects(() => validateAephiaKey('bad', async () => ({ status: 401 })), /rejected/);
});

test('normalizes API keys copied from env files or authorization headers', () => {
  assert.equal(normalizeAephiaKey('AEPHIA_API_KEY="abc-123"'), 'abc-123');
  assert.equal(normalizeAephiaKey('Bearer abc-123'), 'abc-123');
});

test('accepts a 200 Aephia token validation response', async () => {
  await validateAephiaKey('valid', async () => ({ status: 200 }));
});
