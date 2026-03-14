import { loadComponentFromFiles } from "../load.js";

/** Main dial geometry. */
const MAIN_CX = 50;
const MAIN_CY = 40;
const MAIN_NUM_R = 31;
const MAIN_NUM_COUNT = 12;
const MAIN_NUM_STEP = 5;
const MAIN_NUM_MAX = 60;

/** Sub-dial geometry. */
const SUB_CX = 50;
const SUB_CY = 25;
const SUB_NUM_R = 6.5;
const SUB_NUM_COUNT = 10;
const SUB_NUM_STEP = 3;
const SUB_NUM_MAX = 30;

/** Full revolution of the minute hand in milliseconds (30 minutes). */
const MINUTE_REVOLUTION_MS = 30 * 60 * 1000;

/** Full revolution of the second hand in milliseconds (60 seconds). */
const SECOND_REVOLUTION_MS = 60 * 1000;

class StopwatchClock extends HTMLElement {
  /** @type {number} Elapsed time in milliseconds */
  #elapsed = 0;
  /** @type {number | null} */
  #startEpoch = null;
  /** @type {number | null} */
  #intervalId = null;
  /** @type {SVGLineElement} */
  #secondHand;
  /** @type {SVGLineElement} */
  #minuteHand;
  /** @type {HTMLTimeElement} */
  #timeEl;
  /** @type {HTMLButtonElement} */
  #pauseBtn;

  get #state() {
    return this.getAttribute('state');
  }

  set #state(value) {
    this.setAttribute('state', value);
    this.#updatePauseButton();
  }

  async connectedCallback() {
    const { template, sheets } = await loadComponentFromFiles(
      new URL('./stopwatch-clock.html', import.meta.url),
      new URL('../component.css', import.meta.url),
      new URL('../clock.css', import.meta.url),
      new URL('./stopwatch-clock.css', import.meta.url)
    );

    if (!this.shadowRoot) {
      this.attachShadow({ mode: 'open' });
      this.shadowRoot.adoptedStyleSheets = sheets;
      this.shadowRoot.appendChild(template.content.cloneNode(true));

      this.#secondHand = this.shadowRoot.getElementById('second-hand');
      this.#minuteHand = this.shadowRoot.getElementById('minute-hand');
      this.#timeEl = this.shadowRoot.getElementById('clock-text');
      this.#pauseBtn = this.shadowRoot.getElementById('pause-btn');

      // Position dial numbers
      this.#positionDialNumbers('main-num', MAIN_NUM_COUNT, MAIN_NUM_STEP, MAIN_NUM_MAX, MAIN_CX, MAIN_CY, MAIN_NUM_R);
      this.#positionDialNumbers('minute-num', SUB_NUM_COUNT, SUB_NUM_STEP, SUB_NUM_MAX, SUB_CX, SUB_CY, SUB_NUM_R);

      // Controls
      this.#pauseBtn.addEventListener('click', () => this.#togglePause());
      this.#pauseBtn.disabled = false;

      const resetBtn = this.shadowRoot.getElementById('reset-btn');
      resetBtn.addEventListener('click', () => this.#reset());
      resetBtn.disabled = false;

      const removeBtn = this.shadowRoot.getElementById('remove-btn');
      removeBtn.addEventListener('click', () =>
        removeBtn.dispatchEvent(new CustomEvent('widget-removed', { bubbles: true, composed: true }))
      );
      removeBtn.disabled = false;
    }

    if (this.#startEpoch !== null) {
      this.#elapsed = Date.now() - this.#startEpoch;
      this.#startInterval();
      this.#state = 'running';
    } else {
      const startTime = this.getAttribute('start-time');
      const elapsed = this.getAttribute('elapsed');
      if (startTime) {
        this.#startEpoch = Number(startTime);
        this.#elapsed = Date.now() - this.#startEpoch;
        this.#startInterval();
        this.#state = 'running';
      } else if (elapsed) {
        this.#elapsed = Number(elapsed);
        this.#state = 'paused';
      } else {
        this.#state = 'paused';
      }
      this.#initHands();
    }
    this.#render();
  }

  disconnectedCallback() {
    this.#stopInterval();
  }

  /** Re-sync hands and display to the wall clock. */
  sync() {
    if (this.#startEpoch === null) return;
    this.#elapsed = Date.now() - this.#startEpoch;
    this.#initHands();
    this.#render();
  }

  /**
   * Position number labels evenly around a dial.
   *
   * @param {string} idPrefix  Element ID prefix (e.g. 'main-num' → #main-num-0, #main-num-1 …).
   * @param {number} count     How many numbers to place.
   * @param {number} step      Value increment per position (e.g. 5 for 5, 10, 15 …).
   * @param {number} max       The value shown at 12-o'clock (e.g. 60 wraps 0 → 60).
   * @param {number} cx        Centre x of the dial.
   * @param {number} cy        Centre y of the dial.
   * @param {number} r         Radius at which numbers are placed.
   */
  #positionDialNumbers(idPrefix, count, step, max, cx, cy, r) {
    for (let i = 0; i < count; i++) {
      const el = this.shadowRoot.getElementById(`${idPrefix}-${i}`);
      if (!el) continue;

      const angle = (i / count) * 2 * Math.PI - Math.PI / 2;
      el.setAttribute('x', (cx + r * Math.cos(angle)).toFixed(2));
      el.setAttribute('y', (cy + r * Math.sin(angle)).toFixed(2));
      el.textContent = String(i * step || max);
    }
  }

  /**
   * Compute the current second-hand angle from elapsed milliseconds.
   * @returns {number} Degrees (0–360).
   */
  #secondHandDeg() {
    return (this.#elapsed % SECOND_REVOLUTION_MS) / SECOND_REVOLUTION_MS * 360;
  }

  /**
   * Compute the current minute-hand angle from elapsed milliseconds.
   * @returns {number} Degrees (0–360).
   */
  #minuteHandDeg() {
    return (this.#elapsed % MINUTE_REVOLUTION_MS) / MINUTE_REVOLUTION_MS * 360;
  }

  /**
   * Set a hand's --start custom property and restart the CSS animation
   * from the given angle. Kill animation → set --start → force reflow →
   * re-enable animation.
   * @param {SVGElement} hand
   * @param {number} deg
   */
  #initHand(hand, deg) {
    hand.style.animation = 'none';
    void this.shadowRoot.host.offsetWidth;
    hand.style.setProperty('--start', `${deg.toFixed(2)}deg`);
    hand.style.animation = '';
  }

  /**
   * Initialise both hands to their current elapsed positions.
   */
  #initHands() {
    this.#initHand(this.#secondHand, this.#secondHandDeg());
    this.#initHand(this.#minuteHand, this.#minuteHandDeg());
  }

  #startInterval() {
    if (this.#intervalId !== null) return;

    // (Re)start the CSS sweep animations from current positions
    this.#initHands();

    this.#intervalId = setInterval(() => this.#tick(), 100);
  }

  #stopInterval() {
    if (this.#intervalId !== null) {
      clearInterval(this.#intervalId);
      this.#intervalId = null;
    }
  }

  #togglePause() {
    if (this.#state === 'running') {
      this.#stopInterval();
      this.#initHands();
      this.#startEpoch = null;
      this.removeAttribute('start-time');
      if (this.#elapsed > 0) {
        this.setAttribute('elapsed', String(this.#elapsed));
      }
      this.#state = 'paused';
    } else {
      this.#startEpoch = Date.now() - this.#elapsed;
      this.setAttribute('start-time', String(this.#startEpoch));
      this.removeAttribute('elapsed');
      this.#startInterval();
      this.#state = 'running';
    }
  }

  #reset() {
    this.#stopInterval();
    this.#elapsed = 0;
    this.#startEpoch = null;
    this.#initHands();
    this.removeAttribute('start-time');
    this.removeAttribute('elapsed');
    this.#state = 'paused';
    this.#render();
  }

  #tick() {
    if (this.#startEpoch !== null) {
      this.#elapsed = Date.now() - this.#startEpoch;
    }
    this.#render();
  }

  #render() {
    const totalSeconds = Math.floor(this.#elapsed / 1000);
    const ds = Math.floor((this.#elapsed % 1000) / 100);
    const seconds = totalSeconds % 60;
    const totalMinutes = Math.floor(totalSeconds / 60);
    const minutes = totalMinutes % 60;
    const hours = Math.floor(totalMinutes / 60);

    let text;
    let datetime;
    if (hours > 0) {
      text = `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${ds}`;
      datetime = `PT${hours}H${minutes}M${seconds}.${ds}S`;
    } else {
      text = `${minutes}:${String(seconds).padStart(2, '0')}.${ds}`;
      datetime = `PT${minutes}M${seconds}.${ds}S`;
    }

    this.#timeEl.textContent = text;
    this.#timeEl.setAttribute('datetime', datetime);
  }

  #updatePauseButton() {
    if (this.#state === 'running') {
      this.#pauseBtn.textContent = '⏸︎';
      this.#pauseBtn.title = 'Pause stopwatch';
      this.#pauseBtn.setAttribute('aria-label', 'Pause stopwatch');
    } else {
      this.#pauseBtn.textContent = '▶︎';
      this.#pauseBtn.title = 'Start stopwatch';
      this.#pauseBtn.setAttribute('aria-label', 'Start stopwatch');
    }
  }
}

customElements.define('stopwatch-clock', StopwatchClock);
