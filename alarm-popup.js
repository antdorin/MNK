'use strict';

const BUILTIN_IDS = ['__builtin_beep__', '__builtin_digital__', '__builtin_chime__'];

let stopSoundFn = null;
let alarmData   = null;
const bc        = new BroadcastChannel('alarm-channel');

// ── Web Audio (mirrors app.js) ─────────────────────────────────────────────
async function playBuiltinSound(id, volume, deviceId) {
  const ctx = new AudioContext();
  if (deviceId && typeof ctx.setSinkId === 'function') {
    try { await ctx.setSinkId(deviceId); } catch (_) {}
  }

  function pulse(t, freq, dur) {
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = freq;
    osc.type = id === '__builtin_digital__' ? 'square' : 'sine';
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(volume, t + 0.02);
    gain.gain.setValueAtTime(volume, t + dur - 0.05);
    gain.gain.linearRampToValueAtTime(0, t + dur);
    osc.start(t);
    osc.stop(t + dur);
  }

  function pattern(offset) {
    if (id === '__builtin_beep__') {
      pulse(offset + 0.00, 880, 0.18);
      pulse(offset + 0.22, 880, 0.18);
      pulse(offset + 0.44, 880, 0.18);
      return 1.2;
    } else if (id === '__builtin_digital__') {
      pulse(offset + 0.00, 1200, 0.1);
      pulse(offset + 0.12, 1000, 0.1);
      pulse(offset + 0.24, 1200, 0.1);
      pulse(offset + 0.36, 1000, 0.1);
      return 0.9;
    } else {
      [523, 659, 784, 1047].forEach((f, i) => pulse(offset + i * 0.22, f, 0.35));
      return 1.2;
    }
  }

  let active   = true;
  let nextTime = ctx.currentTime + 0.05;

  function schedule() {
    if (!active) return;
    const dur = pattern(nextTime);
    nextTime += dur + 0.3;
    setTimeout(schedule, Math.max(0, (nextTime - ctx.currentTime - 0.5) * 1000));
  }
  schedule();

  return () => { active = false; ctx.close(); };
}

async function startSound(soundId, soundDataUrl, volume, deviceId) {
  if (BUILTIN_IDS.includes(soundId)) {
    return playBuiltinSound(soundId, volume, deviceId);
  }
  if (soundDataUrl) {
    const audio = new Audio(soundDataUrl);
    audio.volume = volume;
    audio.loop   = true;
    if (deviceId && typeof audio.setSinkId === 'function') {
      try { await audio.setSinkId(deviceId); } catch (_) {}
    }
    await audio.play().catch(() => {});
    return () => audio.pause();
  }
  return null;
}

// ── BroadcastChannel comms ──────────────────────────────────────────────────
bc.onmessage = async (e) => {
  if (e.data.type !== 'alarm-fire') return;
  alarmData = e.data;
  document.getElementById('alarm-label').textContent = alarmData.label || 'Alarm!';
  document.getElementById('alarm-time').textContent  = alarmData.time  || '';
  stopSoundFn = await startSound(
    alarmData.soundId,
    alarmData.soundDataUrl,
    alarmData.volume   ?? 0.8,
    alarmData.deviceId ?? ''
  );
};

// Tell main window we are ready
bc.postMessage({ type: 'popup-ready' });

// If user closes the popup with the X button, treat as dismiss
window.addEventListener('beforeunload', () => {
  bc.postMessage({ type: 'popup-closed' });
});

// ── Buttons ────────────────────────────────────────────────────────────────
document.getElementById('dismiss-btn').addEventListener('click', () => {
  if (stopSoundFn) { stopSoundFn(); stopSoundFn = null; }
  bc.postMessage({ type: 'dismiss' });
  window.close();
});

document.getElementById('snooze-btn').addEventListener('click', () => {
  if (stopSoundFn) { stopSoundFn(); stopSoundFn = null; }
  bc.postMessage({ type: 'snooze', snoozeMin: alarmData ? alarmData.snoozeMin : 5 });
  window.close();
});
