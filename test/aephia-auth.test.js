'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { validateAephiaKey } = require('../lib/aephia-auth');

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
