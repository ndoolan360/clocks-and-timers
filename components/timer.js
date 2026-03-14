/**
 * Shared timer utilities for countdown-timer and pomodoro-timer components.
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

/** Threshold for switching to fine-grained ticks (60 seconds). */
export const FINE_THRESHOLD_MS = 60_000;

/** Threshold for switching to hour display (60 minutes). */
export const HOUR_THRESHOLD_MS = 3_600_000;

/** Alarm pulse period in milliseconds (2 pulses per second). */
export const ALARM_PULSE_PERIOD_MS = 500;

/**
 * Whether the given time is in the fine-grained (deci-second) phase.
 * @param {number} ms  Time remaining in milliseconds.
 * @returns {boolean}
 */
export function isFineGrained(ms) {
  return ms < FINE_THRESHOLD_MS;
}

/**
 * Convert milliseconds remaining into display text, a datetime attribute value,
 * and the appropriate tick duration for CSS transitions.
 *
 * @param {number} ms  Time remaining in milliseconds.
 * @returns {{ text: string, datetime: string, tickDuration: string }}
 */
export function formatTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const deciseconds = Math.floor((ms % 1000) / 100);

  if (isFineGrained(ms)) {
    // Below 60 s — show SS.D
    return {
      text: `${seconds}.${deciseconds}`,
      datetime: `PT${seconds}.${deciseconds}S`,
      tickDuration: '0.1s',
    };
  }

  if (ms < HOUR_THRESHOLD_MS) {
    // 60 s – 59 min — show MM:SS
    return {
      text: `${minutes}:${String(seconds).padStart(2, '0')}`,
      datetime: `PT${minutes}M${seconds}S`,
      tickDuration: '1s',
    };
  }

  // 60 min and above — show H:MM:SS
  return {
    text: `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`,
    datetime: `PT${hours}H${minutes}M${seconds}S`,
    tickDuration: '1s',
  };
}

/**
 * Set the `--pulse-delay-ms` custom property so the element's CSS pulse
 * animation is synchronised to the current wall-clock phase.
 * @param {HTMLElement} element
 */
export function setPulseSyncDelay(element) {
  const phaseMs = Date.now() % ALARM_PULSE_PERIOD_MS;
  element.style.setProperty('--pulse-delay-ms', (phaseMs * -1).toFixed(0) + "ms");
}

/**
 * Remove the `--pulse-delay-ms` custom property from the element.
 * @param {HTMLElement} element
 */
export function clearPulseSyncDelay(element) {
  element.style.removeProperty('--pulse-delay-ms');
}

/**
 * Manages a tick interval that fires at 1 s normally and switches to 100 ms
 * when fine-grained (deci-second) precision is needed.
 */
export class TickEngine {
  /** @type {number | null} */
  #intervalId = null;

  /** @type {() => void} */
  #onTick;

  /**
   * @param {() => void} onTick  Called each tick.
   */
  constructor(onTick) {
    this.#onTick = onTick;
  }

  /**
   * Start (or restart) the interval.
   * @param {boolean} fineGrained  Whether to tick every 100 ms (true) or
   *     every 1 000 ms (false).
   */
  start(fineGrained) {
    this.stop();
    this.#intervalId = setInterval(this.#onTick, fineGrained ? 100 : 1000);
  }

  /** Stop the interval if one is running. */
  stop() {
    clearInterval(this.#intervalId);
    this.#intervalId = null;
  }

  /** Whether an interval is currently active. */
  get running() {
    return this.#intervalId !== null;
  }
}
