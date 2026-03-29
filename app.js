/* ============================================================
   Alarm Clock — app.js
   - Uses the Web Audio API + AudioContext.setSinkId() to route
     audio to a chosen output device (Chrome/Edge 110+).
   - Falls back gracefully when setSinkId is unavailable.
   - Time comes from the system clock (which follows Windows
     regional/timezone settings automatically).
   - Custom sounds are stored via IndexedDB so they survive
     page reloads without a server.
   ============================================================ */

'use strict';

// ── State ─────────────────────────────────────────────────────
let alarms = [];          // [{id, time, label, days, sound, snoozeMin, enabled}]
let customSounds = [];    // [{id, name, dataUrl}]
let editingAlarmId = null;
let currentVolume = 0.8;
let alarmBC = null;          // BroadcastChannel linking main window ↔ alarm popup
let selectedSoundId = null;  // id of the currently selected sound tab
let firingAlarmId = null;
let testAudio = null;
let firingAudio = null;
let snoozeTimeout = null;
let selectedDeviceId = '';

const DB_NAME = 'AlarmClockDB';
const DB_VERSION = 1;
let db = null;

// ── DOM refs ───────────────────────────────────────────────────
const clockEl          = document.getElementById('clock');
const dateEl           = document.getElementById('date-display');
const tzEl             = document.getElementById('timezone-display');
const deviceSelect     = document.getElementById('audio-device');
const refreshDevicesBtn= document.getElementById('refresh-devices');
const volumeSlider     = document.getElementById('volume-slider');
const volumeLabel      = document.getElementById('volume-label');
const alarmListEl      = document.getElementById('alarm-list');
const addAlarmBtn      = document.getElementById('add-alarm-btn');
const alarmModal       = document.getElementById('alarm-modal');
const modalTitle       = document.getElementById('modal-title');
const alarmTimeInput   = document.getElementById('alarm-time');
const alarmLabelInput  = document.getElementById('alarm-label');
const alarmSoundSelect = document.getElementById('alarm-sound');
const snoozeMinInput   = document.getElementById('snooze-minutes');
const alarmEnabledChk  = document.getElementById('alarm-enabled');
const modalSaveBtn     = document.getElementById('modal-save');
const modalCancelBtn   = document.getElementById('modal-cancel');
const modalDeleteBtn   = document.getElementById('modal-delete');
const firingModal      = document.getElementById('firing-modal');
const firingLabelEl    = document.getElementById('firing-label');
const firingTimeEl     = document.getElementById('firing-time');
const snoozeBtn        = document.getElementById('snooze-btn');
const dismissBtn       = document.getElementById('dismiss-btn');
const soundTabsEl      = document.getElementById('sound-tabs');
const soundFileInput   = document.getElementById('sound-file-input');
const addSoundBtn      = document.getElementById('add-sound-btn');
const testSoundBtn     = document.getElementById('test-sound-btn');
const stopTestBtn      = document.getElementById('stop-test-btn');
const dayBtns          = document.querySelectorAll('.day-btn');
const remoteStatusEl   = document.getElementById('remote-status-display');
const remoteAutoConnectChk = document.getElementById('remote-auto-connect');
const touchPrimarySelect   = document.getElementById('touch-primary-action');
const touchSecondarySelect = document.getElementById('touch-secondary-action');
const touchLongPressSelect = document.getElementById('touch-long-press-action');
const touchScrollGestureSelect = document.getElementById('touch-scroll-gesture');
const touchScrollSpeedInput = document.getElementById('touch-scroll-speed');
const touchScrollSpeedLabel = document.getElementById('touch-scroll-speed-label');

const REMOTE_AUTO_CONNECT_KEY = 'remoteAutoConnect';
const REMOTE_TOUCH_SETTINGS_KEY = 'remoteTouchMouseSettings';
const DEFAULT_REMOTE_TOUCH_SETTINGS = {
  primaryTap: 'left',
  secondaryTap: 'right',
  longPress: 'double',
  scrollGesture: 'two-finger',
  scrollSpeed: 200,
};

function getSavedRemoteAutoConnect() {
  const raw = localStorage.getItem(REMOTE_AUTO_CONNECT_KEY);
  if (raw == null) return true;
  return raw === 'true';
}

function getSavedRemoteTouchSettings() {
  try {
    const raw = localStorage.getItem(REMOTE_TOUCH_SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_REMOTE_TOUCH_SETTINGS };
    const parsed = JSON.parse(raw);
    return {
      primaryTap: parsed.primaryTap || DEFAULT_REMOTE_TOUCH_SETTINGS.primaryTap,
      secondaryTap: parsed.secondaryTap || DEFAULT_REMOTE_TOUCH_SETTINGS.secondaryTap,
      longPress: parsed.longPress || DEFAULT_REMOTE_TOUCH_SETTINGS.longPress,
      scrollGesture: parsed.scrollGesture || DEFAULT_REMOTE_TOUCH_SETTINGS.scrollGesture,
      scrollSpeed: Math.min(300, Math.max(1, Number(parsed.scrollSpeed) || DEFAULT_REMOTE_TOUCH_SETTINGS.scrollSpeed)),
    };
  } catch {
    return { ...DEFAULT_REMOTE_TOUCH_SETTINGS };
  }
}

function getTouchSettingsFromUI() {
  return {
    primaryTap: touchPrimarySelect?.value || DEFAULT_REMOTE_TOUCH_SETTINGS.primaryTap,
    secondaryTap: touchSecondarySelect?.value || DEFAULT_REMOTE_TOUCH_SETTINGS.secondaryTap,
    longPress: touchLongPressSelect?.value || DEFAULT_REMOTE_TOUCH_SETTINGS.longPress,
    scrollGesture: touchScrollGestureSelect?.value || DEFAULT_REMOTE_TOUCH_SETTINGS.scrollGesture,
    scrollSpeed: Math.min(300, Math.max(1, Number(touchScrollSpeedInput?.value) || DEFAULT_REMOTE_TOUCH_SETTINGS.scrollSpeed)),
  };
}

function setTouchSettingsInUI(settings) {
  if (touchPrimarySelect) touchPrimarySelect.value = settings.primaryTap;
  if (touchSecondarySelect) touchSecondarySelect.value = settings.secondaryTap;
  if (touchLongPressSelect) touchLongPressSelect.value = settings.longPress;
  if (touchScrollGestureSelect) touchScrollGestureSelect.value = settings.scrollGesture;
  if (touchScrollSpeedInput) touchScrollSpeedInput.value = String(settings.scrollSpeed);
  if (touchScrollSpeedLabel) touchScrollSpeedLabel.textContent = `${settings.scrollSpeed}%`;
}

function updateRemoteStatus(status) {
  if (!remoteStatusEl) return;
  const listening = Boolean(status && status.listening);
  const clients = Number(status && status.clients) || 0;
  remoteStatusEl.classList.toggle('online', listening);
  remoteStatusEl.classList.toggle('offline', !listening);

  if (listening) {
    remoteStatusEl.textContent = clients > 0
      ? `Listening (${clients} connected)`
      : 'Listening';
  } else {
    remoteStatusEl.textContent = 'Stopped';
  }
}

async function applyRemoteSettings() {
  const autoConnect = remoteAutoConnectChk ? remoteAutoConnectChk.checked : true;
  const touchSettings = getTouchSettingsFromUI();

  localStorage.setItem(REMOTE_AUTO_CONNECT_KEY, String(autoConnect));
  localStorage.setItem(REMOTE_TOUCH_SETTINGS_KEY, JSON.stringify(touchSettings));

  if (!window.electronAPI) return;

  try {
    if (typeof window.electronAPI.setRemoteAutoConnect === 'function') {
      const status = await window.electronAPI.setRemoteAutoConnect(autoConnect);
      updateRemoteStatus(status);
    }
    if (typeof window.electronAPI.updateTouchMouseSettings === 'function') {
      await window.electronAPI.updateTouchMouseSettings(touchSettings);
    }
  } catch (e) {
    console.warn('Failed to apply remote settings:', e);
  }
}

// ── IndexedDB ─────────────────────────────────────────────────
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains('alarms')) {
        d.createObjectStore('alarms', { keyPath: 'id' });
      }
      if (!d.objectStoreNames.contains('sounds')) {
        d.createObjectStore('sounds', { keyPath: 'id' });
      }
    };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
}

function dbGetAll(storeName) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror   = e => reject(e.target.error);
  });
}

function dbPut(storeName, obj) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const req = tx.objectStore(storeName).put(obj);
    req.onsuccess = () => resolve();
    req.onerror   = e => reject(e.target.error);
  });
}

function dbDelete(storeName, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const req = tx.objectStore(storeName).delete(id);
    req.onsuccess = () => resolve();
    req.onerror   = e => reject(e.target.error);
  });
}

// ── Clock ─────────────────────────────────────────────────────
function tickClock() {
  const now = new Date();

  // Time (uses Windows / system timezone automatically)
  const hours24 = now.getHours();
  const ampm = hours24 >= 12 ? 'PM' : 'AM';
  const h12  = hours24 % 12 === 0 ? 12 : hours24 % 12;
  const h   = String(h12).padStart(2, '0');
  const m   = String(now.getMinutes()).padStart(2, '0');
  const s   = String(now.getSeconds()).padStart(2, '0');
  clockEl.textContent = `${h}:${m}:${s} ${ampm}`;

  // Date
  const dateStr = now.toLocaleDateString(undefined, {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });
  dateEl.textContent = dateStr;

  // Timezone
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const offset = -(now.getTimezoneOffset());
  const sign   = offset >= 0 ? '+' : '-';
  const absH   = String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0');
  const absM   = String(Math.abs(offset) % 60).padStart(2, '0');
  tzEl.textContent = `${tz}  (UTC${sign}${absH}:${absM})`;
}

// ── Audio Device Enumeration ───────────────────────────────────
async function loadAudioDevices() {
  try {
    // Request mic permission once so labels are populated
    await navigator.mediaDevices.getUserMedia({ audio: true })
      .then(s => s.getTracks().forEach(t => t.stop()))
      .catch(() => {});

    const devices = await navigator.mediaDevices.enumerateDevices();
    const outputs = devices.filter(d => d.kind === 'audiooutput');

    const prev = deviceSelect.value;
    // keep the placeholder
    deviceSelect.innerHTML = '<option value="">-- Default Device --</option>';
    outputs.forEach(d => {
      const opt = document.createElement('option');
      opt.value = d.deviceId;
      opt.textContent = d.label || `Speaker (${d.deviceId.slice(0,8)}…)`;
      deviceSelect.appendChild(opt);
    });

    if (prev && [...deviceSelect.options].some(o => o.value === prev)) {
      deviceSelect.value = prev;
    }
    selectedDeviceId = deviceSelect.value;
  } catch (err) {
    console.warn('Could not enumerate audio devices:', err);
  }
}

// Apply a chosen sink to an HTMLAudioElement (Chrome/Edge 110+)
async function applySink(audioEl) {
  if (selectedDeviceId && typeof audioEl.setSinkId === 'function') {
    try {
      await audioEl.setSinkId(selectedDeviceId);
    } catch (e) {
      console.warn('setSinkId failed:', e);
    }
  }
}

// ── Sound helpers ─────────────────────────────────────────────
// Built-in beep generated via Web Audio API (no file needed)
function createBeepDataUrl(freq = 880, durationSec = 0.6) {
  const sampleRate = 44100;
  const numSamples = Math.floor(sampleRate * durationSec);
  const buf = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buf);

  function writeString(offset, str) {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  }
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, numSamples * 2, true);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    // Sine wave with quick fade-in and fade-out
    const env = Math.min(t / 0.02, 1) * Math.min((durationSec - t) / 0.05, 1);
    const sample = Math.round(env * 32767 * Math.sin(2 * Math.PI * freq * t));
    view.setInt16(44 + i * 2, sample, true);
  }
  const blob = new Blob([buf], { type: 'audio/wav' });
  return URL.createObjectURL(blob);
}

// Repeating beep pattern dataUrl (3 pulses)
function createAlarmBeepUrl() {
  // We'll use the Web Audio API at runtime instead for the alarm tone
  return '__builtin_beep__';
}

const BUILTIN_SOUNDS = [
  { id: '__builtin_beep__',    name: 'Classic Beep' },
  { id: '__builtin_digital__', name: 'Digital Pulse' },
  { id: '__builtin_chime__',   name: 'Soft Chime' },
];

async function playBuiltinSound(id, volume, loop, deviceId = '') {
  const ctx = new AudioContext();
  // Route Web Audio output to the selected device (Chromium / Electron 110+)
  if (deviceId && typeof ctx.setSinkId === 'function') {
    try { await ctx.setSinkId(deviceId); } catch (e) { console.warn('AudioContext.setSinkId:', e); }
  }
  let stopFn = () => { ctx.close(); };

  function schedulePulse(startTime, freq, dur) {
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = freq;
    osc.type = (id === '__builtin_digital__') ? 'square' : 'sine';
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(volume, startTime + 0.02);
    gain.gain.setValueAtTime(volume, startTime + dur - 0.05);
    gain.gain.linearRampToValueAtTime(0, startTime + dur);
    osc.start(startTime);
    osc.stop(startTime + dur);
  }

  function playPattern(offset) {
    if (id === '__builtin_beep__') {
      schedulePulse(offset + 0.0, 880, 0.18);
      schedulePulse(offset + 0.22, 880, 0.18);
      schedulePulse(offset + 0.44, 880, 0.18);
      return 1.2;
    } else if (id === '__builtin_digital__') {
      schedulePulse(offset + 0.0, 1200, 0.1);
      schedulePulse(offset + 0.12, 1000, 0.1);
      schedulePulse(offset + 0.24, 1200, 0.1);
      schedulePulse(offset + 0.36, 1000, 0.1);
      return 0.9;
    } else {
      // chime: descending tones
      [523, 659, 784, 1047].forEach((f, i) => schedulePulse(offset + i * 0.22, f, 0.35));
      return 1.2;
    }
  }

  let active = true;
  let nextTime = ctx.currentTime + 0.05;

  function schedule() {
    if (!active) return;
    const dur = playPattern(nextTime);
    nextTime += dur + 0.3;
    if (loop) {
      setTimeout(schedule, Math.max(0, (nextTime - ctx.currentTime - 0.5) * 1000));
    }
  }
  schedule();

  stopFn = () => { active = false; ctx.close(); };
  return stopFn;
}

// Create an HTMLAudioElement for custom sounds and apply device routing
async function createAlarmAudio(soundId, volume) {
  const sound = customSounds.find(s => s.id === soundId);
  if (!sound) return null;
  const audio = new Audio(sound.dataUrl);
  audio.volume = volume;
  audio.loop = true;
  await applySink(audio);
  return audio;
}

// ── Sound Select population ───────────────────────────────────
function populateSoundSelect() {
  const prev = alarmSoundSelect.value;
  alarmSoundSelect.innerHTML = '';

  BUILTIN_SOUNDS.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = s.name;
    alarmSoundSelect.appendChild(opt);
  });

  customSounds.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = s.name;
    alarmSoundSelect.appendChild(opt);
  });

  if (prev && [...alarmSoundSelect.options].some(o => o.value === prev)) {
    alarmSoundSelect.value = prev;
  }
}

// ── Custom sounds UI ──────────────────────────────────────────
function renderCustomSounds() {
  soundTabsEl.innerHTML = '';
  if (customSounds.length === 0) {
    soundTabsEl.innerHTML = '<span class="sound-tabs-empty">No custom sounds added yet.</span>';
    if (!customSounds.find(s => s.id === selectedSoundId)) selectedSoundId = null;
    populateSoundSelect();
    return;
  }
  // Keep selection valid
  if (!customSounds.find(s => s.id === selectedSoundId)) {
    selectedSoundId = customSounds[0].id;
  }
  customSounds.forEach(s => {
    const tab = document.createElement('div');
    tab.className = 'sound-tab' + (s.id === selectedSoundId ? ' selected' : '');
    tab.dataset.id = s.id;

    const name = document.createElement('span');
    name.className = 'sound-tab-name';
    name.textContent = s.name;
    name.title = s.name;
    name.addEventListener('click', () => {
      selectedSoundId = s.id;
      renderCustomSounds();
    });

    const close = document.createElement('button');
    close.className = 'sound-tab-close';
    close.title = 'Remove';
    close.textContent = '\u2715';
    close.addEventListener('click', async (e) => {
      e.stopPropagation();
      await dbDelete('sounds', s.id);
      customSounds = customSounds.filter(x => x.id !== s.id);
      if (selectedSoundId === s.id) selectedSoundId = customSounds[0]?.id ?? null;
      renderCustomSounds();
      populateSoundSelect();
    });

    tab.appendChild(name);
    tab.appendChild(close);
    soundTabsEl.appendChild(tab);
  });
  populateSoundSelect();
}

// ── Alarm list rendering ──────────────────────────────────────
const DAY_NAMES = ['Su','Mo','Tu','We','Th','Fr','Sa'];

function daysLabel(days) {
  if (!days || days.length === 0) return 'Once';
  if (days.length === 7) return 'Every day';
  if (days.length === 5 && !days.includes(0) && !days.includes(6)) return 'Weekdays';
  if (days.length === 2 && days.includes(0) && days.includes(6)) return 'Weekends';
  return days.map(d => DAY_NAMES[d]).join(' ');
}

function renderAlarms() {
  alarmListEl.innerHTML = '';
  if (alarms.length === 0) {
    alarmListEl.innerHTML = '<p class="no-alarms">No alarms set.</p>';
    return;
  }
  // Sort by time
  const sorted = [...alarms].sort((a, b) => a.time.localeCompare(b.time));
  sorted.forEach(alarm => {
    const item = document.createElement('div');
    item.className = 'alarm-item' + (alarm.enabled ? '' : ' disabled');
    item.dataset.id = alarm.id;

    const timeParts = alarm.time.split(':');
    const h24 = parseInt(timeParts[0]);
    const min = timeParts[1];
    const ampm = h24 >= 12 ? 'PM' : 'AM';
    const h12  = h24 % 12 === 0 ? 12 : h24 % 12;
    const displayTime = `${String(h12).padStart(2,'0')}:${min} ${ampm}`;

    item.innerHTML = `
      <span class="alarm-time-text">${displayTime}</span>
      <div class="alarm-meta">
        <span class="alarm-label-text">${escapeHtml(alarm.label) || '&nbsp;'}</span>
        <span class="alarm-days-text">${daysLabel(alarm.days)}</span>
      </div>
      <label class="alarm-toggle" title="Enable/disable">
        <input type="checkbox" ${alarm.enabled ? 'checked' : ''} />
        <span class="alarm-toggle-slider"></span>
      </label>
    `;

    // Toggle enable/disable
    const chk = item.querySelector('input[type="checkbox"]');
    chk.addEventListener('change', async e => {
      e.stopPropagation();
      alarm.enabled = chk.checked;
      item.classList.toggle('disabled', !alarm.enabled);
      await dbPut('alarms', alarm);
    });

    // Click row to edit
    item.addEventListener('click', e => {
      if (e.target === chk || e.target.closest('.alarm-toggle')) return;
      openEditModal(alarm.id);
    });

    alarmListEl.appendChild(item);
  });
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.appendChild(document.createTextNode(str || ''));
  return d.innerHTML;
}

// ── Modal helpers ─────────────────────────────────────────────
function getSelectedDays() {
  return [...dayBtns].filter(b => b.classList.contains('active')).map(b => parseInt(b.dataset.day));
}

function setSelectedDays(days) {
  dayBtns.forEach(b => {
    b.classList.toggle('active', days.includes(parseInt(b.dataset.day)));
  });
}

function openAddModal() {
  editingAlarmId = null;
  modalTitle.textContent = 'Add Alarm';
  // Default to next rounded-up hour
  const now = new Date();
  now.setMinutes(0, 0, 0);
  now.setHours(now.getHours() + 1);
  alarmTimeInput.value = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  alarmLabelInput.value = '';
  setSelectedDays([]);
  alarmSoundSelect.value = BUILTIN_SOUNDS[0].id;
  snoozeMinInput.value = 5;
  alarmEnabledChk.checked = true;
  modalDeleteBtn.classList.add('hidden');
  alarmModal.classList.remove('hidden');
  alarmTimeInput.focus();
}

function openEditModal(id) {
  const alarm = alarms.find(a => a.id === id);
  if (!alarm) return;
  editingAlarmId = id;
  modalTitle.textContent = 'Edit Alarm';
  alarmTimeInput.value = alarm.time;
  alarmLabelInput.value = alarm.label || '';
  setSelectedDays(alarm.days || []);
  alarmSoundSelect.value = alarm.sound || BUILTIN_SOUNDS[0].id;
  snoozeMinInput.value = alarm.snoozeMin || 5;
  alarmEnabledChk.checked = alarm.enabled !== false;
  modalDeleteBtn.classList.remove('hidden');
  alarmModal.classList.remove('hidden');
}

function closeModal() {
  alarmModal.classList.add('hidden');
  editingAlarmId = null;
}

// ── Alarm CRUD ────────────────────────────────────────────────
async function saveAlarm() {
  const time = alarmTimeInput.value;
  if (!time) { alarmTimeInput.focus(); return; }

  const alarm = {
    id:        editingAlarmId || crypto.randomUUID(),
    time:      time.slice(0, 5),
    label:     alarmLabelInput.value.trim(),
    days:      getSelectedDays(),
    sound:     alarmSoundSelect.value,
    snoozeMin: parseInt(snoozeMinInput.value) || 5,
    enabled:   alarmEnabledChk.checked,
  };

  await dbPut('alarms', alarm);

  const idx = alarms.findIndex(a => a.id === alarm.id);
  if (idx >= 0) alarms[idx] = alarm; else alarms.push(alarm);

  renderAlarms();
  closeModal();
}

async function deleteAlarm() {
  if (!editingAlarmId) return;
  await dbDelete('alarms', editingAlarmId);
  alarms = alarms.filter(a => a.id !== editingAlarmId);
  renderAlarms();
  closeModal();
}

// ── Alarm checking (every second) ────────────────────────────
let lastCheckedMinute = -1;
let activeBuiltinStop = null;

function checkAlarms() {
  const now  = new Date();
  const hh   = String(now.getHours()).padStart(2,'0');
  const mm   = String(now.getMinutes()).padStart(2,'0');
  const currentMinute = now.getHours() * 60 + now.getMinutes();
  const dayOfWeek = now.getDay();

  if (currentMinute === lastCheckedMinute) return;
  lastCheckedMinute = currentMinute;

  const timeStr = `${hh}:${mm}`;

  alarms.forEach(alarm => {
    if (!alarm.enabled) return;
    if (!alarm.time.startsWith(timeStr)) return;
    if (alarm.days && alarm.days.length > 0 && !alarm.days.includes(dayOfWeek)) return;
    // Don't fire if another alarm is already firing
    if (firingAlarmId) return;

    triggerAlarm(alarm).catch(console.error);
  });
}

async function triggerAlarm(alarm) {
  firingAlarmId = alarm.id;

  const soundId     = alarm.sound || BUILTIN_SOUNDS[0].id;
  const customSound = customSounds.find(s => s.id === soundId);

  const payload = {
    type:        'alarm-fire',
    id:          alarm.id,
    label:       alarm.label || 'Alarm!',
    time:        formatTime12(alarm.time),
    snoozeMin:   alarm.snoozeMin || 5,
    soundId,
    soundDataUrl: customSound ? customSound.dataUrl : null,
    volume:      currentVolume,
    deviceId:    selectedDeviceId,
  };

  // Open alarm pop-out window (size/alwaysOnTop locked in main.js)
  const popup = window.open('alarm-popup.html', '_blank', 'popup');
  if (popup) {
    if (alarmBC) alarmBC.close();
    alarmBC = new BroadcastChannel('alarm-channel');
    alarmBC.onmessage = (e) => {
      if      (e.data.type === 'popup-ready')                    { alarmBC.postMessage(payload); }
      else if (e.data.type === 'dismiss' ||
               e.data.type === 'popup-closed')                   { handleAlarmDismiss(); }
      else if (e.data.type === 'snooze')                         { handleAlarmSnooze(e.data.snoozeMin); }
    };
  } else {
    // Fallback: in-app modal if popup is blocked
    firingLabelEl.textContent = payload.label;
    firingTimeEl.textContent  = payload.time;
    firingModal.classList.remove('hidden');
    if (BUILTIN_SOUNDS.find(s => s.id === soundId)) {
      activeBuiltinStop = await playBuiltinSound(soundId, currentVolume, true, selectedDeviceId);
    } else if (customSound) {
      createAlarmAudio(soundId, currentVolume).then(audio => {
        if (audio) { firingAudio = audio; audio.play().catch(() => {}); }
      });
    }
  }
}

function stopAlarmSound() {
  if (activeBuiltinStop) { activeBuiltinStop(); activeBuiltinStop = null; }
  if (firingAudio) { firingAudio.pause(); firingAudio = null; }
}

function handleAlarmDismiss() {
  stopAlarmSound();
  if (snoozeTimeout) { clearTimeout(snoozeTimeout); snoozeTimeout = null; }
  const alarm = alarms.find(a => a.id === firingAlarmId);
  // If one-shot (no repeat days), disable after firing
  if (alarm && (!alarm.days || alarm.days.length === 0)) {
    alarm.enabled = false;
    dbPut('alarms', alarm);
    renderAlarms();
  }
  firingAlarmId = null;
  firingModal.classList.add('hidden');
  if (alarmBC) { alarmBC.close(); alarmBC = null; }
}

function handleAlarmSnooze(snoozeMin) {
  const alarm = alarms.find(a => a.id === firingAlarmId);
  const min   = snoozeMin || (alarm ? alarm.snoozeMin : 5) || 5;
  stopAlarmSound();
  firingModal.classList.add('hidden');
  snoozeTimeout = setTimeout(() => {
    if (alarm) triggerAlarm(alarm).catch(console.error);
  }, min * 60 * 1000);
  firingAlarmId = null;
  if (alarmBC) { alarmBC.close(); alarmBC = null; }
}

function dismissAlarm() { handleAlarmDismiss(); }
function snoozeAlarm()  { handleAlarmSnooze(); }

function formatTime12(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12  = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2,'0')} ${ampm}`;
}

// ── Event Listeners ───────────────────────────────────────────
volumeSlider.addEventListener('input', () => {
  currentVolume = volumeSlider.value / 100;
  volumeLabel.textContent = `${volumeSlider.value}%`;
});

deviceSelect.addEventListener('change', () => {
  selectedDeviceId = deviceSelect.value;
});

refreshDevicesBtn.addEventListener('click', loadAudioDevices);

addAlarmBtn.addEventListener('click', openAddModal);
modalSaveBtn.addEventListener('click', saveAlarm);
modalCancelBtn.addEventListener('click', closeModal);
modalDeleteBtn.addEventListener('click', deleteAlarm);

// Close modal on backdrop click
alarmModal.addEventListener('click', e => {
  if (e.target === alarmModal) closeModal();
});

dayBtns.forEach(btn => {
  btn.addEventListener('click', () => btn.classList.toggle('active'));
});

dismissBtn.addEventListener('click', dismissAlarm);
snoozeBtn.addEventListener('click', snoozeAlarm);

if (window.electronAPI && typeof window.electronAPI.onRemoteSnooze === 'function') {
  window.electronAPI.onRemoteSnooze(() => {
    if (firingAlarmId) handleAlarmSnooze();
  });
}

addSoundBtn.addEventListener('click', () => soundFileInput.click());

soundFileInput.addEventListener('change', async () => {
  const file = soundFileInput.files[0];
  if (!file) return;
  // Validate it's an audio file by MIME type
  if (!file.type.startsWith('audio/')) {
    alert('Please select a valid audio file.');
    soundFileInput.value = '';
    return;
  }
  // Limit to 20 MB
  if (file.size > 20 * 1024 * 1024) {
    alert('Audio file is too large (max 20 MB).');
    soundFileInput.value = '';
    return;
  }

  const dataUrl = await fileToDataUrl(file);
  const sound = {
    id:      crypto.randomUUID(),
    name:    file.name.replace(/\.[^.]+$/, ''),
    dataUrl,
  };
  await dbPut('sounds', sound);
  customSounds.push(sound);
  selectedSoundId = sound.id;
  renderCustomSounds();
  soundFileInput.value = '';
});

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = e => resolve(e.target.result);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

let testBuiltinStop = null;

testSoundBtn.addEventListener('click', async () => {
  stopTest();
  if (!selectedSoundId) { alert('Select a sound tab first.'); return; }

  const builtin = BUILTIN_SOUNDS.find(s => s.id === selectedSoundId);
  if (builtin) {
    testBuiltinStop = await playBuiltinSound(selectedSoundId, currentVolume, false, selectedDeviceId);
  } else {
    const audio = await createAlarmAudio(selectedSoundId, currentVolume);
    if (audio) {
      testAudio = audio;
      audio.play().catch(() => {});
    }
  }
});

stopTestBtn.addEventListener('click', stopTest);

function stopTest() {
  if (testBuiltinStop) { testBuiltinStop(); testBuiltinStop = null; }
  if (testAudio) { testAudio.pause(); testAudio = null; }
}

// ── Theme ─────────────────────────────────────────────────────
function applyTheme(name) {
  document.body.className = document.body.className.replace(/\btheme-\S+/g, '').trim();
  if (name && name !== 'crimson') document.body.classList.add('theme-' + name);
  document.querySelectorAll('.theme-dot').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === name);
  });
  localStorage.setItem('theme', name);
}

document.getElementById('theme-picker').addEventListener('click', e => {
  const dot = e.target.closest('.theme-dot');
  if (dot) applyTheme(dot.dataset.theme);
});

// ── Init ──────────────────────────────────────────────────────
async function init() {
  // Open IndexedDB
  db = await openDB();

  // Load persisted alarms & sounds
  [alarms, customSounds] = await Promise.all([
    dbGetAll('alarms'),
    dbGetAll('sounds'),
  ]);

  // Render UI
  populateSoundSelect();
  renderCustomSounds();
  renderAlarms();

  // Apply saved colour theme
  applyTheme(localStorage.getItem('theme') || 'crimson');

  // Restore and apply remote control settings
  if (remoteAutoConnectChk) {
    remoteAutoConnectChk.checked = getSavedRemoteAutoConnect();
  }
  setTouchSettingsInUI(getSavedRemoteTouchSettings());

  remoteAutoConnectChk?.addEventListener('change', applyRemoteSettings);
  touchPrimarySelect?.addEventListener('change', applyRemoteSettings);
  touchSecondarySelect?.addEventListener('change', applyRemoteSettings);
  touchLongPressSelect?.addEventListener('change', applyRemoteSettings);
  touchScrollGestureSelect?.addEventListener('change', applyRemoteSettings);
  touchScrollSpeedInput?.addEventListener('input', () => {
    if (touchScrollSpeedLabel) touchScrollSpeedLabel.textContent = `${touchScrollSpeedInput.value}%`;
  });
  touchScrollSpeedInput?.addEventListener('change', applyRemoteSettings);

  if (window.electronAPI && typeof window.electronAPI.onRemoteStatus === 'function') {
    window.electronAPI.onRemoteStatus(status => updateRemoteStatus(status));
  }

  if (window.electronAPI && typeof window.electronAPI.getRemoteStatus === 'function') {
    try {
      updateRemoteStatus(await window.electronAPI.getRemoteStatus());
    } catch (_) {}
  }

  await applyRemoteSettings();

  // Start clock
  tickClock();
  setInterval(tickClock, 500);

  // Check alarms every second
  setInterval(checkAlarms, 1000);

  // Enumerate audio output devices
  await loadAudioDevices();
  navigator.mediaDevices.addEventListener('devicechange', loadAudioDevices);
}

init().catch(console.error);
