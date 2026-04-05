import { loadWidgetAsShadow, registerButton, toggleHidden } from '../shared/widget.js';
import { State, isFineGrained, formatTime, setPulseSyncDelay, clearPulseSyncDelay, TickEngine } from '../shared/timer.js';

class CountdownTimer extends HTMLElement {
  #duration;      // total duration in ms
  #remaining;     // time remaining in ms
  #ring;          // #progress-ring element
  #timeEl;        // #timer-text element
  #pauseBtn;
  #startEpoch = null;
  #tick = new TickEngine(() => this.#onTick());

  static observedAttributes = ['duration'];

  get #state() { return this.getAttribute('state'); }
  set #state(v) { this.setAttribute('state', v); this.#updateBtn(); }

  async connectedCallback() {
    if (!this.shadowRoot) {
      await loadWidgetAsShadow(
        this,
        new URL('./countdown-timer.html', import.meta.url),
        new URL('../shared/component.css', import.meta.url),
        new URL('../shared/timer.css', import.meta.url),
        new URL('./countdown-timer.css', import.meta.url),
      );

      this.#ring = this.shadowRoot.getElementById('progress-ring');
      this.#timeEl = this.shadowRoot.getElementById('timer-text');
      this.#pauseBtn = registerButton(this.shadowRoot, 'pause-btn', () => this.#toggle());

      this.#initSettings();
    }

    this.#duration = parseInt(this.getAttribute('duration') ?? '300', 10) * 1000;
    this.#remaining = this.#duration;
    this.#ring.style.setProperty('--circumference',
      (2 * Math.PI * this.#ring.r.baseVal.value).toFixed(4) + 'px');

    if (this.#startEpoch === null) {
      const startTime = this.getAttribute('start-time');
      const elapsed = this.getAttribute('elapsed');
      if (startTime) {
        this.#startEpoch = Number(startTime);
        this.#remaining = Math.max(0, this.#duration - (Date.now() - this.#startEpoch));
        if (this.#remaining <= 0) {
          setPulseSyncDelay(this);
          this.#state = State.FINISHED;
          this.dispatchEvent(new CustomEvent('timer-finished', { bubbles: true }));
        } else {
          this.#state = State.RUNNING;
        }
      } else if (elapsed) {
        this.#remaining = Math.max(0, this.#duration - Number(elapsed));
        this.#state = State.PAUSED;
      } else {
        this.#state = State.PAUSED;
      }
      this.#render();
      if (this.#state === State.RUNNING) this.start();
    }
  }

  disconnectedCallback() { this.#tick.stop(); }

  sync() { if (this.#startEpoch !== null) this.#onTick(); }

  attributeChangedCallback(name, oldVal) {
    if (!this.shadowRoot || oldVal === null) return;
    if (name === 'duration') {
      this.#duration = parseInt(this.getAttribute('duration') ?? '300', 10) * 1000;
      const input = this.shadowRoot.getElementById('setting-duration');
      if (input) input.value = this.getAttribute('duration');
      this.reset();
    }
  }

  start() {
    if (this.#tick.running) return;
    this.#tick.start(isFineGrained(this.#remaining));
    this.#state = State.RUNNING;
    this.dispatchEvent(new CustomEvent('timer-started', { bubbles: true }));
    this.#startEpoch = Date.now() - (this.#duration - this.#remaining);
    this.setAttribute('start-time', String(this.#startEpoch));
    this.removeAttribute('elapsed');
  }

  pause() {
    this.#tick.stop();
    this.#state = State.PAUSED;
    this.dispatchEvent(new CustomEvent('timer-paused', { bubbles: true }));
    const elapsed = this.#duration - this.#remaining;
    this.#startEpoch = null;
    this.removeAttribute('start-time');
    if (elapsed > 0) this.setAttribute('elapsed', String(elapsed));
  }

  reset() {
    this.pause();
    clearPulseSyncDelay(this);
    this.#remaining = this.#duration;
    this.removeAttribute('elapsed');
    this.#render();
  }

  #toggle() {
    if (this.#state === State.FINISHED) this.reset();
    else if (this.#state === State.RUNNING) this.pause();
    else this.start();
  }

  #updateBtn() {
    const [icon, label] = {
      [State.RUNNING]: ['⏸︎', 'Pause timer'],
      [State.PAUSED]: ['▶︎', 'Start timer'],
      [State.FINISHED]: ['↻', 'Restart timer'],
      default: ['▶︎', 'Start timer'],
    }[this.#state ?? 'default'];
    this.#pauseBtn.textContent = icon;
    this.#pauseBtn.title = label;
    this.#pauseBtn.setAttribute('aria-label', label);
  }

  #onTick() {
    const wasFine = isFineGrained(this.#remaining);
    if (this.#startEpoch !== null)
      this.#remaining = Math.max(0, this.#duration - (Date.now() - this.#startEpoch));
    if (!wasFine && isFineGrained(this.#remaining)) this.#tick.start(true);
    this.#render();
    if (this.#remaining <= 0) {
      this.#tick.stop();
      this.#startEpoch = null;
      this.removeAttribute('start-time');
      this.removeAttribute('elapsed');
      setPulseSyncDelay(this);
      this.#state = State.FINISHED;
      this.dispatchEvent(new CustomEvent('timer-finished', { bubbles: true }));
      this.#render();
    }
  }

  #render() {
    const { text, datetime, tickDuration } = formatTime(this.#remaining);
    this.#ring.style.setProperty('--progress', this.#remaining / this.#duration);
    this.#ring.style.setProperty('--tick-duration', tickDuration);
    this.#timeEl.textContent = text;
    this.#timeEl.setAttribute('datetime', datetime);
  }

  #initSettings() {
    const durationInput = this.shadowRoot.getElementById('setting-duration');
    const customChip = this.shadowRoot.getElementById('custom-chip');
    const customFields = this.shadowRoot.querySelector('.custom-fields');
    const presetChips = this.shadowRoot.querySelectorAll('.preset-chips>button[data-duration]');

    if (durationInput) {
      durationInput.value = this.getAttribute('duration') ?? '300';
      durationInput.addEventListener('input', e => {
        const val = parseInt(e.target.value, 10);
        if (val > 0) this.setAttribute('duration', String(val));
      });
    }

    if (presetChips.length) {
      const cur = this.getAttribute('duration') ?? '300';
      this.#syncPresets(presetChips, customChip, customFields, cur);
      for (const chip of presetChips) {
        chip.addEventListener('click', () => {
          const val = chip.dataset.duration;
          this.setAttribute('duration', val);
          if (durationInput) durationInput.value = val;
          this.#syncPresets(presetChips, customChip, customFields, val);
        });
      }
    }

    customChip?.addEventListener('click', () => {
      this.#showCustom(presetChips, customChip, customFields);
      durationInput?.focus();
    });
  }

  #syncPresets(chips, customChip, fields, duration) {
    let matched = false;
    for (const c of chips) {
      const m = c.dataset.duration === duration;
      c.setAttribute('aria-pressed', String(m));
      if (m) matched = true;
    }
    if (matched) {
      customChip?.setAttribute('aria-pressed', 'false');
      if (fields) toggleHidden(fields, true);
    } else {
      this.#showCustom(chips, customChip, fields);
    }
  }

  #showCustom(chips, customChip, fields) {
    for (const c of chips) c.setAttribute('aria-pressed', 'false');
    customChip?.setAttribute('aria-pressed', 'true');
    if (fields) toggleHidden(fields, false);
  }
}

customElements.define('countdown-timer', CountdownTimer);
