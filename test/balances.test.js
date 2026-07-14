'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { buildSharedRpcUrl } = require('../lib/balances');

test('builds the RPC URL from shared limiter state when enabled', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'batch-sender-limiter-'));
  const previous = process.env.RPC_LIMITER_HOME;
  process.env.RPC_LIMITER_HOME = directory;
  t.after(async () => {
    if (previous === undefined) delete process.env.RPC_LIMITER_HOME;
    else process.env.RPC_LIMITER_HOME = previous;
    await fs.rm(directory, { recursive: true, force: true });
  });
  await fs.writeFile(path.join(directory, 'state.json'), JSON.stringify({
    version: 1,
    enabled: true,
    apiKey: 'shared-key',
    rpcBaseUrl: 'https://mainnet.example.test/rpc',
    buckets: { 'rpc:shared': { nextSlotMs: 0, intervalMs: 1000 } },
    limits: { maxExclusiveMs: 30000, minNormalMsBetweenExclusives: 5000 },
    exclusive: null,
    lastExclusiveEndedAtMs: null,
    revision: 0,
  }));
  assert.equal(buildSharedRpcUrl(), 'https://mainnet.example.test/rpc?api-key=shared-key');
});
