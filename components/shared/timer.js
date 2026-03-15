/**
 * Shared timer utilities for countdown and pomodoro timer components.
 * Pure utility — no DOM assumptions beyond what's passed in.
 *
 * All time values are in milliseconds unless otherwise noted.
 */

/** Timer state constants. */
export const State = Object.freeze({
  RUNNING: 'running',
  PAUSED: 'paused',
  FINISHED: 'finished',
});

/** Threshold below which we display decisecond precision (60 s). */
export const FINE_THRESHOLD_MS = 60_000;

/** Threshold at which we switch to H:MM:SS display (60 min). */
export const HOUR_THRESHOLD_MS = 3_600_000;

/** Alarm pulse period — two pulses per second. */
export const ALARM_PULSE_PERIOD_MS = 500;

/**
 * Whether the given time is in the fine-grained (decisecond) phase.
 * @param {number} ms - Time remaining in milliseconds.
 * @returns {boolean}
 */
export function isFineGrained(ms) {
  return ms < FINE_THRESHOLD_MS;
}

/**
 * Convert milliseconds into display text, an ISO 8601 duration for the
 * `datetime` attribute, and the appropriate CSS tick duration.
 *
 * | Range          | text       | datetime        | tickDuration |
 * |----------------|------------|-----------------|--------------|
 * | < 60 s         | `S.D`      | `PTS.DS`        | `0.1s`       |
 * | 60 s – < 60 m  | `M:SS`     | `PTMMS`         | `1s`         |
 * | ≥ 60 m         | `H:MM:SS`  | `PTHMMS`        | `1s`         |
 *
 * @param {number} ms - Time remaining in milliseconds.
 * @returns {{ text: string, datetime: string, tickDuration: string }}
 */
export function formatTime(ms) {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ds = Math.floor((ms % 1000) / 100);

  if (ms < FINE_THRESHOLD_MS)
    return { text: `${s}.${ds}`, datetime: `PT${s}.${ds}S`, tickDuration: '0.1s' };
  if (ms < HOUR_THRESHOLD_MS)
    return { text: `${m}:${String(s).padStart(2, '0')}`, datetime: `PT${m}M${s}S`, tickDuration: '1s' };
  return { text: `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`, datetime: `PT${h}H${m}M${s}S`, tickDuration: '1s' };
}

/**
 * Set `--pulse-delay-ms` so the element's CSS pulse animation is
 * synchronised to the current wall-clock phase.
 * @param {HTMLElement} element
 */
export function setPulseSyncDelay(element) {
  element.style.setProperty('--pulse-delay-ms', -(Date.now() % ALARM_PULSE_PERIOD_MS) + 'ms');
}

/**
 * Remove the `--pulse-delay-ms` custom property.
 * @param {HTMLElement} element
 */
export function clearPulseSyncDelay(element) {
  element.style.removeProperty('--pulse-delay-ms');
}

/**
 * Manages a tick interval that fires every 1 s normally and every 100 ms
 * when fine-grained (decisecond) precision is needed.
 */
export class TickEngine {
  /** @type {number | null} */
  #id = null;

  /** @type {() => void} */
  #onTick;

  /** @param {() => void} onTick - Callback invoked on each tick. */
  constructor(onTick) {
    this.#onTick = onTick;
  }

  /**
   * Start (or restart) the interval.
   * @param {boolean} fineGrained - `true` for 100 ms ticks, `false` for 1 s.
   */
  start(fineGrained) {
    this.stop();
    this.#id = setInterval(this.#onTick, fineGrained ? 100 : 1000);
  }

  /** Stop the interval if one is running. */
  stop() {
    clearInterval(this.#id);
    this.#id = null;
  }

  /** Whether an interval is currently active. */
  get running() {
    return this.#id !== null;
  }
}
