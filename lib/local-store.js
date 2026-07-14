'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { PublicKey } = require('@solana/web3.js');

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return fallback;
    throw error;
  }
}

function normalizeRecipients(value) {
  const rows = Array.isArray(value?.recipients) ? value.recipients : [];
  const seen = new Set();
  return rows.flatMap((row) => {
    const name = String(row?.name || '').trim().slice(0, 80);
    const address = String(row?.address || '').trim();
    if (!name || seen.has(address)) return [];
    try {
      const normalizedAddress = new PublicKey(address).toBase58();
      if (seen.has(normalizedAddress)) return [];
      seen.add(normalizedAddress);
      return [{ name, address: normalizedAddress }];
    } catch {
      return [];
    }
  });
}

async function loadRecipients(userDataPath) {
  return normalizeRecipients(await readJson(path.join(userDataPath, 'recipients.json'), { recipients: [] }));
}

async function saveRecipient(userDataPath, payload) {
  const name = String(payload?.name || '').trim().slice(0, 80);
  if (!name) throw new Error('Recipient label is required.');

  let address;
  try {
    address = new PublicKey(String(payload?.address || '').trim()).toBase58();
  } catch {
    throw new Error('Recipient address is not a valid Solana address.');
  }

  const existing = await loadRecipients(userDataPath);
  const recipients = [{ name, address }, ...existing.filter((row) => row.address !== address)];
  await fs.mkdir(userDataPath, { recursive: true });
  await fs.writeFile(
    path.join(userDataPath, 'recipients.json'),
    JSON.stringify({ recipients }, null, 2),
    { encoding: 'utf8', mode: 0o600 },
  );
  return recipients;
}

async function loadPublicConfig(userDataPath) {
  const raw = await readJson(path.join(userDataPath, 'config.json'), {});
  const profiles = raw && typeof raw.profiles === 'object' ? raw.profiles : {};
  return {
    rpcUrl: String(raw?.rpcUrl || '').trim(),
    profiles,
  };
}

module.exports = { loadPublicConfig, loadRecipients, saveRecipient };
