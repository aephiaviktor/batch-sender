'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('batchSender', Object.freeze({
  getState: () => ipcRenderer.invoke('batch:get-state'),
  getBalances: (profileId) => ipcRenderer.invoke('batch:get-balances', { profileId }),
  saveRecipient: (payload) => ipcRenderer.invoke('batch:save-recipient', payload),
  importHotWallet: () => ipcRenderer.invoke('batch:import-hot-wallet'),
  preview: (payload) => ipcRenderer.invoke('batch:preview', payload),
  send: (previewId) => ipcRenderer.invoke('batch:send', { previewId }),
  onProgress: (handler) => {
    const wrapped = (_event, payload) => handler(payload);
    ipcRenderer.on('batch:progress', wrapped);
    return () => ipcRenderer.removeListener('batch:progress', wrapped);
  },
}));
