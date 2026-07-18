'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('batchSender', Object.freeze({
  getState: () => ipcRenderer.invoke('batch:get-state'),
  getBalances: (profileId) => ipcRenderer.invoke('batch:get-balances', { profileId }),
  saveRecipient: (payload) => ipcRenderer.invoke('batch:save-recipient', payload),
  saveSettings: (payload) => ipcRenderer.invoke('batch:save-settings', payload),
  checkForUpdates: () => ipcRenderer.invoke('updates:check'),
  installUpdate: () => ipcRenderer.invoke('updates:install'),
  detectLedgers: () => ipcRenderer.invoke('batch:detect-ledgers'),
  addLedgerWallet: (payload) => ipcRenderer.invoke('batch:add-ledger-wallet', payload),
  addHotWallet: (payload) => ipcRenderer.invoke('batch:add-hot-wallet', payload),
  removeWallet: (walletId, removeConfirmed) => ipcRenderer.invoke('batch:remove-wallet', { walletId, removeConfirmed }),
  preview: (payload) => ipcRenderer.invoke('batch:preview', payload),
  send: (previewId) => ipcRenderer.invoke('batch:send', { previewId }),
  onProgress: (handler) => {
    const wrapped = (_event, payload) => handler(payload);
    ipcRenderer.on('batch:progress', wrapped);
    return () => ipcRenderer.removeListener('batch:progress', wrapped);
  },
}));
