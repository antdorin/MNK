'use strict';

const { app, BrowserWindow, Tray, Menu, session, ipcMain } = require('electron');
const path   = require('path');
const os     = require('os');
const fs     = require('fs');

// Set userData to a guaranteed-writable path before anything else runs.
// This prevents Chromium cache/quota errors when the default path is restricted.
app.setPath('userData', path.join(os.homedir(), 'AppData', 'Roaming', 'AlarmClockApp'));

// Disable GPU shader disk cache — not needed for an alarm clock app,
// and avoids "Unable to move the cache / Access is denied" Chromium errors.
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');

// Clear any stale Chromium cache directories that may be holding locks.
// Runs synchronously before app.whenReady() so the locks are gone before
// Chromium tries to re-create them.
(function clearStaleCache() {
  const userData = app.getPath('userData');
  const staleDirs = ['GPUCache', 'ShaderCache', 'GrShaderCache', 'Cache'];
  for (const dir of staleDirs) {
    const target = path.join(userData, dir);
    try {
      if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true });
    } catch (_) { /* ignore — Chromium will recreate as needed */ }
  }
  // Remove corrupt quota database files so Chromium can recreate them cleanly.
  const staleFiles = ['QuotaManager', 'QuotaManager-journal'];
  for (const file of staleFiles) {
    const target = path.join(userData, file);
    try {
      if (fs.existsSync(target)) fs.unlinkSync(target);
    } catch (_) {}
  }
}());

const ICON_PATH = path.join(__dirname, 'Alarm.ico');
const remoteServerModule = require('./remote-server');

let mainWindow = null;
let tray       = null;
let remoteServer = null;
let remoteAutoConnect = true;
let remoteTouchMouseSettings = {
  primaryTap: 'left',
  secondaryTap: 'right',
  longPress: 'double',
  scrollGesture: 'two-finger',
  scrollSpeed: 100,
};

function getRemoteStatusPayload() {
  const status = remoteServer && typeof remoteServer.getStatus === 'function'
    ? remoteServer.getStatus()
    : { listening: false, clients: 0 };
  return {
    listening: Boolean(status.listening),
    clients: Number(status.clients) || 0,
    autoConnect: remoteAutoConnect,
  };
}

function broadcastRemoteStatus() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('remote-status', getRemoteStatusPayload());
}

function startRemoteServer() {
  if (remoteServer || !remoteAutoConnect) return;
  try {
    remoteServer = remoteServerModule.start({
      touchMouseSettings: remoteTouchMouseSettings,
      onAlarmSnooze: () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('remote-snooze');
        }
      },
      onStatusChange: () => broadcastRemoteStatus(),
    });
  } catch (e) {
    console.warn('[main] remote-server failed to start:', e.message);
    remoteServer = null;
  }
  broadcastRemoteStatus();
}

async function stopRemoteServer() {
  if (!remoteServer) return;
  const server = remoteServer;
  remoteServer = null;
  if (typeof server.close === 'function') {
    try {
      await server.close();
    } catch (e) {
      console.warn('[main] remote-server failed to stop cleanly:', e.message);
    }
  }
  broadcastRemoteStatus();
}

// ── Browser window ─────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width:     720,
    height:    940,
    minWidth:  520,
    minHeight: 660,
    title:     'Alarm Clock',
    icon:      ICON_PATH,
    backgroundColor: '#0f0f17',
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
      devTools:         !app.isPackaged,
    },
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.webContents.once('did-finish-load', () => broadcastRemoteStatus());

  // Control popup windows opened by the renderer (alarm pop-out)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.includes('alarm-popup.html')) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width:       500,
          height:      360,
          minWidth:    500,
          minHeight:   360,
          maxWidth:    500,
          maxHeight:   360,
          resizable:   false,
          movable:     true,
          minimizable: false,
          maximizable: false,
          alwaysOnTop: true,
          title:       'Alarm!',
          icon:        ICON_PATH,
          backgroundColor: '#120820',
          webPreferences: {
            contextIsolation: true,
            nodeIntegration:  false,
          },
        },
      };
    }
    return { action: 'deny' };
  });

  // X button minimises to tray instead of quitting
  mainWindow.on('close', e => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

// ── System tray ────────────────────────────────────────────────
function createTray() {
  tray = new Tray(ICON_PATH);

  tray.setToolTip('Alarm Clock');
  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: 'Show Alarm Clock',
      click() { mainWindow && (mainWindow.show(), mainWindow.focus()); },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click() { app.isQuitting = true; app.quit(); },
    },
  ]));

  const toggleWindow = () => {
    if (!mainWindow) return;
    mainWindow.isVisible() ? mainWindow.focus() : mainWindow.show();
  };
  tray.on('click',        toggleWindow);
  tray.on('double-click', toggleWindow);
}

// ── App lifecycle ──────────────────────────────────────────────
// ── IPC ───────────────────────────────────────────────────────────────────
ipcMain.handle('get-local-ip', () => {
  const ifaces = os.networkInterfaces();
  for (const iface of Object.values(ifaces)) {
    for (const alias of iface) {
      if (alias.family === 'IPv4' && !alias.internal) return alias.address;
    }
  }
  return '127.0.0.1';
});

ipcMain.handle('get-remote-status', () => {
  return getRemoteStatusPayload();
});

ipcMain.handle('set-remote-auto-connect', async (_event, enabled) => {
  remoteAutoConnect = Boolean(enabled);
  if (remoteAutoConnect) startRemoteServer();
  else await stopRemoteServer();
  return getRemoteStatusPayload();
});

ipcMain.handle('update-touch-mouse-settings', (_event, settings) => {
  if (settings && typeof settings === 'object') {
    remoteTouchMouseSettings = {
      ...remoteTouchMouseSettings,
      ...settings,
    };
  }
  if (remoteServer && typeof remoteServer.updateTouchMouseSettings === 'function') {
    remoteServer.updateTouchMouseSettings(remoteTouchMouseSettings);
  }
  return remoteTouchMouseSettings;
});

app.whenReady().then(() => {
  // Allow microphone access so enumerateDevices() returns full device labels,
  // and permit audioOutputDevices for setSinkId() routing.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => {
    cb(['media', 'microphone', 'audioCapture', 'unknown'].includes(permission));
  });
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => {
    return ['media', 'microphone', 'audioCapture'].includes(permission);
  });

  createWindow();
  createTray();
  startRemoteServer();
});

// Keep running in tray on Windows/Linux when all windows are closed
app.on('window-all-closed', () => {
  if (process.platform === 'darwin') app.quit();
});

app.on('activate', () => {
  if (!mainWindow) createWindow();
  else mainWindow.show();
});

app.on('before-quit', () => { app.isQuitting = true; });
