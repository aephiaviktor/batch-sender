'use strict';

const { createHash, randomUUID } = require('node:crypto');
const { execFile, spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const { promisify } = require('node:util');
const bs58 = require('bs58');
const { app, BrowserWindow, ipcMain, Menu, safeStorage } = require('electron');
const { PublicKey, Transaction } = require('@solana/web3.js');
const { createConnection, getEligibleBalances } = require('../lib/balances');
const { readAephiaKey, saveAephiaKey, validateAephiaKey } = require('../lib/aephia-auth');
const { parseTokenAmount, formatBaseUnits } = require('../lib/amounts');
const { getHotWalletStatuses, importHotWallet, loadHotWallet, removeHotWallet } = require('../lib/hot-wallet-store');
const { detectLedgerWallets, signTransactionWithLedger } = require('../lib/ledger-signer');
const {
  addWallet,
  loadPublicConfig,
  loadRecipients,
  removeWallet,
  saveLedgerDerivationPath,
  savePublicConfig,
  saveRecipient,
} = require('../lib/local-store');
const { planBatchTransactions } = require('../lib/planner');
const { getSenderProfile } = require('../lib/profiles');
const { buildWindowsInstallerScript } = require('../lib/updater');

const APP_NAME = 'Batch Sender';
const PREVIEW_TTL_MS = 5 * 60 * 1000;
const previewSessions = new Map();
let mainWindow;
let aephiaValidation = { checkedAt: 0, valid: false, message: 'Aephia API key is required.' };
const execFileAsync = promisify(execFile);
const APP_ROOT = path.resolve(__dirname, '..');
const AEPHIA_VALIDATION_TTL_MS = 5 * 60 * 1000;
const GITHUB_REPO = 'aephiaviktor/batch-sender';
const GITHUB_PACKAGE_URL = `https://raw.githubusercontent.com/${GITHUB_REPO}/main/package.json`;
const GITHUB_MAIN_ARCHIVE_URL = `https://codeload.github.com/${GITHUB_REPO}/tar.gz/refs/heads/main`;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 900,
    minWidth: 860,
    minHeight: 680,
    title: APP_NAME,
    backgroundColor: '#07111f',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  const smokeScreenshotArg = process.argv.find((argument) => argument.startsWith('--smoke-screenshot='));
  if (smokeScreenshotArg) {
    const outputPath = path.resolve(smokeScreenshotArg.slice('--smoke-screenshot='.length));
    mainWindow.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        try {
          const image = await mainWindow.webContents.capturePage();
          await fs.writeFile(outputPath, image.toPNG());
          console.log(`Smoke screenshot written to ${outputPath}`);
          app.exit(0);
        } catch (error) {
          console.error(`Smoke screenshot failed: ${error?.message || String(error)}`);
          app.exit(1);
        }
      }, 1200);
    });
  }
  mainWindow.loadFile(path.join(__dirname, 'renderer.html'));
}

function installMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'File', submenu: [{ role: 'quit' }] },
    { label: 'View', submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }] },
  ]));
}

function publicProfileState(config, hotWallets = {}) {
  return config.wallets.map((wallet) => ({
    ...wallet,
    configured: Boolean(wallet.address && config.rpcUrl),
    signerReady: wallet.kind === 'ledger' || Boolean(hotWallets[wallet.id]?.configured),
    protection: hotWallets[wallet.id]?.protection || '',
  }));
}

async function getState() {
  const userDataPath = app.getPath('userData');
  const config = await loadPublicConfig(userDataPath);
  const hotWallets = await getHotWalletStatuses(userDataPath);
  const aephia = await getAephiaStatus();
  return {
    ok: true,
    version: require('../package.json').version,
    profiles: publicProfileState(config, hotWallets),
    recipients: await loadRecipients(userDataPath),
    hotWallets,
    rpcUrl: config.rpcUrl,
    rpcConfigured: Boolean(config.rpcUrl),
    configPath: path.join(userDataPath, 'config.json'),
    aephia,
  };
}

async function getAephiaStatus(force = false) {
  if (!force && Date.now() - aephiaValidation.checkedAt < AEPHIA_VALIDATION_TTL_MS) return aephiaValidation;
  try {
    const token = await readAephiaKey(app.getPath('userData'), safeStorage);
    if (!token) throw new Error('Aephia API key is required.');
    await validateAephiaKey(token);
    aephiaValidation = { configured: true, valid: true, protection: 'Secure storage', checkedAt: Date.now(), message: '' };
  } catch (error) {
    aephiaValidation = {
      configured: !String(error?.message || '').includes('is required'),
      valid: false,
      checkedAt: Date.now(),
      message: error?.message || String(error),
    };
  }
  return aephiaValidation;
}

async function requireValidAephiaKey() {
  const status = await getAephiaStatus();
  if (!status.valid) throw new Error(status.message || 'A valid Aephia API key is required.');
}

async function runCommand(command, args, cwd = APP_ROOT, timeout = 120000) {
  let executable = command;
  let commandArgs = args;
  if (process.platform === 'win32' && command === 'npm') {
    executable = process.env.ComSpec || 'cmd.exe';
    commandArgs = ['/d', '/s', '/c', 'npm.cmd', ...args];
  }
  const result = await execFileAsync(executable, commandArgs, { cwd, windowsHide: true, timeout });
  return String(result.stdout || '').trim();
}

async function checkForUpdates() {
  const response = await fetch(`${GITHUB_PACKAGE_URL}?t=${Date.now()}`, {
    headers: { 'User-Agent': 'batch-sender-updater' },
  });
  if (!response.ok) throw new Error(`Public GitHub update check failed: HTTP ${response.status}.`);
  const remotePackage = await response.json();
  const current = require('../package.json').version;
  const latest = String(remotePackage?.version || '').trim();
  if (!/^\d+\.\d+\.\d+$/.test(latest)) throw new Error('Public GitHub package version is invalid.');
  const toParts = (version) => version.split('.').map(Number);
  const [a, b] = [toParts(latest), toParts(current)];
  const updateAvailable = a.some((part, index) => part !== b[index] && a.slice(0, index).every((value, earlier) => value === b[earlier]) && part > b[index]);
  return { ok: true, updateAvailable, current, latest };
}

async function installUpdate() {
  const response = await fetch(`${GITHUB_MAIN_ARCHIVE_URL}?t=${Date.now()}`, {
    headers: { 'User-Agent': 'batch-sender-updater' },
  });
  if (!response.ok) throw new Error(`Public GitHub archive download failed: HTTP ${response.status}.`);

  const stagingPath = await fs.mkdtemp(path.join(app.getPath('temp'), 'batch-sender-update-'));
  const archivePath = path.join(stagingPath, 'main.tar.gz');
  await fs.writeFile(archivePath, Buffer.from(await response.arrayBuffer()));
  await runCommand('tar', ['-xzf', archivePath, '-C', stagingPath], stagingPath);
  const entries = await fs.readdir(stagingPath, { withFileTypes: true });
  const sourceEntry = entries.find((entry) => entry.isDirectory());
  if (!sourceEntry) throw new Error('The downloaded GitHub archive did not contain an app folder.');
  const sourcePath = path.join(stagingPath, sourceEntry.name);
  const sourcePackage = JSON.parse(await fs.readFile(path.join(sourcePath, 'package.json'), 'utf8'));
  if (!/^\d+\.\d+\.\d+$/.test(String(sourcePackage?.version || ''))) {
    throw new Error('The downloaded GitHub archive has an invalid package version.');
  }

  if (process.platform === 'win32') {
    await runCommand('npm', ['ci'], sourcePath, 10 * 60 * 1000);
    await runCommand('node', [path.join(sourcePath, 'node_modules', 'electron', 'install.js')], sourcePath, 10 * 60 * 1000);
    const stagedElectronPath = path.join(sourcePath, 'node_modules', 'electron', 'dist', 'electron.exe');
    try {
      await fs.access(stagedElectronPath);
    } catch {
      throw new Error('Electron binary installation did not produce electron.exe.');
    }
    const scriptPath = path.join(stagingPath, 'install-update.ps1');
    const script = buildWindowsInstallerScript({
      sourcePath,
      destinationPath: APP_ROOT,
      stagingPath,
      logPath: path.join(app.getPath('userData'), 'updater.log'),
      parentPid: process.pid,
      expectedVersion: String(sourcePackage.version),
    });
    await fs.writeFile(scriptPath, script, 'utf8');
    const helper = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath], {
      cwd: stagingPath,
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    helper.unref();
  } else {
    const shellQuote = (value) => `'${String(value).replace(/'/g, `'\\''`)}'`;
    const scriptPath = path.join(stagingPath, 'install-update.sh');
    const script = `#!/bin/sh\nset -e\nsleep 2\ncp -R ${shellQuote(sourcePath)}/. ${shellQuote(APP_ROOT)}/\ncd ${shellQuote(APP_ROOT)}\nnpm ci || npm install\nrm -rf ${shellQuote(stagingPath)}\nexec npm start\n`;
    await fs.writeFile(scriptPath, script, { encoding: 'utf8', mode: 0o700 });
    const helper = spawn('/bin/sh', [scriptPath], { cwd: stagingPath, detached: true, stdio: 'ignore' });
    helper.unref();
  }
  setImmediate(() => app.exit(0));
  return { ok: true, restarting: true };
}

async function addHotWallet(payload) {
  const userDataPath = app.getPath('userData');
  const walletId = `wallet-${randomUUID()}`;
  const status = await importHotWallet(userDataPath, safeStorage, walletId, payload?.secretKey);
  try {
    await addWallet(userDataPath, { id: walletId, name: payload?.name, kind: 'hot-wallet', address: status.publicKey });
  } catch (error) {
    await removeHotWallet(userDataPath, walletId, true).catch(() => undefined);
    throw error;
  }
  return getState();
}

async function addLedgerWallet(payload) {
  const detected = await detectLedgerWallets(payload?.derivationPath);
  const selected = detected[Number(payload?.deviceIndex || 0)];
  if (!selected) throw new Error('Select a detected Ledger.');
  await addWallet(app.getPath('userData'), {
    name: payload?.name,
    kind: 'ledger',
    address: selected.address,
    derivationPath: selected.derivationPath,
  });
  return getState();
}

async function deleteWallet(payload) {
  if (payload?.removeConfirmed !== true) throw new Error('Removing a wallet requires explicit confirmation.');
  const userDataPath = app.getPath('userData');
  const wallet = await removeWallet(userDataPath, String(payload?.walletId || ''));
  if (wallet.kind === 'hot-wallet') await removeHotWallet(userDataPath, wallet.id, true);
  return getState();
}

async function getProfileContext(profileId) {
  const config = await loadPublicConfig(app.getPath('userData'));
  const profile = getSenderProfile(config.wallets, String(profileId || ''));
  if (!profile) throw new Error('Unknown sender wallet.');
  let owner;
  try {
    owner = new PublicKey(String(profile.address || '').trim());
  } catch {
    throw new Error(`${profile.name} public address is invalid.`);
  }
  return { profile, config, owner, connection: createConnection(config.rpcUrl) };
}

async function refreshBalances(profileId) {
  const { owner, connection } = await getProfileContext(profileId);
  return getEligibleBalances(connection, owner);
}

function normalizeBatchRequest(payload) {
  const transfers = Array.isArray(payload?.transfers) ? payload.transfers : [];
  if (!transfers.length) throw new Error('Enter an amount for at least one token.');
  if (transfers.length > 50) throw new Error('A batch cannot contain more than 50 token rows.');
  const seen = new Set();
  const normalizedTransfers = transfers.map((entry) => {
    const key = String(entry?.key || '').trim();
    const amount = String(entry?.amount || '').trim();
    if (!key || !amount) throw new Error('Every transfer row must include a token and amount.');
    if (seen.has(key)) throw new Error('A token may only appear once in a batch.');
    seen.add(key);
    return { key, amount };
  });
  return {
    profileId: String(payload?.profileId || '').trim(),
    recipient: String(payload?.recipient || '').trim(),
    transfers: normalizedTransfers,
  };
}

function planFingerprint(execution) {
  const value = {
    sender: execution.owner.toBase58(),
    recipient: execution.recipient.toBase58(),
    transfers: execution.transfers.map((row) => [row.key, row.requestedAmount]),
    atas: execution.plan.ataCreations.map((row) => [row.mint, row.address]),
    chunks: execution.plan.chunkGroups.map((chunk) => chunk.map((group) => [group.mint, group.instructions.length])),
  };
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

async function prepareBatch(rawPayload) {
  const request = normalizeBatchRequest(rawPayload);
  const { profile, config, owner, connection } = await getProfileContext(request.profileId);
  let recipient;
  try {
    recipient = new PublicKey(request.recipient);
  } catch {
    throw new Error('Recipient address is not a valid Solana address.');
  }
  if (recipient.equals(owner)) throw new Error('Sender and recipient must be different wallets.');

  const balances = await getEligibleBalances(connection, owner);
  const byKey = new Map(balances.map((row) => [row.key, row]));
  const transfers = request.transfers.map((requested) => {
    const balance = byKey.get(requested.key);
    if (!balance) throw new Error('One selected token is no longer available in the sender wallet.');
    const amount = parseTokenAmount(requested.amount, balance.decimals);
    if (amount > BigInt(balance.amount)) {
      throw new Error(`${balance.name} amount is higher than the available balance.`);
    }
    return {
      key: balance.key,
      name: balance.name,
      group: balance.group,
      mint: balance.mint,
      tokenProgramId: balance.tokenProgramId,
      decimals: balance.decimals,
      tokenAccounts: balance.tokenAccounts,
      requestedAmount: amount.toString(),
      displayAmount: formatBaseUnits(amount, balance.decimals),
    };
  });

  const plan = await planBatchTransactions({ connection, owner, recipient, transfers });
  const senderSolLamports = await connection.getBalance(owner, 'confirmed');
  const execution = { request, profile, config, owner, recipient, connection, transfers, plan, senderSolLamports };
  return execution;
}

function publicPreview(execution) {
  const { profile, owner, recipient, transfers, plan, senderSolLamports } = execution;
  return {
    ok: true,
    sender: { id: profile.id, name: profile.name, kind: profile.kind, address: owner.toBase58() },
    recipient: recipient.toBase58(),
    feePayer: owner.toBase58(),
    transfers: transfers.map(({ tokenAccounts, ...transfer }) => transfer),
    plan: {
      transactionCount: plan.transactionCount,
      instructionCount: plan.instructionCount,
      chunks: plan.chunks,
      ataCreations: plan.ataCreations,
      networkFeeLamports: plan.networkFeeLamports,
      ataRentLamports: plan.ataRentLamports,
      estimatedTotalLamports: plan.estimatedTotalLamports,
      isAtomic: plan.isAtomic,
      senderSolLamports,
      hasEnoughSol: senderSolLamports >= plan.estimatedTotalLamports,
    },
    notice: plan.isAtomic
      ? 'This batch currently fits in one atomic Solana transaction.'
      : 'This batch requires multiple transactions and is not atomic. Earlier chunks may succeed if a later chunk fails.',
  };
}

async function previewBatch(payload) {
  const execution = await prepareBatch(payload);
  const previewId = randomUUID();
  const now = Date.now();
  for (const [id, session] of previewSessions) {
    if (session.expiresAt <= now) previewSessions.delete(id);
  }
  previewSessions.set(previewId, {
    request: execution.request,
    fingerprint: planFingerprint(execution),
    expiresAt: now + PREVIEW_TTL_MS,
  });
  return { ...publicPreview(execution), previewId };
}

function transactionSignature(transaction) {
  const signature = transaction.signatures[0]?.signature;
  return signature ? (bs58.encode || bs58.default.encode)(signature) : '';
}

async function querySignature(connection, signature) {
  if (!signature) return null;
  try {
    const response = await connection.getSignatureStatuses([signature], { searchTransactionHistory: true });
    return response.value[0] || null;
  } catch {
    return null;
  }
}

async function describeRpcError(connection, error) {
  const parts = [error?.message || String(error)];
  let logs = Array.isArray(error?.logs) ? error.logs : [];
  if (!logs.length && typeof error?.getLogs === 'function') {
    try { logs = await error.getLogs(connection) || []; } catch { /* Keep the original RPC error. */ }
  }
  if (logs.length) parts.push(`Logs: ${logs.join(' | ')}`);
  return parts.join(' ');
}

async function confirmBroadcast(connection, signature, blockhash) {
  try {
    const confirmation = await connection.confirmTransaction({
      signature,
      blockhash: blockhash.blockhash,
      lastValidBlockHeight: blockhash.lastValidBlockHeight,
    }, 'confirmed');
    if (confirmation.value.err) {
      return { status: 'failed', message: `On-chain transaction error: ${JSON.stringify(confirmation.value.err)}` };
    }
    return { status: 'confirmed', message: 'Confirmed' };
  } catch (error) {
    const status = await querySignature(connection, signature);
    if (status?.err) return { status: 'failed', message: `On-chain transaction error: ${JSON.stringify(status.err)}` };
    if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized') {
      return { status: 'confirmed', message: `Confirmed after RPC confirmation warning: ${error?.message || String(error)}` };
    }
    return {
      status: 'unknown',
      message: `Broadcast returned signature ${signature}, but confirmation is still unknown: ${error?.message || String(error)}`,
    };
  }
}

async function signPlannedTransaction(execution, transaction, ledgerPath, onProgress) {
  if (execution.profile.kind === 'ledger') {
    const signed = await signTransactionWithLedger(
      transaction,
      execution.owner.toBase58(),
      ledgerPath,
      onProgress,
      async (matchedLedgerPath) => {
        if (matchedLedgerPath === ledgerPath) return;
        await saveLedgerDerivationPath(app.getPath('userData'), execution.profile.id, matchedLedgerPath);
        onProgress(`Saved ${matchedLedgerPath} for future ${execution.profile.name} sends.`);
      },
    );
    return { transaction: signed.transaction, ledgerPath: signed.ledgerPath };
  }

  onProgress('Loading the protected hot-wallet secret key…');
  const signer = await loadHotWallet(app.getPath('userData'), safeStorage, execution.profile.id, execution.owner.toBase58());
  transaction.sign(signer);
  return { transaction, ledgerPath: '' };
}

async function sendPreviewedBatch(payload, onProgress = () => undefined) {
  const previewId = String(payload?.previewId || '').trim();
  const session = previewSessions.get(previewId);
  previewSessions.delete(previewId);
  if (!session || session.expiresAt <= Date.now()) {
    throw new Error('This preview has expired or was already used. Preview the batch again.');
  }

  onProgress('Re-fetching balances and rebuilding the approved batch…');
  const execution = await prepareBatch(session.request);
  if (planFingerprint(execution) !== session.fingerprint) {
    throw new Error('The balance, recipient ATA state, or transaction split changed. Preview the batch again before signing.');
  }
  if (execution.senderSolLamports < execution.plan.estimatedTotalLamports) {
    throw new Error('The selected sender does not have enough SOL for the estimated fees and ATA rent.');
  }

  let ledgerPath = String(execution.profile.derivationPath || '').trim();
  const results = [];

  for (let index = 0; index < execution.plan.chunkGroups.length; index += 1) {
    const groups = execution.plan.chunkGroups[index];
    const chunkNumber = index + 1;
    onProgress(`Preparing transaction ${chunkNumber} of ${execution.plan.transactionCount}…`);
    const blockhash = await execution.connection.getLatestBlockhash('confirmed');
    const transaction = new Transaction({ feePayer: execution.owner, recentBlockhash: blockhash.blockhash });
    for (const group of groups) transaction.add(...group.instructions);

    let signed;
    try {
      signed = await signPlannedTransaction(execution, transaction, ledgerPath, onProgress);
      ledgerPath = signed.ledgerPath || ledgerPath;
    } catch (error) {
      results.push({
        index: chunkNumber,
        status: 'failed',
        signature: '',
        tokens: groups.map((group) => group.name),
        message: `Signing failed: ${error?.message || String(error)}`,
      });
      break;
    }

    const expectedSignature = transactionSignature(signed.transaction);
    onProgress(`Broadcasting transaction ${chunkNumber} of ${execution.plan.transactionCount}…`);
    let signature;
    try {
      signature = await execution.connection.sendRawTransaction(signed.transaction.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });
    } catch (error) {
      const errorDetails = await describeRpcError(execution.connection, error);
      const status = await querySignature(execution.connection, expectedSignature);
      const landed = status && !status.err;
      const deterministicFailure = /simulation failed|preflight failure|blockhash not found|insufficient funds/i.test(errorDetails);
      results.push({
        index: chunkNumber,
        status: landed && ['confirmed', 'finalized'].includes(status.confirmationStatus)
          ? 'confirmed'
          : deterministicFailure ? 'failed' : 'unknown',
        signature: expectedSignature,
        tokens: groups.map((group) => group.name),
        message: landed
          ? `Transaction landed despite the broadcast error: ${errorDetails}`
          : deterministicFailure
            ? `Transaction was rejected before broadcast: ${errorDetails}`
            : `Broadcast outcome is unknown: ${errorDetails}`,
      });
      break;
    }

    onProgress(`Confirming transaction ${chunkNumber} of ${execution.plan.transactionCount}…`);
    const confirmation = await confirmBroadcast(execution.connection, signature, blockhash);
    results.push({
      index: chunkNumber,
      status: confirmation.status,
      signature,
      tokens: groups.map((group) => group.name),
      message: confirmation.message,
    });
    if (confirmation.status !== 'confirmed') break;
  }

  const confirmedCount = results.filter((result) => result.status === 'confirmed').length;
  const attemptedAll = results.length === execution.plan.transactionCount;
  const allConfirmed = attemptedAll && confirmedCount === execution.plan.transactionCount;
  const hasUnknown = results.some((result) => result.status === 'unknown');
  return {
    ok: true,
    status: allConfirmed
      ? 'confirmed'
      : confirmedCount > 0
        ? (hasUnknown ? 'partial-unknown' : 'partial-failure')
        : (hasUnknown ? 'unknown' : 'failed'),
    results,
    transactionCount: execution.plan.transactionCount,
    remainingCount: execution.plan.transactionCount - results.length,
    recipient: execution.recipient.toBase58(),
    sender: execution.owner.toBase58(),
  };
}

function safeResult(handler) {
  return async (_event, payload) => {
    try {
      return await handler(payload || {});
    } catch (error) {
      return { ok: false, message: error?.message || String(error) };
    }
  };
}

ipcMain.handle('batch:get-state', safeResult(getState));
ipcMain.handle('batch:get-balances', safeResult(async (payload) => ({
  ok: true,
  balances: await requireValidAephiaKey().then(() => refreshBalances(payload.profileId)),
})));
ipcMain.handle('batch:save-recipient', safeResult(async (payload) => ({
  ok: true,
  recipients: await saveRecipient(app.getPath('userData'), payload),
})));
ipcMain.handle('batch:save-settings', safeResult(async (payload) => {
  await savePublicConfig(app.getPath('userData'), payload);
  if (String(payload?.aephiaApiKey || '').trim()) {
    await saveAephiaKey(app.getPath('userData'), safeStorage, payload.aephiaApiKey);
  }
  aephiaValidation.checkedAt = 0;
  return getState();
}));
ipcMain.handle('batch:detect-ledgers', safeResult(async () => ({ ok: true, wallets: await detectLedgerWallets() })));
ipcMain.handle('batch:add-ledger-wallet', safeResult(addLedgerWallet));
ipcMain.handle('batch:add-hot-wallet', safeResult(addHotWallet));
ipcMain.handle('batch:remove-wallet', safeResult(deleteWallet));
ipcMain.handle('batch:preview', safeResult(async (payload) => {
  await requireValidAephiaKey();
  return previewBatch(payload);
}));
ipcMain.handle('updates:check', safeResult(checkForUpdates));
ipcMain.handle('updates:install', safeResult(installUpdate));
ipcMain.handle('batch:send', async (event, payload) => {
  const sendProgress = (message) => event.sender.send('batch:progress', { message });
  try {
    await requireValidAephiaKey();
    return await sendPreviewedBatch(payload || {}, sendProgress);
  } catch (error) {
    return { ok: false, message: error?.message || String(error) };
  }
});

app.whenReady().then(() => {
  app.setName(APP_NAME);
  installMenu();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
