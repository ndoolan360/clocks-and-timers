const LAYER_FREQUENCIES = [
  440.00, // A4
  554.37, // C#5
  659.26, // E5
  830.61, // G#5
  987.77, // B5
  1244.50,// D#6
  1480.00,// F#6
];

/** @type {AudioContext | undefined} */
let audioCtx;
/** @type {GainNode | undefined} */
let masterGain;
/** @type {boolean} */
let unlockListenersRegistered = false;

/**
 * Unlock the audio context by resuming it on a user gesture, if not already running.
 * @returns {Promise<void>}
 */
export async function unlockAudio() {
  if (!unlockListenersRegistered) {
    unlockListenersRegistered = true;

    const unlock = async () => {
      if (audioCtx) {
        return;
      }

      audioCtx = new AudioContext();
      masterGain = audioCtx.createGain();
      masterGain.gain.setValueAtTime(0.5, audioCtx.currentTime);
      masterGain.connect(audioCtx.destination);
      await audioCtx.resume().catch(() => { });
    };

    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    window.addEventListener('touchstart', unlock, { once: true });
    return;
  }

  if (!audioCtx || audioCtx.state === 'running') {
    return;
  }

  await audioCtx.resume().catch(() => { });
}

/**
 * Register events that should START audio for the event target.
 * @param {HTMLElement} container
 * @param {string[]} eventNames
 * @returns {() => void}
 */
export function registerAlarmStartEvents(container, eventNames) {
  const listeners = [];

  for (const eventName of eventNames) {
    const handler = async (event) => {
      if (!event.target.dataset.audioId) {
        event.target.dataset.audioId = `audio-${crypto.randomUUID()}`;
      }
      const audioId = event.target.dataset.audioId;
      if (audioId) await startAlarm(audioId);
    };

    container.addEventListener(eventName, handler);
    listeners.push([eventName, handler]);
  }

  return () => {
    for (const [eventName, handler] of listeners) {
      container.removeEventListener(eventName, handler);
    }
  };
}

/**
 * Register events that should STOP audio for the event target.
 * @param {HTMLElement} container
 * @param {string[]} eventNames
 * @returns {() => void}
 */
export function registerAlarmStopEvents(container, eventNames) {
  const listeners = [];

  for (const eventName of eventNames) {
    const handler = (event) => {
      const audioId = event.target?.dataset?.audioId ?? null
      if (audioId) stopAlarm(audioId);
      event.target.removeAttribute('data-audio-id');
    };

    container.addEventListener(eventName, handler);
    listeners.push([eventName, handler]);
  }

  return () => {
    for (const [eventName, handler] of listeners) {
      container.removeEventListener(eventName, handler);
    }
  };
}

/** @type {Set<string>} */
const activeAlarms = new Set();

/** @type {number | null} */
let schedulerInterval = null;

async function startAlarm(alarmId = 'default') {
  activeAlarms.add(alarmId);
  if (schedulerInterval !== null || activeAlarms.size === 0) return;

  await unlockAudio();

  // Two pulses per second.
  schedulerInterval = window.setInterval(() => {
    if (activeAlarms.size === 0) {
      stopScheduler();
      return;
    }
    schedulePulse(activeAlarms.size);
  }, 500);
}

function stopAlarm(alarmId = 'default') {
  activeAlarms.delete(alarmId);
  if (activeAlarms.size === 0) {
    stopScheduler();
  }
}

function stopScheduler() {
  if (schedulerInterval !== null) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
}

function createBeep(frequency, startTime, duration, volume = 0.12) {
  if (!audioCtx || !masterGain || audioCtx.state !== 'running') {
    return;
  }

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.onended = () => {
    osc.disconnect();
    gain.disconnect();
  };

  osc.type = 'sine';
  osc.frequency.setValueAtTime(frequency, startTime);

  // Soft attack/release envelope to avoid click artifacts.
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(volume, startTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  osc.connect(gain);
  gain.connect(masterGain);

  osc.start(startTime);
  osc.stop(startTime + duration + 0.02);
}

let pulseStep = 0;

function schedulePulse(activeCount) {
  if (!audioCtx) return;

  const now = audioCtx.currentTime;
  const pulseDuration = 0.18;
  const layerCount = Math.min(activeCount, LAYER_FREQUENCIES.length);
  const accent = pulseStep % 2 === 0 ? 1 : 0.8;

  for (let i = 0; i < layerCount; i++) {
    createBeep(
      LAYER_FREQUENCIES[i],
      now,
      pulseDuration,
      (0.1 + i * 0.03) * accent
    );
  }

  pulseStep += 1;
}
