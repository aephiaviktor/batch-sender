'use strict';

const { Connection, PublicKey } = require('@solana/web3.js');
const { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const { formatBaseUnits } = require('./amounts');
const { TOKEN_BY_MINT } = require('./catalog');

const GROUP_ORDER = new Map([
  ['raw', 0],
  ['components', 1],
  ['crew-packs', 2],
  ['ships', 3],
  ['ship-parts', 4],
]);

function createConnection(rpcUrl) {
  if (!rpcUrl) throw new Error('RPC URL is not configured.');
  return new Connection(rpcUrl, 'confirmed');
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
    .sort((a, b) =>
      (GROUP_ORDER.get(a.group) ?? Number.MAX_SAFE_INTEGER) - (GROUP_ORDER.get(b.group) ?? Number.MAX_SAFE_INTEGER)
      || a.name.localeCompare(b.name));
}

module.exports = { createConnection, getEligibleBalances };
