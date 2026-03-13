import {
  State,
  isFineGrained,
  formatTime,
  setPulseSyncDelay,
  clearPulseSyncDelay,
  TickEngine,
} from '../timer.js';
import { loadComponentFromFiles } from "../load.js";

class CountdownTimer extends HTMLElement {
  /** @type {number} Total duration in deci-seconds */
  #totalDuration;
  /** @type {number} Time remaining in deci-seconds */
  #timeRemaining;
  /** @type {SVGCircleElement} */
  #progressRingEl;
  /** @type {HTMLTimeElement} */
  #timeEl;
  /** @type {HTMLButtonElement} */
  #pauseBtn;
  /** @type {TickEngine} */
  #tickEngine = new TickEngine((decrement) => this.#tick(decrement));

  static observedAttributes = ['duration'];

  get #state() {
    return this.getAttribute('data-state');
  }

  set #state(value) {
    this.setAttribute('data-state', value);
    this.#updatePauseButton();
  }

  async connectedCallback() {
    const { template, sheets } = await loadComponentFromFiles(
      new URL('./countdown-timer.html', import.meta.url),
      new URL('./countdown-timer.css', import.meta.url),
      new URL('../timer.css', import.meta.url),
      new URL('../shared.css', import.meta.url)
    );

    if (!this.shadowRoot) {
      this.attachShadow({ mode: 'open' });
      this.shadowRoot.adoptedStyleSheets = sheets;
      this.shadowRoot.appendChild(template.content.cloneNode(true));
      this.#progressRingEl = this.shadowRoot.getElementById('progress-ring');
      this.#timeEl = this.shadowRoot.getElementById('timer-text');
      this.#pauseBtn = this.shadowRoot.getElementById('pause-btn');

      this.#pauseBtn.addEventListener('click', () => this.#togglePause());
      this.#pauseBtn.disabled = false;

      const removeBtn = this.shadowRoot.getElementById("remove-btn");
      removeBtn.addEventListener('click', () =>
        removeBtn.dispatchEvent(new CustomEvent("widget-removed", { bubbles: true, composed: true }))
      );
      removeBtn.disabled = false;

      this.#initSettings();
    }

    this.#totalDuration = parseInt(this.getAttribute('duration') ?? '300', 10) * 10;
    this.#timeRemaining = this.#totalDuration;

    this.#progressRingEl.style.setProperty(
      '--circumference',
      (2 * Math.PI * this.#progressRingEl.r.baseVal.value).toFixed(4) + "px",
    );

    this.#state = State.PAUSED;
    this.#render();


  }

  disconnectedCallback() {
    this.#tickEngine.stop();
  }

  attributeChangedCallback(name, oldVal, newVal) {
    if (!this.shadowRoot) return;

    if (name === 'duration' && oldVal !== null) {
      this.#totalDuration = parseInt(newVal ?? '300', 10) * 10;
      const durationInput = this.shadowRoot.getElementById('setting-duration');
      if (durationInput) durationInput.value = newVal;
      this.reset();
    }
  }

  #initSettings() {
    const durationInput = this.shadowRoot.getElementById('setting-duration');
    const customChip = this.shadowRoot.getElementById('custom-chip');
    const customFields = this.shadowRoot.querySelector('.custom-fields');
    const presetChips = this.shadowRoot.querySelectorAll('.preset-chip[data-duration]');

    if (durationInput) {
      durationInput.value = this.getAttribute('duration') ?? '300';
      durationInput.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        if (val > 0) {
          this.setAttribute('duration', String(val));
        }
      });
    }

    if (presetChips.length) {
      const currentDuration = this.getAttribute('duration') ?? '300';
      this.#updateActivePreset(presetChips, customChip, customFields, currentDuration);

      for (const chip of presetChips) {
        chip.addEventListener('click', () => {
          const val = chip.dataset.duration;
          this.setAttribute('duration', val);
          if (durationInput) durationInput.value = val;
          this.#updateActivePreset(presetChips, customChip, customFields, val);
        });
      }
    }

    if (customChip) {
      customChip.addEventListener('click', () => {
        this.#showCustomDuration(presetChips, customChip, customFields);
        durationInput?.focus();
      });
    }
  }

  /**
   * Highlight the preset chip matching the current duration, or activate
   * the Custom chip if no preset matches.
   * @param {NodeListOf<HTMLButtonElement>} presetChips
   * @param {HTMLButtonElement | null} customChip
   * @param {HTMLElement | null} customFields
   * @param {string} duration  Duration in seconds.
   */
  #updateActivePreset(presetChips, customChip, customFields, duration) {
    let matched = false;
    for (const chip of presetChips) {
      const match = chip.dataset.duration === duration;
      chip.setAttribute('aria-pressed', String(match));
      if (match) matched = true;
    }

    if (matched) {
      // A preset matched — hide the custom input.
      if (customChip) customChip.setAttribute('aria-pressed', 'false');
      if (customFields) customFields.hidden = true;
    } else {
      // No preset matched — show the custom input.
      this.#showCustomDuration(presetChips, customChip, customFields);
    }
  }

  /**
   * Activate the Custom chip and reveal the duration input.
   * @param {NodeListOf<HTMLButtonElement>} presetChips
   * @param {HTMLButtonElement | null} customChip
   * @param {HTMLElement | null} customFields
   */
  #showCustomDuration(presetChips, customChip, customFields) {
    for (const chip of presetChips) {
      chip.setAttribute('aria-pressed', 'false');
    }
    if (customChip) customChip.setAttribute('aria-pressed', 'true');
    if (customFields) customFields.hidden = false;
  }

  start() {
    if (this.#tickEngine.running) return;
    this.#tickEngine.start(isFineGrained(this.#timeRemaining));
    this.#state = State.RUNNING;
    this.dispatchEvent(new CustomEvent('timer-started', { bubbles: true }));
  }

  pause() {
    this.#tickEngine.stop();
    this.#state = State.PAUSED;
    this.dispatchEvent(new CustomEvent('timer-paused', { bubbles: true }));
  }

  reset() {
    this.pause();
    clearPulseSyncDelay(this);
    this.#timeRemaining = this.#totalDuration;
    this.#render();
  }

  #togglePause() {
    if (this.#state === State.FINISHED) {
      this.reset();
    } else if (this.#state === State.RUNNING) {
      this.pause();
    } else {
      this.start();
    }
  }

  #updatePauseButton() {
    switch (this.#state) {
      case State.RUNNING:
        this.#pauseBtn.textContent = '⏸︎';
        this.#pauseBtn.title = 'Pause timer';
        this.#pauseBtn.setAttribute('aria-label', 'Pause timer');
        break;
      case State.PAUSED:
        this.#pauseBtn.textContent = '▶︎';
        this.#pauseBtn.title = 'Start timer';
        this.#pauseBtn.setAttribute('aria-label', 'Start timer');
        break;
      case State.FINISHED:
        this.#pauseBtn.textContent = '↻';
        this.#pauseBtn.title = 'Restart timer';
        this.#pauseBtn.setAttribute('aria-label', 'Restart timer');
        break;
    }
  }

  /** @param {number} decrement  Deci-seconds to subtract this tick. */
  #tick(decrement) {
    const wasFineGrained = isFineGrained(this.#timeRemaining);
    this.#timeRemaining = Math.max(0, this.#timeRemaining - decrement);

    // Switch interval speed when crossing the 60-second boundary.
    if (!wasFineGrained && isFineGrained(this.#timeRemaining)) {
      this.#tickEngine.start(true);
    }

    this.#render();

    if (this.#timeRemaining <= 0) {
      this.#tickEngine.stop();
      setPulseSyncDelay(this);
      this.#state = State.FINISHED;
      this.dispatchEvent(new CustomEvent('timer-finished', { bubbles: true }));
      this.#render();
    }
  }

  #render() {
    const progress = this.#timeRemaining / this.#totalDuration;
    const { text, datetime, tickDuration } = formatTime(this.#timeRemaining);

    this.#progressRingEl.style.setProperty('--progress', progress);
    this.#progressRingEl.style.setProperty('--tick-duration', tickDuration);
    this.#timeEl.textContent = text;
    this.#timeEl.setAttribute('datetime', datetime);
  }
}

customElements.define('countdown-timer', CountdownTimer);
