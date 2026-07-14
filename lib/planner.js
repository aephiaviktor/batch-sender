'use strict';

const {
  PublicKey,
  Transaction,
} = require('@solana/web3.js');
const {
  ACCOUNT_SIZE,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  createTransferCheckedWithTransferHookInstruction,
  getAccountLenForMint,
  getAssociatedTokenAddress,
  getMint,
} = require('@solana/spl-token');

const MAX_TRANSACTION_BYTES = 1232;
const PLACEHOLDER_BLOCKHASH = '11111111111111111111111111111111';

function buildSizingTransaction(feePayer, instructionGroups) {
  const transaction = new Transaction({
    feePayer,
    recentBlockhash: PLACEHOLDER_BLOCKHASH,
  });
  for (const group of instructionGroups) transaction.add(...group.instructions);
  return transaction;
}

function shortVectorLength(value) {
  let remaining = Number(value);
  let bytes = 0;
  do {
    bytes += 1;
    remaining >>= 7;
  } while (remaining > 0);
  return bytes;
}

function serializedTransactionSize(transaction) {
  const message = transaction.compileMessage();
  const signatureCount = message.header.numRequiredSignatures;
  return shortVectorLength(signatureCount) + (signatureCount * 64) + message.serialize().length;
}

function chunkInstructionGroups(feePayer, groups, maxBytes = MAX_TRANSACTION_BYTES) {
  const chunks = [];
  let current = [];

  for (const group of groups) {
    const candidate = [...current, group];
    const candidateSize = serializedTransactionSize(buildSizingTransaction(feePayer, candidate));
    if (candidateSize <= maxBytes) {
      current = candidate;
      continue;
    }

    if (!current.length) {
      throw new Error(`${group.name} cannot fit in one Solana transaction (${candidateSize} bytes).`);
    }
    chunks.push(current);
    current = [group];
    const groupSize = serializedTransactionSize(buildSizingTransaction(feePayer, current));
    if (groupSize > maxBytes) {
      throw new Error(`${group.name} cannot fit in one Solana transaction (${groupSize} bytes).`);
    }
  }

  if (current.length) chunks.push(current);
  return chunks;
}

function allocateSourceAmounts(tokenAccounts, requestedAmount, tokenName) {
  let remaining = BigInt(requestedAmount);
  const allocations = [];
  const sortedAccounts = [...tokenAccounts].sort((a, b) => a.address.localeCompare(b.address));
  for (const account of sortedAccounts) {
    if (remaining === 0n) break;
    const available = BigInt(account.amount);
    if (available <= 0n) continue;
    const amount = available < remaining ? available : remaining;
    allocations.push({ address: account.address, amount });
    remaining -= amount;
  }
  if (remaining !== 0n) {
    throw new Error(`${tokenName} source token accounts no longer cover the requested amount.`);
  }
  return allocations;
}

async function createTransferGroup(connection, owner, recipient, transfer) {
  const mint = new PublicKey(transfer.mint);
  const tokenProgramId = new PublicKey(transfer.tokenProgramId);
  const recipientAta = await getAssociatedTokenAddress(
    mint,
    recipient,
    false,
    tokenProgramId,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );
  const ataInfo = await connection.getAccountInfo(recipientAta, 'confirmed');
  if (ataInfo && !ataInfo.owner.equals(tokenProgramId)) {
    throw new Error(`${transfer.name} recipient ATA is owned by an unexpected program.`);
  }

  const instructions = [];
  if (!ataInfo) {
    instructions.push(createAssociatedTokenAccountIdempotentInstruction(
      owner,
      recipientAta,
      recipient,
      mint,
      tokenProgramId,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    ));
  }

  const allocations = allocateSourceAmounts(transfer.tokenAccounts, transfer.requestedAmount, transfer.name);
  for (const allocation of allocations) {
    const source = new PublicKey(allocation.address);
    const instruction = tokenProgramId.equals(TOKEN_2022_PROGRAM_ID)
      ? await createTransferCheckedWithTransferHookInstruction(
          connection,
          source,
          mint,
          recipientAta,
          owner,
          allocation.amount,
          transfer.decimals,
          [],
          'confirmed',
          tokenProgramId,
        )
      : createTransferCheckedInstruction(
          source,
          mint,
          recipientAta,
          owner,
          allocation.amount,
          transfer.decimals,
          [],
          tokenProgramId,
        );
    instructions.push(instruction);
  }

  return {
    name: transfer.name,
    mint: transfer.mint,
    tokenProgramId: transfer.tokenProgramId,
    recipientAta: recipientAta.toBase58(),
    createsAta: !ataInfo,
    requestedAmount: BigInt(transfer.requestedAmount),
    displayAmount: transfer.displayAmount,
    instructions,
  };
}

async function estimateChunkFee(connection, owner, groups, blockhash) {
  const transaction = new Transaction({ feePayer: owner, recentBlockhash: blockhash });
  for (const group of groups) transaction.add(...group.instructions);
  const sizeBytes = serializedTransactionSize(transaction);
  const fee = await connection.getFeeForMessage(transaction.compileMessage(), 'confirmed');
  return {
    feeLamports: Number(fee?.value || 0),
    instructionCount: transaction.instructions.length,
    sizeBytes,
  };
}

async function planBatchTransactions({ connection, owner, recipient, transfers }) {
  const groups = [];
  for (const transfer of transfers) {
    groups.push(await createTransferGroup(connection, owner, recipient, transfer));
  }

  const chunkGroups = chunkInstructionGroups(owner, groups);
  const latestBlockhash = await connection.getLatestBlockhash('confirmed');
  const chunks = [];
  for (let index = 0; index < chunkGroups.length; index += 1) {
    const chunk = chunkGroups[index];
    const estimate = await estimateChunkFee(connection, owner, chunk, latestBlockhash.blockhash);
    chunks.push({
      index: index + 1,
      ...estimate,
      tokens: chunk.map((group) => group.name),
    });
  }

  const ataCreations = groups.filter((group) => group.createsAta).map((group) => ({
    token: group.name,
    mint: group.mint,
    address: group.recipientAta,
  }));
  let totalAtaRentLamports = 0;
  for (const group of groups.filter((entry) => entry.createsAta)) {
    let accountSize = ACCOUNT_SIZE;
    try {
      const mintInfo = await getMint(
        connection,
        new PublicKey(group.mint),
        'confirmed',
        new PublicKey(group.tokenProgramId),
      );
      accountSize = getAccountLenForMint(mintInfo);
    } catch {
      // Standard account size remains a useful estimate if extension decoding fails.
    }
    totalAtaRentLamports += await connection.getMinimumBalanceForRentExemption(accountSize, 'confirmed');
  }
  const networkFeeLamports = chunks.reduce((sum, chunk) => sum + chunk.feeLamports, 0);

  return {
    groups,
    chunkGroups,
    transactionCount: chunks.length,
    instructionCount: groups.reduce((sum, group) => sum + group.instructions.length, 0),
    chunks,
    ataCreations,
    networkFeeLamports,
    ataRentLamports: totalAtaRentLamports,
    estimatedTotalLamports: networkFeeLamports + totalAtaRentLamports,
    isAtomic: chunks.length === 1,
  };
}

module.exports = {
  MAX_TRANSACTION_BYTES,
  allocateSourceAmounts,
  chunkInstructionGroups,
  planBatchTransactions,
  serializedTransactionSize,
};
