'use strict';

const { createHash, randomUUID } = require('node:crypto');
const { execFile } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const { promisify } = require('node:util');
const bs58 = require('bs58');
const { app, BrowserWindow, dialog, ipcMain, Menu, safeStorage } = require('electron');
const { PublicKey, Transaction } = require('@solana/web3.js');
const { createConnection, getEligibleBalances } = require('../lib/balances');
const { readAephiaKey, saveAephiaKey, validateAephiaKey } = require('../lib/aephia-auth');
const { parseTokenAmount, formatBaseUnits } = require('../lib/amounts');
const { getHotWalletStatus, importHotWallet, loadHotWallet } = require('../lib/hot-wallet-store');
const { signTransactionWithLedger } = require('../lib/ledger-signer');
const { loadPublicConfig, loadRecipients, savePublicConfig, saveRecipient } = require('../lib/local-store');
const { planBatchTransactions } = require('../lib/planner');
const { SENDER_PROFILES, getSenderProfile } = require('../lib/profiles');

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

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 820,
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

function publicProfileState(config) {
  return SENDER_PROFILES.map((profile) => {
    const stored = config.profiles?.[profile.id] || {};
    let address = '';
    try {
      address = new PublicKey(String(stored.address || '').trim()).toBase58();
    } catch {
      address = '';
    }
    return {
      ...profile,
      address,
      configured: Boolean(address && config.rpcUrl),
      derivationPath: profile.kind === 'ledger' ? String(stored.derivationPath || '').trim() : '',
    };
  });
}

async function getState() {
  const userDataPath = app.getPath('userData');
  const config = await loadPublicConfig(userDataPath);
  const aephia = await getAephiaStatus();
  return {
    ok: true,
    profiles: publicProfileState(config),
    recipients: await loadRecipients(userDataPath),
    hotWallet: await getHotWalletStatus(userDataPath),
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
    aephiaValidation = { configured: true, valid: true, protection: 'Windows DPAPI', checkedAt: Date.now(), message: '' };
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

async function runRepoCommand(command, args) {
  const executable = process.platform === 'win32' && command === 'npm' ? 'npm.cmd' : command;
  const result = await execFileAsync(executable, args, { cwd: APP_ROOT, windowsHide: true, timeout: 120000 });
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
  const dirty = await runRepoCommand('git', ['status', '--porcelain']);
  if (dirty) throw new Error('Update stopped because the Batch Sender folder has local changes.');
  await runRepoCommand('git', ['pull', '--ff-only', 'origin', 'main']);
  await runRepoCommand('npm', ['ci']);
  setImmediate(() => { app.relaunch(); app.exit(0); });
  return { ok: true, restarting: true };
}

async function chooseAndImportHotWallet() {
  const userDataPath = app.getPath('userData');
  const config = await loadPublicConfig(userDataPath);
  let expectedPublicKey = '';
  try {
    expectedPublicKey = new PublicKey(String(config.profiles?.['gm-hot-wallet']?.address || '').trim()).toBase58();
  } catch {
    throw new Error('Configure the GM hot-wallet public address before importing its signing key.');
  }

  const selection = await dialog.showOpenDialog(mainWindow, {
    title: 'Import GM Market Bot signing key',
    properties: ['openFile'],
    filters: [{ name: 'Keypair files', extensions: ['json', 'txt', 'key'] }, { name: 'All files', extensions: ['*'] }],
  });
  if (selection.canceled || !selection.filePaths[0]) return { ok: true, canceled: true };
  const selectedPath = selection.filePaths[0];
  const stat = await fs.stat(selectedPath);
  if (!stat.isFile() || stat.size > 64 * 1024) throw new Error('Selected key file is not a valid small keypair file.');
  const rawSecret = await fs.readFile(selectedPath, 'utf8');
  return { ok: true, ...(await importHotWallet(userDataPath, safeStorage, rawSecret, expectedPublicKey)) };
}

async function getProfileContext(profileId) {
  const profile = getSenderProfile(String(profileId || ''));
  if (!profile) throw new Error('Unknown sender profile.');
  const config = await loadPublicConfig(app.getPath('userData'));
  const stored = config.profiles?.[profile.id] || {};
  let owner;
  try {
    owner = new PublicKey(String(stored.address || '').trim());
  } catch {
    throw new Error(`${profile.name} public address is not configured.`);
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
    );
    return { transaction: signed.transaction, ledgerPath: signed.ledgerPath };
  }

  onProgress('Loading the protected GM hot-wallet signer…');
  const signer = await loadHotWallet(app.getPath('userData'), safeStorage, execution.owner.toBase58());
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

  const profileConfig = execution.config.profiles?.[execution.profile.id] || {};
  let ledgerPath = String(profileConfig.derivationPath || '').trim();
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
      const status = await querySignature(execution.connection, expectedSignature);
      const landed = status && !status.err;
      results.push({
        index: chunkNumber,
        status: landed && ['confirmed', 'finalized'].includes(status.confirmationStatus) ? 'confirmed' : 'unknown',
        signature: expectedSignature,
        tokens: groups.map((group) => group.name),
        message: landed
          ? `Transaction landed despite the broadcast error: ${error?.message || String(error)}`
          : `Broadcast outcome is unknown: ${error?.message || String(error)}`,
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
ipcMain.handle('batch:import-hot-wallet', safeResult(chooseAndImportHotWallet));
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
