'use strict';

const { Connection, PublicKey } = require('@solana/web3.js');
const { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const { RpcLimiter, resolvePaths } = require('rpc_limiter');
const { readState } = require('rpc_limiter/dist/state');
const { formatBaseUnits } = require('./amounts');
const { TOKEN_BY_MINT } = require('./catalog');

function buildSharedRpcUrl() {
  const paths = resolvePaths();
  const state = readState(paths.stateFile, Date.now());
  if (!state.enabled) throw new Error('The shared RPC Limiter is not enabled. Configure it in one of the bot apps first.');
  const base = String(state.rpcBaseUrl || '').trim();
  if (!base) throw new Error('The shared RPC Limiter has no RPC URL configured.');
  const url = new URL(base);
  if (state.apiKey) url.searchParams.set('api-key', state.apiKey);
  return url.toString();
}

function createConnection(rpcUrl, useRpcLimiter = false, profile = 'default') {
  const effectiveUrl = useRpcLimiter ? buildSharedRpcUrl() : rpcUrl;
  if (!effectiveUrl) throw new Error('RPC URL is not configured.');
  const connection = new Connection(effectiveUrl, 'confirmed');
  if (!useRpcLimiter) return connection;

  const limiter = new RpcLimiter();
  const rpcMethods = new Set([
    'confirmTransaction', 'getAccountInfo', 'getBalance', 'getFeeForMessage', 'getLatestBlockhash',
    'getMinimumBalanceForRentExemption', 'getParsedTokenAccountsByOwner', 'getSignatureStatuses', 'sendRawTransaction',
  ]);
  return new Proxy(connection, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== 'function' || !rpcMethods.has(String(property))) return typeof value === 'function' ? value.bind(target) : value;
      return async (...args) => {
        const method = String(property);
        await limiter.wait(method === 'sendRawTransaction' ? 'tx:shared' : 'rpc:shared', {
          label: `Connection.${method}()`,
          metrics: { app: 'Batch Sender', profile, method },
          deadlineMs: Date.now() + 30000,
        });
        return value.apply(target, args);
      };
    },
  });
}

async function getEligibleBalances(connection, ownerAddress) {
  const owner = new PublicKey(ownerAddress);
  const balances = new Map();

  for (const programId of [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID]) {
    const response = await connection.getParsedTokenAccountsByOwner(owner, { programId }, 'confirmed');
    for (const item of response.value) {
      const info = item.account.data?.parsed?.info;
      const token = TOKEN_BY_MINT.get(String(info?.mint || ''));
      const amountText = String(info?.tokenAmount?.amount || '0');
      if (!token || amountText === '0') continue;

      const decimals = Number(info.tokenAmount?.decimals || 0);
      const key = `${token.mint}:${programId.toBase58()}`;
      const existing = balances.get(key) || {
        key,
        name: token.name,
        group: token.group,
        mint: token.mint,
        tokenProgramId: programId.toBase58(),
        decimals,
        amount: 0n,
        tokenAccounts: [],
      };
      if (existing.decimals !== decimals) {
        throw new Error(`Conflicting decimals returned for ${token.name}.`);
      }
      existing.amount += BigInt(amountText);
      existing.tokenAccounts.push({ address: item.pubkey.toBase58(), amount: amountText });
      balances.set(key, existing);
    }
  }

  return Array.from(balances.values())
    .map((row) => ({
      ...row,
      amount: row.amount.toString(),
      uiAmount: formatBaseUnits(row.amount, row.decimals),
    }))
    .sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name));
}

module.exports = { buildSharedRpcUrl, createConnection, getEligibleBalances };
