'use strict';

const els = {
  senderGrid: document.getElementById('sender-grid'),
  senderAddress: document.getElementById('sender-address'),
  copySender: document.getElementById('copy-sender-btn'),
  importHotWallet: document.getElementById('import-hot-wallet-btn'),
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
  nonAtomicRow: document.getElementById('non-atomic-row'),
  nonAtomicConfirm: document.getElementById('non-atomic-confirm'),
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
  settingsMudAddress: document.getElementById('settings-mud-address'),
  settingsMudPath: document.getElementById('settings-mud-path'),
  settingsOniAddress: document.getElementById('settings-oni-address'),
  settingsOniPath: document.getElementById('settings-oni-path'),
  settingsUsturAddress: document.getElementById('settings-ustur-address'),
  settingsUsturPath: document.getElementById('settings-ustur-path'),
  settingsGmAddress: document.getElementById('settings-gm-address'),
};

const state = {
  profiles: [], recipients: [], balances: [], selectedProfileId: '', busy: false, configPath: '', rpcUrl: '',
  hotWallet: { configured: false, publicKey: '', protection: '' }, currentPreview: null,
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

function profileById(id) {
  return state.profiles.find((profile) => profile.id === id) || {};
}

function openSettings() {
  const mud = profileById('mud-ledger');
  const oni = profileById('oni-ledger');
  const ustur = profileById('ustur-ledger');
  const gm = profileById('gm-hot-wallet');
  els.settingsRpc.value = state.rpcUrl || '';
  els.settingsMudAddress.value = mud.address || '';
  els.settingsMudPath.value = mud.derivationPath || "44'/501'/0'";
  els.settingsOniAddress.value = oni.address || '';
  els.settingsOniPath.value = oni.derivationPath || "44'/501'/0'";
  els.settingsUsturAddress.value = ustur.address || '';
  els.settingsUsturPath.value = ustur.derivationPath || "44'/501'/0'";
  els.settingsGmAddress.value = gm.address || '';
  els.settingsMessage.hidden = true;
  els.settingsMessage.classList.remove('error');
  els.settingsModal.hidden = false;
}

async function saveSettings() {
  if (state.busy) return;
  state.busy = true;
  els.saveSettings.disabled = true;
  els.closeSettings.disabled = true;
  els.cancelSettings.disabled = true;
  els.settingsMessage.hidden = false;
  els.settingsMessage.classList.remove('error');
  els.settingsMessage.textContent = 'Validating and saving settings…';
  const result = await window.batchSender.saveSettings({
    rpcUrl: els.settingsRpc.value,
    profiles: {
      'mud-ledger': { address: els.settingsMudAddress.value, derivationPath: els.settingsMudPath.value },
      'oni-ledger': { address: els.settingsOniAddress.value, derivationPath: els.settingsOniPath.value },
      'ustur-ledger': { address: els.settingsUsturAddress.value, derivationPath: els.settingsUsturPath.value },
      'gm-hot-wallet': { address: els.settingsGmAddress.value },
    },
  });
  state.busy = false;
  els.saveSettings.disabled = false;
  els.closeSettings.disabled = false;
  els.cancelSettings.disabled = false;
  if (!result?.ok) {
    els.settingsMessage.classList.add('error');
    els.settingsMessage.textContent = result?.message || 'Settings could not be saved.';
    return;
  }
  state.profiles = result.profiles || [];
  state.rpcUrl = result.rpcUrl || '';
  state.hotWallet = result.hotWallet || state.hotWallet;
  state.configPath = result.configPath || state.configPath;
  els.settingsModal.hidden = true;
  state.balances = [];
  renderProfiles();
  renderBalances();
  els.status.textContent = 'Wallet settings saved locally.';
  await loadBalances();
}

function renderProfiles() {
  els.senderGrid.replaceChildren();
  for (const profile of state.profiles) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `sender-card${profile.id === state.selectedProfileId ? ' selected' : ''}`;
    const title = document.createElement('strong');
    title.textContent = profile.name;
    const detail = document.createElement('span');
    const hotSignerReady = profile.kind !== 'hot-wallet'
      || (state.hotWallet.configured && state.hotWallet.publicKey === profile.address);
    detail.className = profile.configured && hotSignerReady ? 'ready' : '';
    detail.textContent = !profile.configured
      ? 'Configuration needed'
      : profile.kind === 'ledger'
        ? 'Hardware wallet · Ready'
        : hotSignerReady
          ? `${state.hotWallet.protection || 'Protected signer'} · Ready`
          : 'Address ready · Signing key needed';
    button.append(title, detail);
    button.addEventListener('click', () => selectProfile(profile.id));
    els.senderGrid.appendChild(button);
  }
  const profile = selectedProfile();
  els.senderAddress.textContent = profile?.address ? shortKey(profile.address) : 'Not configured';
  els.senderAddress.title = profile?.address || '';
  els.copySender.disabled = !profile?.address;
  els.importHotWallet.hidden = profile?.kind !== 'hot-wallet';
  els.importHotWallet.disabled = !profile?.configured || state.busy;
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
    els.configMessage.textContent = 'Open Wallet settings to add this profile’s public address and the Solana RPC URL.';
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

  const signerReady = result.sender.kind === 'ledger'
    || (state.hotWallet.configured && state.hotWallet.publicKey === result.sender.address);
  els.previewNotice.classList.toggle('error', !result.plan.hasEnoughSol || !result.plan.isAtomic || !signerReady);
  els.previewNotice.textContent = !signerReady
    ? 'The protected GM hot-wallet signing key must be imported before sending.'
    : result.plan.hasEnoughSol
      ? result.notice
      : `Insufficient SOL for the estimated ${formatSol(result.plan.estimatedTotalLamports)} cost. ${result.notice}`;
  els.nonAtomicRow.hidden = result.plan.isAtomic;
  els.nonAtomicConfirm.checked = false;
  els.confirmSend.hidden = false;
  els.confirmSend.textContent = 'Confirm & send';
  els.confirmSend.disabled = !signerReady || !result.plan.hasEnoughSol || !result.plan.isAtomic;
  els.cancelPreview.textContent = 'Back';
  els.modal.hidden = false;
}

function renderSendResult(result) {
  els.previewContent.replaceChildren();
  const heading = document.createElement('h3');
  heading.textContent = result.status === 'confirmed' ? 'Batch confirmed' : 'Batch needs attention';
  heading.className = result.status === 'confirmed' ? 'result-confirmed' : 'result-failed';
  els.previewContent.appendChild(heading);
  appendReviewRows(els.previewContent, 'Transaction results', result.results.map((row) => [
    `Transaction ${row.index}: ${row.status}`,
    row.signature || row.message,
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
  els.nonAtomicRow.hidden = true;
  els.confirmSend.hidden = true;
  els.cancelPreview.textContent = 'Close';
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
  state.profiles = result.profiles || [];
  state.recipients = result.recipients || [];
  state.configPath = result.configPath || '';
  state.rpcUrl = result.rpcUrl || '';
  state.hotWallet = result.hotWallet || state.hotWallet;
  state.selectedProfileId = state.profiles[0]?.id || '';
  renderProfiles();
  renderRecipients();
  await loadBalances();
}

els.refresh.addEventListener('click', loadBalances);
els.settingsButton.addEventListener('click', openSettings);
els.saveSettings.addEventListener('click', saveSettings);
for (const button of [els.closeSettings, els.cancelSettings]) button.addEventListener('click', () => {
  if (!state.busy) els.settingsModal.hidden = true;
});
els.copySender.addEventListener('click', async () => { const value = selectedProfile()?.address; if (value) await navigator.clipboard.writeText(value); });
els.importHotWallet.addEventListener('click', async () => {
  state.busy = true;
  els.status.textContent = 'Waiting for protected key-file selection…';
  renderProfiles();
  updateActions();
  const result = await window.batchSender.importHotWallet();
  state.busy = false;
  if (!result?.ok) {
    els.status.textContent = result?.message || 'Hot-wallet key import failed.';
  } else if (result.canceled) {
    els.status.textContent = 'Hot-wallet key import canceled.';
  } else {
    state.hotWallet = result;
    els.status.textContent = `GM signing key protected with ${result.protection}.`;
  }
  renderProfiles();
  updateActions();
});
els.recipientSelect.addEventListener('change', () => { if (els.recipientSelect.value) els.recipient.value = els.recipientSelect.value; updateActions(); });
els.recipient.addEventListener('input', updateActions);
els.saveRecipient.addEventListener('change', () => { els.recipientLabel.hidden = !els.saveRecipient.checked; updateActions(); });
els.recipientLabel.addEventListener('input', updateActions);
els.search.addEventListener('input', renderBalances);
els.clear.addEventListener('click', () => { els.tokenRows.querySelectorAll('input[data-key]').forEach((input) => { input.value = ''; }); updateActions(); });
els.preview.addEventListener('click', preview);
els.nonAtomicConfirm.addEventListener('change', () => {
  const previewResult = state.currentPreview;
  if (!previewResult) return;
  const signerReady = previewResult.sender.kind === 'ledger'
    || (state.hotWallet.configured && state.hotWallet.publicKey === previewResult.sender.address);
  els.confirmSend.disabled = !els.nonAtomicConfirm.checked || !previewResult.plan.hasEnoughSol || !signerReady;
});
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
