'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { PublicKey } = require('@solana/web3.js');

const LEGACY_PROFILES = [
  ['mud-ledger', 'MUD Ledger', 'ledger'],
  ['oni-ledger', 'ONI Ledger', 'ledger'],
  ['ustur-ledger', 'USTUR Ledger', 'ledger'],
  ['gm-hot-wallet', 'GM Market Bot', 'hot-wallet'],
];

async function readJson(filePath, fallback) {
  try { return JSON.parse(await fs.readFile(filePath, 'utf8')); }
  catch (error) { if (error?.code === 'ENOENT') return fallback; throw error; }
}

function normalizeWallet(row) {
  const id = String(row?.id || '').trim();
  const name = String(row?.name || '').trim().slice(0, 80);
  const kind = row?.kind === 'ledger' ? 'ledger' : row?.kind === 'hot-wallet' ? 'hot-wallet' : '';
  let address = '';
  try { address = new PublicKey(String(row?.address || '').trim()).toBase58(); } catch { return null; }
  if (!id || !name || !kind) return null;
  return {
    id, name, kind, address,
    derivationPath: kind === 'ledger' ? String(row?.derivationPath || "44'/501'/0'").trim() : '',
  };
}

function migrateLegacyProfiles(profiles) {
  return LEGACY_PROFILES.flatMap(([id, name, kind]) => {
    const stored = profiles?.[id];
    if (!stored?.address) return [];
    return [normalizeWallet({ id, name, kind, ...stored })].filter(Boolean);
  });
}

async function loadPublicConfig(userDataPath) {
  const raw = await readJson(path.join(userDataPath, 'config.json'), {});
  const source = Array.isArray(raw?.wallets) ? raw.wallets.map(normalizeWallet).filter(Boolean) : migrateLegacyProfiles(raw?.profiles);
  const seen = new Set();
  const wallets = source.filter((wallet) => {
    if (seen.has(wallet.id)) return false;
    seen.add(wallet.id);
    return true;
  });
  return { rpcUrl: String(raw?.rpcUrl || '').trim(), wallets };
}

function validateRpcUrl(value) {
  const rpcUrl = String(value || '').trim();
  if (!rpcUrl) return '';
  let parsed;
  try { parsed = new URL(rpcUrl); } catch { throw new Error('RPC URL is not a valid URL.'); }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('RPC URL must use http:// or https://.');
  return rpcUrl;
}

async function writeConfig(userDataPath, config) {
  await fs.mkdir(userDataPath, { recursive: true });
  await fs.writeFile(path.join(userDataPath, 'config.json'), JSON.stringify(config, null, 2), { encoding: 'utf8', mode: 0o600 });
  return config;
}

async function savePublicConfig(userDataPath, payload) {
  const current = await loadPublicConfig(userDataPath);
  let wallets = current.wallets;
  if (Array.isArray(payload?.wallets)) {
    wallets = payload.wallets.map((row) => {
      const wallet = normalizeWallet(row);
      if (!wallet) throw new Error(`${String(row?.name || row?.id || 'Wallet')} is not a valid Solana wallet.`);
      return wallet;
    });
  }
  return writeConfig(userDataPath, { rpcUrl: validateRpcUrl(payload?.rpcUrl), wallets });
}

async function addWallet(userDataPath, payload) {
  const config = await loadPublicConfig(userDataPath);
  const wallet = normalizeWallet({ ...payload, id: String(payload?.id || `wallet-${randomUUID()}`) });
  if (!wallet) throw new Error('The wallet details are invalid.');
  if (config.wallets.some((row) => row.address === wallet.address)) throw new Error('That wallet has already been added.');
  config.wallets.push(wallet);
  await writeConfig(userDataPath, config);
  return wallet;
}

async function removeWallet(userDataPath, walletId) {
  const config = await loadPublicConfig(userDataPath);
  const wallet = config.wallets.find((row) => row.id === walletId);
  if (!wallet) throw new Error('Wallet not found.');
  config.wallets = config.wallets.filter((row) => row.id !== walletId);
  await writeConfig(userDataPath, config);
  return wallet;
}

async function saveLedgerDerivationPath(userDataPath, profileId, derivationPath) {
  const config = await loadPublicConfig(userDataPath);
  const wallet = config.wallets.find((row) => row.id === profileId);
  if (!wallet || wallet.kind !== 'ledger') throw new Error('Cannot cache a derivation path for a non-Ledger wallet.');
  wallet.derivationPath = String(derivationPath || '').trim();
  await writeConfig(userDataPath, config);
  return config;
}

function normalizeRecipients(value) {
  const rows = Array.isArray(value?.recipients) ? value.recipients : [];
  const seen = new Set();
  return rows.flatMap((row) => {
    const name = String(row?.name || '').trim().slice(0, 80);
    try {
      const address = new PublicKey(String(row?.address || '').trim()).toBase58();
      if (!name || seen.has(address)) return [];
      seen.add(address); return [{ name, address }];
    } catch { return []; }
  });
}

async function loadRecipients(userDataPath) {
  return normalizeRecipients(await readJson(path.join(userDataPath, 'recipients.json'), { recipients: [] }));
}

async function saveRecipient(userDataPath, payload) {
  const name = String(payload?.name || '').trim().slice(0, 80);
  if (!name) throw new Error('Recipient label is required.');
  let address;
  try { address = new PublicKey(String(payload?.address || '').trim()).toBase58(); }
  catch { throw new Error('Recipient address is not a valid Solana address.'); }
  const existing = await loadRecipients(userDataPath);
  const recipients = [{ name, address }, ...existing.filter((row) => row.address !== address)];
  await fs.mkdir(userDataPath, { recursive: true });
  await fs.writeFile(path.join(userDataPath, 'recipients.json'), JSON.stringify({ recipients }, null, 2), { encoding: 'utf8', mode: 0o600 });
  return recipients;
}

module.exports = { addWallet, loadPublicConfig, loadRecipients, removeWallet, saveLedgerDerivationPath, savePublicConfig, saveRecipient };
