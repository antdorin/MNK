'use strict';

// Preload script — runs in a sandboxed renderer context.
// Exposes only the specific IPC channels the renderer needs via contextBridge.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getLocalIp: () => ipcRenderer.invoke('get-local-ip'),
  getRemoteStatus: () => ipcRenderer.invoke('get-remote-status'),
  setRemoteAutoConnect: (enabled) => ipcRenderer.invoke('set-remote-auto-connect', Boolean(enabled)),
  updateTouchMouseSettings: (settings) => ipcRenderer.invoke('update-touch-mouse-settings', settings || {}),
  onRemoteStatus: (handler) => {
    if (typeof handler !== 'function') return;
    const wrapped = (_event, payload) => handler(payload);
    ipcRenderer.on('remote-status', wrapped);
  },
  onRemoteSnooze: (handler) => {
    if (typeof handler !== 'function') return;
    const wrapped = () => handler();
    ipcRenderer.on('remote-snooze', wrapped);
  },
});
