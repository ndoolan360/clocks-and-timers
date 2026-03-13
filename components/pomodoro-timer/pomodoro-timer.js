import {
  State,
  isFineGrained,
  formatTime,
  setPulseSyncDelay,
  clearPulseSyncDelay,
  TickEngine,
} from '../timer.js';
import { loadComponentFromFiles } from "../load.js";

const Phase = Object.freeze({
  WORK: 'work',
  SHORT_BREAK: 'short-break',
  LONG_BREAK: 'long-break',
});

const DEFAULTS = Object.freeze({
  work: 1500,
  shortBreak: 300,
  longBreak: 900,
  rounds: 4,
});

class PomodoroTimer extends HTMLElement {
  /** @type {number} Work duration in deci-seconds */
  #work;
  /** @type {number} Short break duration in deci-seconds */
  #shortBreak;
  /** @type {number} Long break duration in deci-seconds */
  #longBreak;
  /** @type {number} Work sessions per cycle before long break */
  #rounds;

  /** @type {number} Current round (1-based) */
  #currentRound = 1;
  /** @type {string} Current phase */
  #currentPhase = Phase.WORK;
  /** @type {number} Duration of the current phase in deci-seconds */
  #phaseDuration;
  /** @type {number} Time remaining in current phase in deci-seconds */
  #timeRemaining;

  /** @type {SVGCircleElement} */
  #progressRingEl;
  /** @type {HTMLTimeElement} */
  #timeEl;
  /** @type {HTMLElement} */
  #phaseLabelEl;
  /** @type {HTMLButtonElement} */
  #pauseBtn;
  /** @type {HTMLButtonElement} */
  #resetBtn;

  // Settings elements cached for #updateRoundsUI
  /** @type {HTMLInputElement | null} */
  #shortBreakInput = null;
  /** @type {HTMLElement | null} */
  #shortBreakLabel = null;
  /** @type {HTMLElement | null} */
  #longBreakLabel = null;

  /** @type {TickEngine} */
  #tickEngine = new TickEngine((decrement) => this.#tick(decrement));

  /** Whether the timer is in single-round mode. */
  get #isSingleRound() {
    return this.#rounds === 1;
  }

  static observedAttributes = ['work', 'short-break', 'long-break', 'rounds'];

  get #state() {
    return this.getAttribute('data-state');
  }

  set #state(value) {
    this.setAttribute('data-state', value);
    this.#updatePauseButton();
  }

  get #phase() {
    return this.#currentPhase;
  }

  set #phase(value) {
    this.#currentPhase = value;
    this.setAttribute('data-phase', value);
    this.#updatePhaseLabel();
  }

  async connectedCallback() {
    const { template, sheets } = await loadComponentFromFiles(
      new URL('./pomodoro-timer.html', import.meta.url),
      new URL('./pomodoro-timer.css', import.meta.url),
      new URL('../timer.css', import.meta.url),
      new URL('../shared.css', import.meta.url)
    );

    if (!this.shadowRoot) {
      this.attachShadow({ mode: 'open' });
      this.shadowRoot.adoptedStyleSheets = sheets;
      this.shadowRoot.appendChild(template.content.cloneNode(true));

      this.#progressRingEl = this.shadowRoot.getElementById('progress-ring');
      this.#timeEl = this.shadowRoot.getElementById('timer-text');
      this.#phaseLabelEl = this.shadowRoot.getElementById('phase-label');
      this.#pauseBtn = this.shadowRoot.getElementById('pause-btn');
      this.#resetBtn = this.shadowRoot.getElementById('reset-btn');

      this.#pauseBtn.addEventListener('click', () => this.#togglePause());
      this.#pauseBtn.disabled = false;

      this.#resetBtn.addEventListener('click', () => this.#fullReset());
      this.#resetBtn.disabled = false;

      const removeBtn = this.shadowRoot.getElementById('remove-btn');
      removeBtn.addEventListener('click', () =>
        removeBtn.dispatchEvent(new CustomEvent('widget-removed', { bubbles: true, composed: true }))
      );
      removeBtn.disabled = false;

      this.#initSettings();
    }

    this.#readAttributes();
    this.#updateRoundsUI();
    this.#initPhase();

    this.#progressRingEl.style.setProperty(
      '--circumference',
      (2 * Math.PI * this.#progressRingEl.r.baseVal.value).toFixed(4) + 'px',
    );

    this.#state = State.PAUSED;
    this.#render();
  }

  disconnectedCallback() {
    this.#tickEngine.stop();
  }

  attributeChangedCallback(_, oldVal, __) {
    if (!this.shadowRoot) return;
    if (oldVal === null) return;

    this.#readAttributes();
    this.#updateRoundsUI();
    this.#fullReset();
  }

  /** Read duration attributes into internal deci-second fields. */
  #readAttributes() {
    this.#work = parseInt(this.getAttribute('work') ?? String(DEFAULTS.work), 10) * 10;
    this.#shortBreak = parseInt(this.getAttribute('short-break') ?? String(DEFAULTS.shortBreak), 10) * 10;
    this.#longBreak = parseInt(this.getAttribute('long-break') ?? String(DEFAULTS.longBreak), 10) * 10;
    this.#rounds = parseInt(this.getAttribute('rounds') ?? String(DEFAULTS.rounds), 10);
  }

  /** Set up the current phase duration and time remaining. */
  #initPhase() {
    switch (this.#currentPhase) {
      case Phase.WORK:
        this.#phaseDuration = this.#work;
        break;
      case Phase.SHORT_BREAK:
        this.#phaseDuration = this.#shortBreak;
        break;
      case Phase.LONG_BREAK:
        this.#phaseDuration = this.#longBreak;
        break;
    }
    this.#timeRemaining = this.#phaseDuration;
    this.#phase = this.#currentPhase; // triggers attribute + label update
  }

  /**
   * Determine the next phase and advance to it.
   * Work → short break (or long break if last round)
   * Any break → next work round
   */
  #advancePhase() {
    if (this.#currentPhase === Phase.WORK) {
      // After work: long break if we just finished the last round, else short break
      if (this.#currentRound >= this.#rounds) {
        this.#currentPhase = Phase.LONG_BREAK;
      } else {
        this.#currentPhase = Phase.SHORT_BREAK;
      }
    } else {
      // After any break: start next work round
      if (this.#currentPhase === Phase.LONG_BREAK) {
        // Cycle complete — reset to round 1
        this.#currentRound = 1;
      } else {
        this.#currentRound += 1;
      }
      this.#currentPhase = Phase.WORK;
    }
    this.#initPhase();
  }

  // --- Settings -----------------------------------------------------------

  #initSettings() {
    const workInput = this.shadowRoot.getElementById('setting-work');
    const shortBreakInput = this.shadowRoot.getElementById('setting-short-break');
    const longBreakInput = this.shadowRoot.getElementById('setting-long-break');
    const roundsInput = this.shadowRoot.getElementById('setting-rounds');
    const customChip = this.shadowRoot.getElementById('custom-chip');
    const customFields = this.shadowRoot.querySelector('.custom-fields');
    const presetChips = this.shadowRoot.querySelectorAll('.preset-chip[data-work]');

    // Cache elements for #updateRoundsUI
    this.#shortBreakInput = shortBreakInput;
    this.#shortBreakLabel = this.shadowRoot.getElementById('short-break-label');
    this.#longBreakLabel = this.shadowRoot.getElementById('long-break-label');

    // Populate inputs from current attributes
    if (workInput) workInput.value = this.getAttribute('work') ?? String(DEFAULTS.work);
    if (shortBreakInput) shortBreakInput.value = this.getAttribute('short-break') ?? String(DEFAULTS.shortBreak);
    if (longBreakInput) longBreakInput.value = this.getAttribute('long-break') ?? String(DEFAULTS.longBreak);
    if (roundsInput) roundsInput.value = this.getAttribute('rounds') ?? String(DEFAULTS.rounds);

    // Input change handlers
    const applyCustom = () => {
      const w = parseInt(workInput?.value, 10);
      const sb = parseInt(shortBreakInput?.value, 10);
      const lb = parseInt(longBreakInput?.value, 10);
      const r = parseInt(roundsInput?.value, 10);
      if (w > 0) this.setAttribute('work', String(w));
      if (sb > 0) this.setAttribute('short-break', String(sb));
      if (lb > 0) this.setAttribute('long-break', String(lb));
      if (r > 0) this.setAttribute('rounds', String(r));
    };

    workInput?.addEventListener('input', applyCustom);
    shortBreakInput?.addEventListener('input', applyCustom);
    longBreakInput?.addEventListener('input', applyCustom);
    roundsInput?.addEventListener('input', applyCustom);

    // Determine initial active preset
    this.#updateActivePreset(presetChips, customChip, customFields);

    // Preset chip handlers
    for (const chip of presetChips) {
      chip.addEventListener('click', () => {
        const w = chip.dataset.work;
        const sb = chip.dataset.shortBreak;
        const lb = chip.dataset.longBreak;
        const r = chip.dataset.rounds;

        this.setAttribute('work', w);
        this.setAttribute('short-break', sb);
        this.setAttribute('long-break', lb);
        this.setAttribute('rounds', r);

        if (workInput) workInput.value = w;
        if (shortBreakInput) shortBreakInput.value = sb;
        if (longBreakInput) longBreakInput.value = lb;
        if (roundsInput) roundsInput.value = r;

        this.#updateActivePreset(presetChips, customChip, customFields);
      });
    }

    // Custom chip handler
    if (customChip) {
      customChip.addEventListener('click', () => {
        this.#showCustomFields(presetChips, customChip, customFields);
        workInput?.focus();
      });
    }
  }

  /**
   * Check if current attributes match a preset and highlight accordingly.
   * @param {NodeListOf<HTMLButtonElement>} presetChips
   * @param {HTMLButtonElement | null} customChip
   * @param {HTMLElement | null} customFields
   */
  #updateActivePreset(presetChips, customChip, customFields) {
    const w = this.getAttribute('work') ?? String(DEFAULTS.work);
    const sb = this.getAttribute('short-break') ?? String(DEFAULTS.shortBreak);
    const lb = this.getAttribute('long-break') ?? String(DEFAULTS.longBreak);
    const r = this.getAttribute('rounds') ?? String(DEFAULTS.rounds);

    let matched = false;
    for (const chip of presetChips) {
      const match =
        chip.dataset.work === w &&
        chip.dataset.shortBreak === sb &&
        chip.dataset.longBreak === lb &&
        chip.dataset.rounds === r;
      chip.setAttribute('aria-pressed', String(match));
      if (match) matched = true;
    }

    if (matched) {
      if (customChip) customChip.setAttribute('aria-pressed', 'false');
      if (customFields) customFields.hidden = true;
    } else {
      this.#showCustomFields(presetChips, customChip, customFields);
    }
  }

  /**
   * Activate the Custom chip and reveal the custom inputs.
   * @param {NodeListOf<HTMLButtonElement>} presetChips
   * @param {HTMLButtonElement | null} customChip
   * @param {HTMLElement | null} customFields
   */
  #showCustomFields(presetChips, customChip, customFields) {
    for (const chip of presetChips) {
      chip.setAttribute('aria-pressed', 'false');
    }
    if (customChip) customChip.setAttribute('aria-pressed', 'true');
    if (customFields) customFields.hidden = false;
  }

  // --- Playback controls --------------------------------------------------

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

  /**
   * Full reset: stop everything, return to work phase round 1.
   */
  #fullReset() {
    this.#tickEngine.stop();
    clearPulseSyncDelay(this);
    this.#currentRound = 1;
    this.#currentPhase = Phase.WORK;
    this.#initPhase();
    this.#state = State.PAUSED;
    this.#render();
    this.dispatchEvent(new CustomEvent('timer-paused', { bubbles: true }));
  }

  #togglePause() {
    if (this.#state === State.FINISHED) {
      // Advance to the next phase
      clearPulseSyncDelay(this);
      this.#advancePhase();
      this.#state = State.PAUSED;
      this.#render();
      this.dispatchEvent(new CustomEvent('timer-paused', { bubbles: true }));
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
      case State.PAUSED: {
        this.#pauseBtn.textContent = '▶︎';
        const label = this.#currentPhaseLabel();
        this.#pauseBtn.title = `Start ${label}`;
        this.#pauseBtn.setAttribute('aria-label', `Start ${label}`);
        break;
      }
      case State.FINISHED: {
        // Show what the NEXT phase will be
        const nextLabel = this.#nextPhaseLabel();
        this.#pauseBtn.textContent = '⏭︎';
        this.#pauseBtn.title = `Move to ${nextLabel}`;
        this.#pauseBtn.setAttribute('aria-label', `Move to ${nextLabel}`);
        break;
      }
    }
  }

  /**
   * Return a human-readable label for the current phase.
   * @returns {string}
   */
  #currentPhaseLabel() {
    if (this.#currentPhase === Phase.WORK) return 'work';
    if (this.#isSingleRound) return 'break';
    if (this.#currentPhase === Phase.SHORT_BREAK) return 'short break';
    return 'long break';
  }

  /**
   * Return a human-readable label for the phase that will follow the current one.
   * @returns {string}
   */
  #nextPhaseLabel() {
    if (this.#currentPhase === Phase.WORK) {
      if (this.#isSingleRound) return 'break';
      return this.#currentRound >= this.#rounds ? 'long break' : 'short break';
    }
    return 'work';
  }

  #updatePhaseLabel() {
    if (!this.#phaseLabelEl) return;

    if (this.#isSingleRound) {
      // Single round — no counter, no short/long distinction
      this.#phaseLabelEl.textContent =
        this.#currentPhase === Phase.WORK ? 'Work' : 'Break';
      return;
    }

    switch (this.#currentPhase) {
      case Phase.WORK:
        this.#phaseLabelEl.textContent = `Work ${this.#currentRound}/${this.#rounds}`;
        break;
      case Phase.SHORT_BREAK:
        if (this.#rounds === 2) {
          // Special case for 2-round mode: only one short break, so no round counter
          this.#phaseLabelEl.textContent = 'Short break';
        } else {
          this.#phaseLabelEl.textContent = `Short break ${this.#currentRound}/${this.#rounds - 1}`;
        }
        break;
      case Phase.LONG_BREAK:
        this.#phaseLabelEl.textContent = 'Long break';
        break;
    }
  }

  /**
   * Update the settings UI to reflect single-round vs multi-round mode.
   * When rounds = 1, short break is never used — disable it and simplify labels.
   */
  #updateRoundsUI() {
    const single = this.#isSingleRound;

    if (this.#shortBreakInput) {
      this.#shortBreakInput.disabled = single;
    }
    if (this.#shortBreakLabel) {
      this.#shortBreakLabel.textContent = single
        ? 'Short break (seconds) — not used with 1 round'
        : 'Short break (seconds)';
    }
    if (this.#longBreakLabel) {
      this.#longBreakLabel.textContent = single
        ? 'Break (seconds)'
        : 'Long break (seconds)';
    }
  }

  // --- Tick and render ----------------------------------------------------

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
    const progress = this.#timeRemaining / this.#phaseDuration;
    const { text, datetime, tickDuration } = formatTime(this.#timeRemaining);

    this.#progressRingEl.style.setProperty('--progress', progress);
    this.#progressRingEl.style.setProperty('--tick-duration', tickDuration);
    this.#timeEl.textContent = text;
    this.#timeEl.setAttribute('datetime', datetime);

    this.#updatePhaseLabel();
  }
}

customElements.define('pomodoro-timer', PomodoroTimer);
