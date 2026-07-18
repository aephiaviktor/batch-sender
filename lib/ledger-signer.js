'use strict';

const os = require('node:os');
const { PublicKey } = require('@solana/web3.js');
const LedgerSolana = require('@ledgerhq/hw-app-solana').default;
const TransportNodeHid = require('@ledgerhq/hw-transport-node-hid').default;

const DEFAULT_LEDGER_PATH = "44'/501'/0'";

function normalizeLedgerPath(value) {
  return String(value || DEFAULT_LEDGER_PATH)
    .trim()
    .replace(/^m\//i, '')
    .replace(/’/g, "'")
    .replace(/\/+/g, '/') || DEFAULT_LEDGER_PATH;
}

function getCommonLedgerPaths() {
  const paths = new Set(["44'/501'"]);
  for (let index = 0; index <= 30; index += 1) {
    paths.add(`44'/501'/${index}'`);
    paths.add(`44'/501'/${index}'/0'`);
    paths.add(`44'/501'/${index}'/0`);
    paths.add(`44'/501'/${index}'/0/0`);
    paths.add(`501'/${index}'/0/0`);
  }
  return Array.from(paths);
}

function noLedgerMessage() {
  const parts = ['No Ledger device is visible to Batch Sender.'];
  if (process.platform === 'linux' && /microsoft|wsl/i.test(os.release())) {
    parts.push('Run the packaged app natively on the Windows PC where the Ledgers are connected.');
  } else {
    parts.push('Connect and unlock the Ledger, then open its Solana app.');
  }
  return parts.join(' ');
}

async function readAddress(solana, ledgerPath) {
  const result = await solana.getAddress(normalizeLedgerPath(ledgerPath), false);
  return new PublicKey(result.address).toBase58();
}

async function findAtPath(devicePaths, expectedAddress, ledgerPath, onProgress) {
  const errors = [];
  for (let index = 0; index < devicePaths.length; index += 1) {
    const devicePath = devicePaths[index];
    const label = devicePaths.length === 1 ? 'Ledger' : `Ledger ${index + 1} of ${devicePaths.length}`;
    let transport;
    try {
      onProgress(`Identifying ${label} at ${ledgerPath}…`);
      transport = await TransportNodeHid.open(devicePath);
      const solana = new LedgerSolana(transport);
      const address = await readAddress(solana, ledgerPath);
      if (address === expectedAddress) return { transport, solana, ledgerPath, label, address };
      errors.push(`${label} resolves to ${address}`);
    } catch (error) {
      errors.push(`${label}: ${error?.message || String(error)}`);
    }
    if (transport) await transport.close().catch(() => undefined);
  }
  return { errors };
}

async function scanPaths(devicePaths, expectedAddress, excludedPath, onProgress) {
  const paths = getCommonLedgerPaths().filter((ledgerPath) => ledgerPath !== excludedPath);
  const errors = [];
  for (let index = 0; index < devicePaths.length; index += 1) {
    const devicePath = devicePaths[index];
    const label = devicePaths.length === 1 ? 'Ledger' : `Ledger ${index + 1} of ${devicePaths.length}`;
    let transport;
    try {
      onProgress(`Scanning common paths on ${label}…`);
      transport = await TransportNodeHid.open(devicePath);
      const solana = new LedgerSolana(transport);
      for (const ledgerPath of paths) {
        try {
          const address = await readAddress(solana, ledgerPath);
          if (address === expectedAddress) return { transport, solana, ledgerPath, label, address };
        } catch (error) {
          errors.push(`${label} ${ledgerPath}: ${error?.message || String(error)}`);
        }
      }
    } catch (error) {
      errors.push(`${label}: ${error?.message || String(error)}`);
    }
    if (transport) await transport.close().catch(() => undefined);
  }
  return { errors };
}

async function detectLedgerWallets(ledgerPath = DEFAULT_LEDGER_PATH) {
  const normalizedPath = normalizeLedgerPath(ledgerPath);
  const devicePaths = await TransportNodeHid.list();
  if (!devicePaths.length) throw new Error(noLedgerMessage());
  const wallets = [];
  const errors = [];
  for (let index = 0; index < devicePaths.length; index += 1) {
    let transport;
    try {
      transport = await TransportNodeHid.open(devicePaths[index]);
      const solana = new LedgerSolana(transport);
      wallets.push({
        address: await readAddress(solana, normalizedPath),
        derivationPath: normalizedPath,
        device: devicePaths.length === 1 ? 'Ledger' : `Ledger ${index + 1}`,
      });
    } catch (error) {
      errors.push(error?.message || String(error));
    } finally {
      if (transport) await transport.close().catch(() => undefined);
    }
  }
  if (!wallets.length) throw new Error(`Ledger detection failed. ${errors.join(' ')}`);
  return wallets;
}

async function findMatchingLedger(expectedAddress, configuredPath, onProgress = () => undefined) {
  const expected = new PublicKey(expectedAddress).toBase58();
  const ledgerPath = normalizeLedgerPath(configuredPath);
  onProgress('Looking for connected Ledger devices…');
  const devicePaths = await TransportNodeHid.list();
  if (!devicePaths.length) throw new Error(noLedgerMessage());

  const configuredMatch = await findAtPath(devicePaths, expected, ledgerPath, onProgress);
  if (configuredMatch.solana) return configuredMatch;

  const scannedMatch = await scanPaths(devicePaths, expected, ledgerPath, onProgress);
  if (scannedMatch.solana) return scannedMatch;

  const errors = [...(configuredMatch.errors || []), ...(scannedMatch.errors || [])];
  throw new Error([
    `No connected Ledger matched ${expected}.`,
    ...errors.slice(0, 4),
    errors.length > 4 ? `…and ${errors.length - 4} more path checks.` : '',
  ].filter(Boolean).join(' '));
}

async function signTransactionWithLedger(
  transaction,
  expectedAddress,
  configuredPath,
  onProgress = () => undefined,
  onMatched = async () => undefined,
) {
  const match = await findMatchingLedger(expectedAddress, configuredPath, onProgress);
  try {
    await onMatched(match.ledgerPath);
    onProgress(`Matched ${match.label} at ${match.ledgerPath}. Waiting for on-device approval…`);
    const signingErrors = [];
    for (const attempt of [
      { label: 'token transfer mode', userInputType: 'ata' },
      { label: 'standard mode', userInputType: undefined },
    ]) {
      try {
        const result = await match.solana.signTransaction(
          match.ledgerPath,
          Buffer.from(transaction.serializeMessage()),
          attempt.userInputType,
        );
        if (!result?.signature) throw new Error('Ledger returned no signature.');
        transaction.addSignature(new PublicKey(expectedAddress), result.signature);
        return { transaction, ledgerPath: match.ledgerPath, device: match.label };
      } catch (error) {
        signingErrors.push(`${attempt.label}: ${error?.message || String(error)}`);
      }
    }
    throw new Error(`Ledger signing failed. ${signingErrors.join(' ')}`);
  } finally {
    await match.transport.close().catch(() => undefined);
  }
}

module.exports = {
  DEFAULT_LEDGER_PATH,
  detectLedgerWallets,
  findMatchingLedger,
  getCommonLedgerPaths,
  normalizeLedgerPath,
  signTransactionWithLedger,
};
