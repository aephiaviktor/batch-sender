'use strict';

const els = {
  senderGrid: document.getElementById('sender-grid'),
  senderAddress: document.getElementById('sender-address'),
  copySender: document.getElementById('copy-sender-btn'),
  configMessage: document.getElementById('config-message'),
  refresh: document.getElementById('refresh-btn'),
  recipientSelect: document.getElementById('recipient-select'),
  recipient: document.getElementById('recipient-input'),
  saveRecipient: document.getElementById('save-recipient-check'),
  recipientLabel: document.getElementById('recipient-label'),
  search: document.getElementById('search-input'),
  clear: document.getElementById('clear-btn'),
  tokenRows: document.getElementById('token-rows'),
  status: document.getElementById('status-message'),
  preview: document.getElementById('preview-btn'),
  modal: document.getElementById('preview-modal'),
  previewContent: document.getElementById('preview-content'),
  previewNotice: document.getElementById('preview-notice'),
  confirmSend: document.getElementById('confirm-send-btn'),
  closePreview: document.getElementById('close-preview-btn'),
  cancelPreview: document.getElementById('cancel-preview-btn'),
  settingsButton: document.getElementById('settings-btn'),
  settingsModal: document.getElementById('settings-modal'),
  closeSettings: document.getElementById('close-settings-btn'),
  cancelSettings: document.getElementById('cancel-settings-btn'),
  saveSettings: document.getElementById('save-settings-btn'),
  settingsMessage: document.getElementById('settings-message'),
  settingsRpc: document.getElementById('settings-rpc'),
  settingsAephiaKey: document.getElementById('settings-aephia-key'),
  removeWallet: document.getElementById('remove-wallet-btn'),
  walletModal: document.getElementById('wallet-modal'),
  closeWallet: document.getElementById('close-wallet-btn'),
  chooseLedger: document.getElementById('choose-ledger-btn'),
  chooseHot: document.getElementById('choose-hot-btn'),
  walletTypeRow: document.getElementById('wallet-type-row'),
  walletForm: document.getElementById('wallet-form'),
  walletName: document.getElementById('wallet-name'),
  walletSecretKey: document.getElementById('wallet-secret-key'),
  ledgerFields: document.getElementById('ledger-fields'),
  hotFields: document.getElementById('hot-fields'),
  walletMessage: document.getElementById('wallet-message'),
  walletBack: document.getElementById('wallet-back-btn'),
  addWalletConfirm: document.getElementById('add-wallet-confirm-btn'),
  settingsGrid: document.getElementById('settings-grid'),
  toggleSensitive: document.getElementById('toggle-sensitive-btn'),
  updateButton: document.getElementById('update-btn'),
  appVersion: document.getElementById('app-version'),
  updateModal: document.getElementById('update-modal'),
  updateMessage: document.getElementById('update-message'),
  closeUpdate: document.getElementById('close-update-btn'),
  cancelUpdate: document.getElementById('cancel-update-btn'),
  installUpdate: document.getElementById('install-update-btn'),
};

const state = {
  profiles: [], recipients: [], balances: [], selectedProfileId: '', busy: false, configPath: '', rpcUrl: '',
  hotWallets: {}, currentPreview: null, walletKind: '',
  aephia: { configured: false, valid: false, message: 'Aephia API key is required.' },
};

function shortKey(value) {
  const text = String(value || '');
  return text.length > 16 ? `${text.slice(0, 7)}…${text.slice(-7)}` : text;
}

function formatAmount(value) {
  const text = String(value || '').replace(/,/g, '');
  if (!/^\d*(\.\d*)?$/.test(text)) return value;
  const [whole = '', fraction] = text.split('.');
  const grouped = whole.replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return fraction === undefined ? grouped : `${grouped}.${fraction}`;
}

function selectedProfile() {
  return state.profiles.find((profile) => profile.id === state.selectedProfileId) || null;
}

function openSettings() {
  els.settingsRpc.value = state.rpcUrl || '';
  els.settingsAephiaKey.value = '';
  els.settingsAephiaKey.placeholder = state.aephia.configured
    ? 'Leave blank to keep the saved key'
    : 'Enter your Aephia API key';
  els.settingsMessage.hidden = true;
  els.settingsMessage.classList.remove('error');
  setSensitiveVisible(false);
  els.settingsModal.hidden = false;
}

function setSensitiveVisible(visible) {
  els.settingsGrid.classList.toggle('sensitive-hidden', !visible);
  els.settingsAephiaKey.type = visible ? 'text' : 'password';
  els.settingsRpc.type = visible ? 'url' : 'password';
  els.toggleSensitive.textContent = visible ? 'Hide sensitive' : 'Show sensitive';
  els.toggleSensitive.dataset.visible = String(visible);
}

function renderAuthGate() {
  const locked = !state.aephia.valid;
  document.querySelector('.shell').classList.toggle('locked', locked);
  els.settingsButton.disabled = false;
  els.updateButton.disabled = locked;
  els.closeSettings.hidden = locked;
  els.cancelSettings.hidden = locked;
  if (locked) {
    openSettings();
    els.settingsMessage.hidden = false;
    els.settingsMessage.classList.add('error');
    els.settingsMessage.textContent = state.aephia.message || 'Enter a valid Aephia API key to unlock Batch Sender.';
  }
}

async function saveSettings() {
  if (state.busy) return;
  state.busy = true;
  els.saveSettings.disabled = true;
  els.settingsMessage.hidden = false;
  els.settingsMessage.classList.remove('error');
  els.settingsMessage.textContent = 'Validating and saving settings…';
  const result = await window.batchSender.saveSettings({ rpcUrl: els.settingsRpc.value, aephiaApiKey: els.settingsAephiaKey.value });
  state.busy = false;
  els.saveSettings.disabled = false;
  els.settingsAephiaKey.value = '';
  if (!result?.ok) {
    els.settingsMessage.classList.add('error');
    els.settingsMessage.textContent = result?.message || 'Settings could not be saved.';
    return;
  }
  applyState(result);
  renderAuthGate();
  if (state.aephia.valid) els.settingsModal.hidden = true;
  renderProfiles();
  renderBalances();
  els.status.textContent = 'Wallet settings saved locally.';
  if (selectedProfile()) await loadBalances();
}

function applyState(result) {
  state.profiles = result.profiles || [];
  state.hotWallets = result.hotWallets || {};
  state.rpcUrl = result.rpcUrl || '';
  state.aephia = result.aephia || state.aephia;
  state.configPath = result.configPath || state.configPath;
  if (!state.profiles.some((row) => row.id === state.selectedProfileId)) state.selectedProfileId = state.profiles[0]?.id || '';
}

function openWalletModal() {
  state.walletKind = '';
  els.walletTypeRow.hidden = false;
  els.walletForm.hidden = true;
  els.walletBack.hidden = true;
  els.addWalletConfirm.hidden = true;
  els.walletMessage.hidden = true;
  els.walletName.value = '';
  els.walletSecretKey.value = '';
  els.walletModal.hidden = false;
}

function chooseWalletKind(kind) {
  state.walletKind = kind;
  els.walletTypeRow.hidden = true;
  els.walletForm.hidden = false;
  els.walletBack.hidden = false;
  els.addWalletConfirm.hidden = false;
  els.ledgerFields.hidden = kind !== 'ledger';
  els.hotFields.hidden = kind !== 'hot-wallet';
  els.addWalletConfirm.textContent = kind === 'ledger' ? 'Detect & add Ledger' : 'Add hot wallet';
}

async function addSelectedWallet() {
  if (state.busy) return;
  const name = els.walletName.value.trim();
  if (!name) { els.walletMessage.hidden = false; els.walletMessage.classList.add('error'); els.walletMessage.textContent = 'Enter a wallet name.'; return; }
  state.busy = true; els.addWalletConfirm.disabled = true; els.closeWallet.disabled = true;
  els.walletMessage.hidden = false; els.walletMessage.classList.remove('error');
  els.walletMessage.textContent = state.walletKind === 'ledger' ? 'Looking for connected Ledger devices…' : 'Deriving the public address and protecting the secret key…';
  const result = state.walletKind === 'ledger'
    ? await window.batchSender.addLedgerWallet({ name })
    : await window.batchSender.addHotWallet({ name, secretKey: els.walletSecretKey.value });
  state.busy = false; els.addWalletConfirm.disabled = false; els.closeWallet.disabled = false;
  if (!result?.ok) { els.walletMessage.classList.add('error'); els.walletMessage.textContent = result?.message || 'Wallet could not be added.'; return; }
  applyState(result); els.walletSecretKey.value = ''; els.walletModal.hidden = true;
  renderProfiles(); renderBalances(); await loadBalances();
}

function renderProfiles() {
  els.senderGrid.replaceChildren();
  for (const profile of state.profiles) {
    const button = document.createElement('button'); button.type = 'button';
    button.className = `sender-card${profile.id === state.selectedProfileId ? ' selected' : ''}`;
    const title = document.createElement('strong'); title.textContent = profile.name;
    const detail = document.createElement('span'); detail.className = profile.configured && profile.signerReady ? 'ready' : '';
    detail.textContent = profile.kind === 'ledger' ? 'Hardware wallet · Ready' : `${profile.protection || 'Secure storage'} · Ready`;
    button.append(title, detail); button.addEventListener('click', () => selectProfile(profile.id)); els.senderGrid.appendChild(button);
  }
  const add = document.createElement('button'); add.type = 'button'; add.className = 'sender-card add-wallet-card';
  add.innerHTML = '<strong>+ Add wallet</strong><span>Hardware or hot wallet</span>'; add.addEventListener('click', openWalletModal); els.senderGrid.appendChild(add);
  const profile = selectedProfile();
  els.senderAddress.textContent = profile?.address ? shortKey(profile.address) : 'No wallet selected';
  els.senderAddress.title = profile?.address || ''; els.copySender.disabled = !profile?.address; els.removeWallet.disabled = !profile;
}

function renderRecipients() {
  els.recipientSelect.innerHTML = '<option value="">Choose saved recipient</option>';
  for (const recipient of state.recipients) {
    const option = document.createElement('option');
    option.value = recipient.address;
    option.textContent = recipient.name;
    option.title = recipient.address;
    els.recipientSelect.appendChild(option);
  }
}

function transferRows() {
  return Array.from(els.tokenRows.querySelectorAll('input[data-key]')).flatMap((input) => {
    const amount = String(input.value || '').trim();
    return amount ? [{ key: input.dataset.key, amount }] : [];
  });
}

function updateActions() {
  const profile = selectedProfile();
  const ready = Boolean(profile?.configured && els.recipient.value.trim() && transferRows().length && !state.busy);
  els.preview.disabled = !ready;
  els.refresh.disabled = !profile?.configured || state.busy;
  if (!profile?.configured) els.status.textContent = 'Select and configure a sender profile.';
  else if (!state.balances.length) els.status.textContent = 'No eligible positive token balances found.';
  else if (!transferRows().length) els.status.textContent = 'Enter one or more token amounts.';
  else els.status.textContent = `${transferRows().length} token row${transferRows().length === 1 ? '' : 's'} selected.`;
}

function renderBalances() {
  els.tokenRows.replaceChildren();
  const query = els.search.value.trim().toLowerCase();
  const visible = state.balances.filter((row) => row.name.toLowerCase().includes(query));
  if (!visible.length) {
    const row = document.createElement('tr');
    row.innerHTML = `<td colspan="3" class="empty">${state.balances.length ? 'No tokens match the filter.' : 'No eligible positive balances found.'}</td>`;
    els.tokenRows.appendChild(row);
    updateActions();
    return;
  }

  let lastGroup = '';
  for (const balance of visible) {
    if (balance.group !== lastGroup) {
      lastGroup = balance.group;
      const groupRow = document.createElement('tr');
      groupRow.className = 'group-row';
      const cell = document.createElement('td');
      cell.colSpan = 3;
      cell.textContent = balance.group === 'raw' ? 'Raw materials' : 'Components';
      groupRow.appendChild(cell);
      els.tokenRows.appendChild(groupRow);
    }
    const row = document.createElement('tr');
    const nameCell = document.createElement('td');
    nameCell.className = 'token-name';
    const name = document.createElement('strong');
    name.textContent = balance.name;
    const mint = document.createElement('span');
    mint.textContent = shortKey(balance.mint);
    mint.title = balance.mint;
    nameCell.append(name, mint);
    const available = document.createElement('td');
    available.textContent = formatAmount(balance.uiAmount);
    const amountCell = document.createElement('td');
    const wrap = document.createElement('div');
    wrap.className = 'amount-wrap';
    const input = document.createElement('input');
    input.type = 'text';
    input.inputMode = 'decimal';
    input.placeholder = '0';
    input.dataset.key = balance.key;
    input.addEventListener('input', () => { input.value = formatAmount(input.value); updateActions(); });
    const max = document.createElement('button');
    max.type = 'button';
    max.className = 'button secondary';
    max.textContent = 'MAX';
    max.addEventListener('click', () => { input.value = formatAmount(balance.uiAmount); updateActions(); });
    wrap.append(input, max);
    amountCell.appendChild(wrap);
    row.append(nameCell, available, amountCell);
    els.tokenRows.appendChild(row);
  }
  updateActions();
}

async function loadBalances() {
  const profile = selectedProfile();
  if (!profile?.configured) {
    state.balances = [];
    renderBalances();
    els.configMessage.hidden = false;
    els.configMessage.textContent = 'Open Wallet settings and configure the Solana RPC URL before loading balances.';
    return;
  }
  els.configMessage.hidden = true;
  state.busy = true;
  els.status.textContent = `Loading ${profile.name} balances…`;
  updateActions();
  const result = await window.batchSender.getBalances(profile.id);
  state.busy = false;
  if (!result?.ok) {
    state.balances = [];
    els.status.textContent = result?.message || 'Balance refresh failed.';
  } else {
    state.balances = result.balances || [];
    els.status.textContent = `Loaded ${state.balances.length} eligible balance${state.balances.length === 1 ? '' : 's'}.`;
  }
  renderBalances();
}

async function selectProfile(profileId) {
  state.selectedProfileId = profileId;
  state.balances = [];
  renderProfiles();
  renderBalances();
  await loadBalances();
}

function formatSol(lamports) {
  const value = Number(lamports || 0) / 1_000_000_000;
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 9 })} SOL`;
}

function appendReviewRows(container, title, entries) {
  const heading = document.createElement('h3');
  heading.textContent = title;
  container.appendChild(heading);
  const rows = document.createElement('div');
  rows.className = 'review-table';
  for (const [label, value] of entries) {
    const row = document.createElement('div');
    row.className = 'review-row';
    const name = document.createElement('strong'); name.textContent = label;
    const detail = document.createElement('span'); detail.textContent = value;
    row.append(name, detail); rows.appendChild(row);
  }
  container.appendChild(rows);
}

function showPreview(result) {
  els.previewContent.replaceChildren();
  const details = document.createElement('dl');
  details.className = 'review-grid';
  for (const [label, value] of [
    ['Sender', result.sender.name],
    ['Sender address', result.sender.address],
    ['Recipient', result.recipient],
    ['Fee payer', result.feePayer],
    ['Transactions', String(result.plan.transactionCount)],
    ['Instructions', String(result.plan.instructionCount)],
    ['Estimated cost', formatSol(result.plan.estimatedTotalLamports)],
  ]) {
    const dt = document.createElement('dt'); dt.textContent = label;
    const dd = document.createElement('dd'); dd.textContent = value;
    details.append(dt, dd);
  }
  els.previewContent.appendChild(details);

  appendReviewRows(els.previewContent, 'Transfers', result.transfers.map((transfer) => [
    transfer.name,
    formatAmount(transfer.displayAmount),
  ]));

  appendReviewRows(
    els.previewContent,
    'Recipient token accounts',
    result.plan.ataCreations.length
      ? result.plan.ataCreations.map((ata) => [ata.token, `Create ${shortKey(ata.address)}`])
      : [['All recipient ATAs', 'Already exist']],
  );

  if (result.plan.transactionCount > 1) {
    appendReviewRows(els.previewContent, 'Transaction chunks', result.plan.chunks.map((chunk) => [
      `Transaction ${chunk.index}`,
      `${chunk.tokens.join(', ')} · ${chunk.sizeBytes} bytes`,
    ]));
  }

  const signerReady = result.sender.kind === 'ledger' || Boolean(state.hotWallets[result.sender.id]?.configured);
  els.previewNotice.classList.toggle('error', !result.plan.hasEnoughSol || !signerReady);
  els.previewNotice.textContent = !signerReady
    ? 'The selected hot wallet has no protected secret key.'
    : result.plan.hasEnoughSol
      ? result.notice
      : `Insufficient SOL for the estimated ${formatSol(result.plan.estimatedTotalLamports)} cost. ${result.notice}`;
  els.confirmSend.hidden = false;
  els.confirmSend.textContent = 'Confirm & send';
  els.confirmSend.disabled = !signerReady || !result.plan.hasEnoughSol;
  els.cancelPreview.hidden = false;
  els.cancelPreview.textContent = 'Back';
  els.modal.hidden = false;
}

function renderSendResult(result) {
  els.previewContent.replaceChildren();
  const heading = document.createElement('h3');
  heading.textContent = result.status === 'confirmed' ? 'Batch confirmed' : 'Batch needs attention';
  heading.className = result.status === 'confirmed' ? 'result-confirmed' : 'result-failed';
  els.previewContent.appendChild(heading);
  appendReviewRows(els.previewContent, 'Transaction results', result.results.flatMap((row) => [
    [`Transaction ${row.index}: ${row.status}`, row.signature || 'No signature'],
    [`Transaction ${row.index} details`, row.message || 'No additional details'],
  ]));
  if (result.remainingCount) {
    const remaining = document.createElement('p');
    remaining.className = 'notice error';
    remaining.textContent = `${result.remainingCount} later transaction${result.remainingCount === 1 ? '' : 's'} were not sent.`;
    els.previewContent.appendChild(remaining);
  }
  els.previewNotice.classList.toggle('error', result.status !== 'confirmed');
  els.previewNotice.textContent = result.status === 'confirmed'
    ? 'Every transaction in the batch is confirmed.'
    : 'Review each signature and status carefully. Unknown does not mean failed; it means RPC confirmation could not be established.';
  els.confirmSend.hidden = true;
  els.cancelPreview.hidden = true;
}

async function sendPreviewedBatch() {
  if (!state.currentPreview?.previewId || state.busy) return;
  state.busy = true;
  els.confirmSend.disabled = true;
  els.cancelPreview.disabled = true;
  els.closePreview.disabled = true;
  els.previewNotice.textContent = 'Preparing the approved batch…';
  const result = await window.batchSender.send(state.currentPreview.previewId);
  state.busy = false;
  els.cancelPreview.disabled = false;
  els.closePreview.disabled = false;
  if (!result?.ok) {
    els.previewNotice.classList.add('error');
    els.previewNotice.textContent = result?.message || 'Batch send failed before a result was returned.';
    els.confirmSend.disabled = true;
    els.status.textContent = 'Batch was not sent. Preview again before retrying.';
    return;
  }
  renderSendResult(result);
  els.status.textContent = result.status === 'confirmed' ? 'Batch confirmed.' : 'Batch completed with an issue.';
  if (result.results.some((row) => row.status === 'confirmed')) await loadBalances();
}

async function preview() {
  state.busy = true;
  els.status.textContent = 'Re-checking balances and validating the batch…';
  updateActions();
  const result = await window.batchSender.preview({
    profileId: state.selectedProfileId,
    recipient: els.recipient.value.trim(),
    transfers: transferRows(),
  });
  state.busy = false;
  if (!result?.ok) {
    els.status.textContent = result?.message || 'Preview failed.';
    updateActions();
    return;
  }
  if (els.saveRecipient.checked && els.recipientLabel.value.trim()) {
    const saved = await window.batchSender.saveRecipient({ name: els.recipientLabel.value, address: els.recipient.value });
    if (saved?.ok) { state.recipients = saved.recipients; renderRecipients(); }
  }
  state.currentPreview = result;
  showPreview(result);
  els.status.textContent = 'Batch validation passed.';
  updateActions();
}

async function initialize() {
  const result = await window.batchSender.getState();
  if (!result?.ok) { els.status.textContent = result?.message || 'App initialization failed.'; return; }
  els.appVersion.textContent = result.version ? `v${result.version}` : 'v?';
  applyState(result);
  state.recipients = result.recipients || [];
  renderProfiles();
  renderRecipients();
  renderAuthGate();
  if (!state.aephia.valid) { renderBalances(); updateActions(); return; }
  await loadBalances();
}

async function openUpdate() {
  els.updateModal.hidden = false;
  els.updateMessage.classList.remove('error');
  els.updateMessage.textContent = 'Checking the public GitHub repository…';
  els.installUpdate.disabled = true;
  const result = await window.batchSender.checkForUpdates();
  if (!result?.ok) {
    els.updateMessage.classList.add('error');
    els.updateMessage.textContent = result?.message || 'Update check failed.';
    return;
  }
  els.updateMessage.textContent = result.updateAvailable
    ? `Update available (v${result.current} → v${result.latest}).`
    : `Batch Sender is current (v${result.current}).`;
  els.installUpdate.disabled = !result.updateAvailable;
}

async function installUpdate() {
  els.installUpdate.disabled = true;
  els.closeUpdate.disabled = true;
  els.cancelUpdate.disabled = true;
  els.updateMessage.textContent = 'Downloading from GitHub and installing dependencies…';
  const result = await window.batchSender.installUpdate();
  if (!result?.ok) {
    els.updateMessage.classList.add('error');
    els.updateMessage.textContent = result?.message || 'Update failed.';
    els.closeUpdate.disabled = false;
    els.cancelUpdate.disabled = false;
  } else {
    els.updateMessage.textContent = 'Update installed. Restarting Batch Sender…';
  }
}

els.refresh.addEventListener('click', loadBalances);
els.settingsButton.addEventListener('click', openSettings);
els.toggleSensitive.addEventListener('click', () => setSensitiveVisible(els.toggleSensitive.dataset.visible !== 'true'));
els.updateButton.addEventListener('click', openUpdate);
els.installUpdate.addEventListener('click', installUpdate);
for (const button of [els.closeUpdate, els.cancelUpdate]) button.addEventListener('click', () => {
  if (!button.disabled) els.updateModal.hidden = true;
});
els.saveSettings.addEventListener('click', saveSettings);
for (const button of [els.closeSettings, els.cancelSettings]) button.addEventListener('click', () => {
  if (!state.busy) els.settingsModal.hidden = true;
});
els.copySender.addEventListener('click', async () => { const value = selectedProfile()?.address; if (value) await navigator.clipboard.writeText(value); });
els.removeWallet.addEventListener('click', async () => {
  const wallet = selectedProfile();
  if (!wallet || state.busy || !window.confirm(`Remove ${wallet.name}?${wallet.kind === 'hot-wallet' ? ' Its encrypted secret key will also be deleted.' : ''}`)) return;
  const result = await window.batchSender.removeWallet(wallet.id, true);
  if (!result?.ok) { els.status.textContent = result?.message || 'Wallet could not be removed.'; return; }
  applyState(result); state.balances = []; renderProfiles(); renderBalances(); updateActions();
});
els.chooseLedger.addEventListener('click', () => chooseWalletKind('ledger'));
els.chooseHot.addEventListener('click', () => chooseWalletKind('hot-wallet'));
els.walletBack.addEventListener('click', openWalletModal);
els.addWalletConfirm.addEventListener('click', addSelectedWallet);
els.closeWallet.addEventListener('click', () => { if (!state.busy) els.walletModal.hidden = true; });
els.recipientSelect.addEventListener('change', () => {
  if (els.recipientSelect.value) {
    els.recipient.value = els.recipientSelect.value;
    els.saveRecipient.checked = false;
    els.recipientLabel.value = '';
    els.recipientLabel.hidden = true;
  }
  updateActions();
});
els.recipient.addEventListener('input', updateActions);
els.saveRecipient.addEventListener('change', () => { els.recipientLabel.hidden = !els.saveRecipient.checked; updateActions(); });
els.recipientLabel.addEventListener('input', updateActions);
els.search.addEventListener('input', renderBalances);
els.clear.addEventListener('click', () => { els.tokenRows.querySelectorAll('input[data-key]').forEach((input) => { input.value = ''; }); updateActions(); });
els.preview.addEventListener('click', preview);
els.confirmSend.addEventListener('click', sendPreviewedBatch);
for (const button of [els.closePreview, els.cancelPreview]) button.addEventListener('click', () => {
  if (!state.busy) els.modal.hidden = true;
});
window.batchSender.onProgress((payload) => {
  if (!state.busy || !payload?.message) return;
  els.previewNotice.textContent = payload.message;
  els.status.textContent = payload.message;
});

initialize().catch((error) => { els.status.textContent = error?.message || String(error); });
