'use strict';

// ─── Remote Control Server ─────────────────────────────────────────────────
// WebSocket server on port 9101 that accepts JSON events from the iOS app
// and drives the OS mouse / keyboard via @jitsi/robotjs.
//
// Message format (iOS → PC):
//   {type: "mousemove", dx: number, dy: number}
//   {type: "click",     button: "left"|"right"}
//   {type: "scroll",    dy: number}          (positive = down, negative = up)
//   {type: "keydown",   key: string}         (e.g. "a", "Return", "Backspace")
// ──────────────────────────────────────────────────────────────────────────

const PORT = 9101;
const DEFAULT_TOUCH_MOUSE_SETTINGS = {
  primaryTap: 'left',
  secondaryTap: 'right',
  longPress: 'double',
  scrollGesture: 'two-finger',
  scrollSpeed: 100,
};

function normalizeAction(value, fallback) {
  const v = String(value || fallback || '').toLowerCase();
  return ['left', 'right', 'middle', 'double', 'none'].includes(v) ? v : fallback;
}

function normalizeTouchMouseSettings(settings = {}) {
  return {
    primaryTap: normalizeAction(settings.primaryTap, DEFAULT_TOUCH_MOUSE_SETTINGS.primaryTap),
    secondaryTap: normalizeAction(settings.secondaryTap, DEFAULT_TOUCH_MOUSE_SETTINGS.secondaryTap),
    longPress: normalizeAction(settings.longPress, DEFAULT_TOUCH_MOUSE_SETTINGS.longPress),
    scrollGesture: ['two-finger', 'swipe', 'any', 'none'].includes(settings.scrollGesture)
      ? settings.scrollGesture
      : DEFAULT_TOUCH_MOUSE_SETTINGS.scrollGesture,
    scrollSpeed: Math.min(300, Math.max(1, Number(settings.scrollSpeed) || DEFAULT_TOUCH_MOUSE_SETTINGS.scrollSpeed)),
  };
}

function performAction(action) {
  if (!robot || action === 'none') return;
  if (action === 'double') {
    robot.mouseClick('left', true);
    return;
  }
  robot.mouseClick(action, false);
}

function actionForGesture(gesture, settings) {
  switch (String(gesture || '').toLowerCase()) {
    case 'tap':
    case 'single-tap':
    case 'primary-tap':
      return settings.primaryTap;
    case 'secondary-tap':
    case 'two-finger-tap':
    case 'right-tap':
      return settings.secondaryTap;
    case 'long-press':
      return settings.longPress;
    default:
      return null;
  }
}

function shouldHandleScrollGesture(gesture, settings) {
  const mode = settings.scrollGesture;
  if (mode === 'none') return false;
  if (mode === 'any') return true;
  const g = String(gesture || '').toLowerCase();
  if (mode === 'two-finger') {
    return g === '' || g === 'two-finger' || g === 'two-finger-scroll';
  }
  if (mode === 'swipe') {
    return g === 'swipe' || g === 'vertical-swipe';
  }
  return true;
}

// ── Load robotjs (native module — must be rebuilt with: npm run rebuild) ───
let robot = null;
try {
  robot = require('@jitsi/robotjs');
  robot.setMouseDelay(0);      // No delay between mouse events
  robot.setKeyboardDelay(0);   // No delay between key events
} catch (e) {
  console.warn('[RemoteServer] @jitsi/robotjs unavailable:', e.message);
  console.warn('[RemoteServer] Run  npm run rebuild  to build native bindings.');
}

// ── Key name (iOS) → robotjs key name ──────────────────────────────────────
const KEY_MAP = {
  Backspace:  'backspace',
  Delete:     'delete',
  Return:     'enter',
  Enter:      'enter',
  Tab:        'tab',
  Escape:     'escape',
  ' ':        'space',
  ArrowUp:    'up',
  ArrowDown:  'down',
  ArrowLeft:  'left',
  ArrowRight: 'right',
  Home:       'home',
  End:        'end',
  PageUp:     'pageup',
  PageDown:   'pagedown',
  F1: 'f1', F2: 'f2',  F3: 'f3',  F4:  'f4',
  F5: 'f5', F6: 'f6',  F7: 'f7',  F8:  'f8',
  F9: 'f9', F10:'f10', F11:'f11', F12: 'f12',
};

// ── Event handler ──────────────────────────────────────────────────────────
function handleMessage(raw, onAlarmSnooze, getTouchMouseSettings) {
  let data;
  try { data = JSON.parse(raw); } catch { return; }

  if (!robot && data.type !== 'alarm-snooze') return;

  try {
    switch (data.type) {

      case 'mousemove': {
        // No clamping — Windows SetCursorPos (used by robotjs internally)
        // supports the full virtual desktop including negative coordinates
        // for monitors left/above the primary display.
        const pos  = robot.getMousePos();
        const newX = Math.round(pos.x + (data.dx || 0));
        const newY = Math.round(pos.y + (data.dy || 0));
        robot.moveMouse(newX, newY);
        break;
      }

      case 'click': {
        if (data.gesture) {
          const mapped = actionForGesture(data.gesture, getTouchMouseSettings());
          if (mapped) performAction(mapped);
          break;
        }
        const btn = ['left', 'right', 'middle'].includes(data.button) ? data.button : 'left';
        robot.mouseClick(btn, data.double || false);
        break;
      }

      case 'touch': {
        const mapped = actionForGesture(data.gesture, getTouchMouseSettings());
        if (mapped) performAction(mapped);
        break;
      }

      case 'scroll': {
        const settings = getTouchMouseSettings();
        if (!shouldHandleScrollGesture(data.gesture, settings)) break;
        const multiplier = settings.scrollSpeed / 100;
        const dy = Math.round((data.dy || 0) * multiplier);
        if (dy !== 0) robot.scrollMouse(0, dy);
        break;
      }

      case 'keydown': {
        const key = data.key;
        if (!key) break;
        const mapped = KEY_MAP[key];
        if (mapped) {
          robot.keyTap(mapped);
        } else if (key.length === 1) {
          robot.typeString(key);
        }
        break;
      }

      case 'alarm-snooze': {
        if (typeof onAlarmSnooze === 'function') onAlarmSnooze();
        break;
      }
    }
  } catch (e) {
    console.error('[RemoteServer] Input error:', e.message);
  }
}

// ── Start WebSocket server ─────────────────────────────────────────────────
function start(options = {}) {
  const onAlarmSnooze = typeof options.onAlarmSnooze === 'function'
    ? options.onAlarmSnooze
    : null;
  const onStatusChange = typeof options.onStatusChange === 'function'
    ? options.onStatusChange
    : null;
  let touchMouseSettings = normalizeTouchMouseSettings(options.touchMouseSettings);

  let WebSocketServer;
  try {
    ({ WebSocketServer } = require('ws'));
  } catch (e) {
    console.warn('[RemoteServer] ws package unavailable:', e.message);
    return null;
  }

  const wss = new WebSocketServer({ port: PORT, host: '0.0.0.0' });
  let clientCount = 0;

  function getStatus() {
    return {
      listening: true,
      clients: clientCount,
    };
  }

  function notifyStatus() {
    if (onStatusChange) onStatusChange(getStatus());
  }

  wss.on('listening', () => {
    console.log(`[RemoteServer] Listening on ws://0.0.0.0:${PORT}`);
  });

  wss.on('connection', (ws, req) => {
    const ip = req.socket.remoteAddress;
    clientCount += 1;
    notifyStatus();
    console.log(`[RemoteServer] Client connected: ${ip}`);

    ws.on('message', data => handleMessage(data.toString(), onAlarmSnooze, () => touchMouseSettings));
    ws.on('close',   ()   => {
      clientCount = Math.max(0, clientCount - 1);
      notifyStatus();
      console.log(`[RemoteServer] Client disconnected: ${ip}`);
    });
    ws.on('error',   err  => console.warn('[RemoteServer] WS error:', err.message));
  });

  wss.on('error', err => {
    console.error('[RemoteServer] Server error:', err.message);
  });

  notifyStatus();

  return {
    close: () => new Promise(resolve => {
      wss.close(() => resolve());
    }),
    updateTouchMouseSettings: (next) => {
      touchMouseSettings = normalizeTouchMouseSettings(next);
    },
    getStatus,
  };
}

module.exports = { start };
