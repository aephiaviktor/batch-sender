'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Keypair, PublicKey, TransactionInstruction } = require('@solana/web3.js');
const { TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const { allocateSourceAmounts, chunkInstructionGroups, planBatchTransactions } = require('../lib/planner');

function instruction(seed, dataBytes = 80) {
  const keys = Array.from({ length: 3 }, (_, index) => ({
    pubkey: Keypair.fromSeed(Uint8Array.from({ length: 32 }, () => seed + index + 1)).publicKey,
    isSigner: false,
    isWritable: true,
  }));
  return new TransactionInstruction({
    programId: Keypair.fromSeed(Uint8Array.from({ length: 32 }, () => seed + 10)).publicKey,
    keys,
    data: Buffer.alloc(dataBytes, seed),
  });
}

test('allocates an exact amount deterministically across source accounts', () => {
  const result = allocateSourceAmounts([
    { address: 'B', amount: '70' },
    { address: 'A', amount: '50' },
  ], 90n, 'Fuel');
  assert.deepEqual(result, [
    { address: 'A', amount: 50n },
    { address: 'B', amount: 40n },
  ]);
});

test('rejects source allocation when the fresh balance is insufficient', () => {
  assert.throws(
    () => allocateSourceAmounts([{ address: 'A', amount: '10' }], 11n, 'Fuel'),
    /no longer cover/,
  );
});

test('splits instruction groups deterministically at the serialized size limit', () => {
  const payer = new PublicKey('11111111111111111111111111111111');
  const groups = Array.from({ length: 4 }, (_, index) => ({
    name: `Token ${index + 1}`,
    instructions: [instruction(index + 1)],
  }));
  const chunks = chunkInstructionGroups(payer, groups, 600);
  assert.deepEqual(chunks.map((chunk) => chunk.map((group) => group.name)), [
    ['Token 1', 'Token 2'],
    ['Token 3', 'Token 4'],
  ]);
});

test('rejects a token instruction group that cannot fit by itself', () => {
  const payer = new PublicKey('11111111111111111111111111111111');
  assert.throws(
    () => chunkInstructionGroups(payer, [{ name: 'Huge token', instructions: [instruction(1, 1000)] }], 500),
    /cannot fit/,
  );
});

function mockConnection(ataInfo) {
  return {
    getAccountInfo: async () => ataInfo,
    getLatestBlockhash: async () => ({
      blockhash: '11111111111111111111111111111111',
      lastValidBlockHeight: 123,
    }),
    getFeeForMessage: async () => ({ value: 5000 }),
    getMinimumBalanceForRentExemption: async () => 2039280,
    getAccountInfoAndContext: async () => { throw new Error('mint lookup intentionally unavailable in mock'); },
  };
}

function standardTransfer() {
  const mint = Keypair.generate().publicKey;
  const source = Keypair.generate().publicKey;
  return {
    key: `${mint.toBase58()}:${TOKEN_PROGRAM_ID.toBase58()}`,
    name: 'Fuel',
    group: 'components',
    mint: mint.toBase58(),
    tokenProgramId: TOKEN_PROGRAM_ID.toBase58(),
    decimals: 0,
    tokenAccounts: [{ address: source.toBase58(), amount: '100' }],
    requestedAmount: '25',
    displayAmount: '25',
  };
}

test('plans idempotent ATA creation, transfer, fee, and rent for a missing recipient ATA', async () => {
  const owner = Keypair.generate().publicKey;
  const recipient = Keypair.generate().publicKey;
  const plan = await planBatchTransactions({
    connection: mockConnection(null),
    owner,
    recipient,
    transfers: [standardTransfer()],
  });
  assert.equal(plan.transactionCount, 1);
  assert.equal(plan.instructionCount, 2);
  assert.equal(plan.ataCreations.length, 1);
  assert.equal(plan.networkFeeLamports, 5000);
  assert.equal(plan.ataRentLamports, 2039280);
  assert.equal(plan.estimatedTotalLamports, 2044280);
});

test('does not charge ATA rent or add a creation instruction when the ATA exists', async () => {
  const owner = Keypair.generate().publicKey;
  const recipient = Keypair.generate().publicKey;
  const plan = await planBatchTransactions({
    connection: mockConnection({ owner: TOKEN_PROGRAM_ID }),
    owner,
    recipient,
    transfers: [standardTransfer()],
  });
  assert.equal(plan.instructionCount, 1);
  assert.equal(plan.ataCreations.length, 0);
  assert.equal(plan.ataRentLamports, 0);
});
