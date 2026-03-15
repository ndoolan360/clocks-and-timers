import { loadWidgetAsShadow, registerButton } from '../shared/widget.js';
import { State, isFineGrained, formatTime, setPulseSyncDelay, clearPulseSyncDelay, TickEngine } from '../shared/timer.js';

const Phase = Object.freeze({ WORK: 'work', SHORT_BREAK: 'short-break', LONG_BREAK: 'long-break' });
const DEFAULTS = Object.freeze({ work: 1500, shortBreak: 300, longBreak: 900, rounds: 4 });
const SVG_NS = 'http://www.w3.org/2000/svg';

class PomodoroTimer extends HTMLElement {
  #work; #shortBreak; #longBreak; #rounds;
  #round = 1;
  #phase = Phase.WORK;
  #phaseDuration;
  #remaining;
  #C = 0; // circumference
  #totalDuration = 0;
  #bgGroup; #fgGroup; #timeEl; #phaseLabel; #pauseBtn; #resetBtn;
  #sbInput = null; #sbLabel = null; #lbLabel = null;
  #startEpoch = null;
  #ready = false;
  #tick = new TickEngine(() => this.#onTick());

  get #single() { return this.#rounds === 1; }
  static observedAttributes = ['work', 'short-break', 'long-break', 'rounds'];

  get #state() { return this.getAttribute('state'); }
  set #state(v) { this.setAttribute('state', v); this.#updateBtn(); }

  get #currentPhase() { return this.#phase; }
  set #currentPhase(v) {
    this.#phase = v;
    this.setAttribute('data-phase', v);
    this.#updatePhaseLabel();
  }

  async connectedCallback() {
    if (!this.shadowRoot) {
      await loadWidgetAsShadow(
        this,
        new URL('./pomodoro-timer.html', import.meta.url),
        new URL('../shared/component.css', import.meta.url),
        new URL('../shared/timer.css', import.meta.url),
        new URL('./pomodoro-timer.css', import.meta.url),
      );

      this.#bgGroup = this.shadowRoot.getElementById('segments-bg');
      this.#fgGroup = this.shadowRoot.getElementById('segments-fg');
      this.#timeEl = this.shadowRoot.getElementById('timer-text');
      this.#phaseLabel = this.shadowRoot.getElementById('phase-label');
      this.#pauseBtn = registerButton(this.shadowRoot, 'pause-btn', () => this.#toggle());
      this.#resetBtn = registerButton(this.shadowRoot, 'reset-btn', () => this.#fullReset());

      this.#initSettings();
    }

    this.#C = 2 * Math.PI * 40;
    this.#readAttrs();
    this.#updateRoundsUI();
    this.#buildSegments();
    this.#initPhase();

    if (this.#startEpoch === null) {
      const st = this.getAttribute('start-time');
      const el = this.getAttribute('elapsed');
      const prior = el ? Number(el) : 0;

      if (st) {
        this.#startEpoch = Number(st);
        const cycleEl = prior + (Date.now() - this.#startEpoch);
        if (cycleEl < this.#totalDuration) {
          this.#restorePhase(cycleEl);
          this.#state = State.RUNNING;
        } else {
          this.#remaining = 0;
          setPulseSyncDelay(this);
          this.removeAttribute('start-time');
          this.#state = State.FINISHED;
          this.dispatchEvent(new CustomEvent('timer-finished', { bubbles: true }));
        }
      } else if (prior > 0) {
        const ps = this.getAttribute('state');
        if (ps === State.FINISHED && prior <= this.#totalDuration) {
          this.#restorePhase(Math.max(0, prior - 1));
          this.#remaining = 0;
          setPulseSyncDelay(this);
          this.#state = State.FINISHED;
          this.dispatchEvent(new CustomEvent('timer-finished', { bubbles: true }));
        } else if (prior < this.#totalDuration) {
          this.#restorePhase(prior);
          this.#state = State.PAUSED;
        } else {
          this.#state = State.PAUSED;
        }
      } else if (this.#state !== State.RUNNING && this.#state !== State.PAUSED) {
        this.#state = State.PAUSED;
      }
    }
    this.#render();
    if (this.#state === State.RUNNING) this.start();
    this.#ready = true;
  }

  disconnectedCallback() { this.#tick.stop(); }
  sync() { if (this.#startEpoch !== null) this.#onTick(); }

  attributeChangedCallback() {
    if (!this.#ready) return;
    this.#readAttrs();
    this.#updateRoundsUI();
    this.#fullReset();
  }

  #readAttrs() {
    this.#work = parseInt(this.getAttribute('work') ?? String(DEFAULTS.work), 10) * 1000;
    this.#shortBreak = parseInt(this.getAttribute('short-break') ?? String(DEFAULTS.shortBreak), 10) * 1000;
    this.#longBreak = parseInt(this.getAttribute('long-break') ?? String(DEFAULTS.longBreak), 10) * 1000;
    this.#rounds = parseInt(this.getAttribute('rounds') ?? String(DEFAULTS.rounds), 10);
  }

  // --- Segments ---

  #buildSegments() {
    this.#bgGroup.innerHTML = '';
    this.#fgGroup.innerHTML = '';
    this.#totalDuration = this.#rounds * this.#work + (this.#rounds - 1) * this.#shortBreak + this.#longBreak;
    let cumArc = 0;
    for (let r = 1; r <= this.#rounds; r++) {
      const wArc = (this.#work / this.#totalDuration) * this.#C;
      cumArc += wArc;
      this.#addPair(Phase.WORK, wArc, cumArc);
      const isLast = r === this.#rounds;
      const bPhase = isLast ? Phase.LONG_BREAK : Phase.SHORT_BREAK;
      const bArc = ((isLast ? this.#longBreak : this.#shortBreak) / this.#totalDuration) * this.#C;
      cumArc += bArc;
      this.#addPair(bPhase, bArc, cumArc);
    }
  }

  #addPair(phase, arc, offset) {
    const da = `${arc.toFixed(4)} ${(this.#C - arc).toFixed(4)}`;
    const off = offset.toFixed(4);
    for (const grp of [this.#bgGroup, this.#fgGroup]) {
      const c = document.createElementNS(SVG_NS, 'circle');
      c.setAttribute('cx', '50'); c.setAttribute('cy', '50'); c.setAttribute('r', '40');
      c.dataset.phase = phase;
      c.dataset.arc = arc.toFixed(4);
      c.style.strokeDasharray = da;
      c.style.strokeDashoffset = off;
      grp.appendChild(c);
    }
  }

  // --- Phase resolution ---

  #resolvePhase(ms) {
    const pair = this.#work + this.#shortBreak;
    const regTotal = (this.#rounds - 1) * pair;
    if (ms < regTotal) {
      const pi = Math.floor(ms / pair);
      const po = ms % pair;
      return po < this.#work
        ? { round: pi + 1, phase: Phase.WORK, offset: po }
        : { round: pi + 1, phase: Phase.SHORT_BREAK, offset: po - this.#work };
    }
    const lo = ms - regTotal;
    return lo < this.#work
      ? { round: this.#rounds, phase: Phase.WORK, offset: lo }
      : { round: this.#rounds, phase: Phase.LONG_BREAK, offset: lo - this.#work };
  }

  #restorePhase(ms) {
    const { round, phase, offset } = this.#resolvePhase(ms);
    this.#round = round;
    this.#phase = phase;
    this.#initPhase();
    this.#remaining = this.#phaseDuration - offset;
  }

  #elapsedBefore() {
    const pair = this.#work + this.#shortBreak;
    const before = this.#round - 1;
    return this.#phase === Phase.WORK ? before * pair : before * pair + this.#work;
  }

  // --- Phase management ---

  #initPhase() {
    this.#phaseDuration = this.#phase === Phase.WORK ? this.#work
      : this.#phase === Phase.SHORT_BREAK ? this.#shortBreak : this.#longBreak;
    this.#remaining = this.#phaseDuration;
    this.#currentPhase = this.#phase; // triggers attribute + label update
  }

  #advancePhase() {
    if (this.#phase === Phase.WORK) {
      this.#phase = this.#round >= this.#rounds ? Phase.LONG_BREAK : Phase.SHORT_BREAK;
    } else {
      if (this.#phase === Phase.LONG_BREAK) this.#round = 1;
      else this.#round += 1;
      this.#phase = Phase.WORK;
    }
    this.#initPhase();
  }

  // --- Playback ---

  start() {
    if (this.#tick.running) return;
    this.#tick.start(isFineGrained(this.#remaining));
    this.#state = State.RUNNING;
    this.dispatchEvent(new CustomEvent('timer-started', { bubbles: true }));
    this.#startEpoch = Date.now() - (this.#phaseDuration - this.#remaining);
    this.setAttribute('start-time', String(this.#startEpoch));
    const prior = this.#elapsedBefore();
    if (prior > 0) this.setAttribute('elapsed', String(prior));
    else this.removeAttribute('elapsed');
  }

  pause() {
    this.#tick.stop();
    this.#state = State.PAUSED;
    this.dispatchEvent(new CustomEvent('timer-paused', { bubbles: true }));
    const elapsed = this.#elapsedBefore() + (this.#phaseDuration - this.#remaining);
    this.#startEpoch = null;
    this.removeAttribute('start-time');
    if (elapsed > 0) this.setAttribute('elapsed', String(elapsed));
  }

  #fullReset() {
    this.#tick.stop();
    this.#startEpoch = null;
    this.removeAttribute('start-time');
    this.removeAttribute('elapsed');
    clearPulseSyncDelay(this);
    this.#round = 1;
    this.#phase = Phase.WORK;
    this.#buildSegments();
    this.#initPhase();
    this.#state = State.PAUSED;
    this.#render();
    this.dispatchEvent(new CustomEvent('timer-paused', { bubbles: true }));
  }

  #toggle() {
    if (this.#state === State.FINISHED) {
      clearPulseSyncDelay(this);
      this.#advancePhase();
      this.#render();
      this.start();
    } else if (this.#state === State.RUNNING) {
      this.pause();
    } else {
      this.start();
    }
  }

  #updateBtn() {
    switch (this.#state) {
      case State.RUNNING:
        this.#pauseBtn.textContent = '⏸︎';
        this.#pauseBtn.title = 'Pause timer';
        this.#pauseBtn.setAttribute('aria-label', 'Pause timer');
        break;
      case State.PAUSED: {
        this.#pauseBtn.textContent = '\u25B6\uFE0E';
        const l = this.#phaseDisplayLabel();
        this.#pauseBtn.title = `Start ${l}`;
        this.#pauseBtn.setAttribute('aria-label', `Start ${l}`);
        break;
      }
      case State.FINISHED: {
        const nl = this.#nextPhaseLabel();
        this.#pauseBtn.textContent = '⏭︎';
        this.#pauseBtn.title = `Move to ${nl}`;
        this.#pauseBtn.setAttribute('aria-label', `Move to ${nl}`);
        break;
      }
    }
  }

  #phaseDisplayLabel() {
    if (this.#phase === Phase.WORK) return 'work';
    if (this.#single) return 'break';
    return this.#phase === Phase.SHORT_BREAK ? 'short break' : 'long break';
  }

  #nextPhaseLabel() {
    if (this.#phase === Phase.WORK) {
      if (this.#single) return 'break';
      return this.#round >= this.#rounds ? 'long break' : 'short break';
    }
    return 'work';
  }

  #updatePhaseLabel() {
    if (!this.#phaseLabel) return;
    if (this.#single) {
      this.#phaseLabel.textContent = this.#phase === Phase.WORK ? 'Work' : 'Break';
      return;
    }
    switch (this.#phase) {
      case Phase.WORK:
        this.#phaseLabel.textContent = `Work ${this.#round}/${this.#rounds}`;
        break;
      case Phase.SHORT_BREAK:
        this.#phaseLabel.textContent = this.#rounds === 2
          ? 'Short break'
          : `Short break ${this.#round}/${this.#rounds - 1}`;
        break;
      case Phase.LONG_BREAK:
        this.#phaseLabel.textContent = 'Long break';
        break;
    }
  }

  #updateRoundsUI() {
    const s = this.#single;
    if (this.#sbInput) this.#sbInput.disabled = s;
    if (this.#sbLabel) this.#sbLabel.textContent = s ? 'Short break (seconds) - not used with 1 round' : 'Short break (seconds)';
    if (this.#lbLabel) this.#lbLabel.textContent = s ? 'Break (seconds)' : 'Long break (seconds)';
  }

  // --- Tick & render ---

  #onTick() {
    const wasFine = isFineGrained(this.#remaining);
    if (this.#startEpoch !== null)
      this.#remaining = Math.max(0, this.#phaseDuration - (Date.now() - this.#startEpoch));
    if (!wasFine && isFineGrained(this.#remaining)) this.#tick.start(true);
    this.#render();
    if (this.#remaining <= 0) {
      this.#tick.stop();
      this.#startEpoch = null;
      this.removeAttribute('start-time');
      this.setAttribute('elapsed', String(this.#elapsedBefore() + this.#phaseDuration));
      setPulseSyncDelay(this);
      this.#state = State.FINISHED;
      this.dispatchEvent(new CustomEvent('timer-finished', { bubbles: true }));
      this.#render();
    }
  }

  #render() {
    const { text, datetime, tickDuration } = formatTime(this.#remaining);
    this.#timeEl.textContent = text;
    this.#timeEl.setAttribute('datetime', datetime);
    this.#updatePhaseLabel();

    const consumed = this.#elapsedBefore() + (this.#phaseDuration - this.#remaining);
    const fgs = this.#fgGroup.children;
    let segEnd = 0;
    for (let i = 0; i < fgs.length; i++) {
      const fg = fgs[i];
      const arc = parseFloat(fg.dataset.arc);
      const segStart = segEnd;
      segEnd += (arc / this.#C) * this.#totalDuration;
      const sc = consumed - segStart;
      const segLen = segEnd - segStart;
      if (sc >= segLen) {
        fg.style.strokeDasharray = `0 ${this.#C.toFixed(4)}`;
        fg.style.transitionDuration = '0s';
      } else if (sc > 0) {
        const vis = arc * (1 - sc / segLen);
        fg.style.strokeDasharray = `${vis.toFixed(4)} ${(this.#C - vis).toFixed(4)}`;
        fg.style.transitionDuration = tickDuration;
      } else {
        fg.style.strokeDasharray = `${arc.toFixed(4)} ${(this.#C - arc).toFixed(4)}`;
        fg.style.transitionDuration = '0s';
      }
    }
  }

  // --- Settings ---

  #initSettings() {
    const wi = this.shadowRoot.getElementById('setting-work');
    const sbi = this.shadowRoot.getElementById('setting-short-break');
    const lbi = this.shadowRoot.getElementById('setting-long-break');
    const ri = this.shadowRoot.getElementById('setting-rounds');
    const customChip = this.shadowRoot.getElementById('custom-chip');
    const customFields = this.shadowRoot.querySelector('.custom-fields');
    const presets = this.shadowRoot.querySelectorAll('.preset-chip[data-work]');

    this.#sbInput = sbi;
    this.#sbLabel = this.shadowRoot.getElementById('short-break-label');
    this.#lbLabel = this.shadowRoot.getElementById('long-break-label');

    if (wi) wi.value = this.getAttribute('work') ?? String(DEFAULTS.work);
    if (sbi) sbi.value = this.getAttribute('short-break') ?? String(DEFAULTS.shortBreak);
    if (lbi) lbi.value = this.getAttribute('long-break') ?? String(DEFAULTS.longBreak);
    if (ri) ri.value = this.getAttribute('rounds') ?? String(DEFAULTS.rounds);

    const apply = () => {
      const w = parseInt(wi?.value, 10);
      const sb = parseInt(sbi?.value, 10);
      const lb = parseInt(lbi?.value, 10);
      const r = parseInt(ri?.value, 10);
      if (w > 0) this.setAttribute('work', String(w));
      if (sb > 0) this.setAttribute('short-break', String(sb));
      if (lb > 0) this.setAttribute('long-break', String(lb));
      if (r > 0) this.setAttribute('rounds', String(r));
    };

    wi?.addEventListener('input', apply);
    sbi?.addEventListener('input', apply);
    lbi?.addEventListener('input', apply);
    ri?.addEventListener('input', apply);

    this.#syncPresets(presets, customChip, customFields);

    for (const chip of presets) {
      chip.addEventListener('click', () => {
        this.setAttribute('work', chip.dataset.work);
        this.setAttribute('short-break', chip.dataset.shortBreak);
        this.setAttribute('long-break', chip.dataset.longBreak);
        this.setAttribute('rounds', chip.dataset.rounds);
        if (wi) wi.value = chip.dataset.work;
        if (sbi) sbi.value = chip.dataset.shortBreak;
        if (lbi) lbi.value = chip.dataset.longBreak;
        if (ri) ri.value = chip.dataset.rounds;
        this.#syncPresets(presets, customChip, customFields);
      });
    }

    customChip?.addEventListener('click', () => {
      this.#showCustom(presets, customChip, customFields);
      wi?.focus();
    });
  }

  #syncPresets(chips, customChip, fields) {
    const w = this.getAttribute('work') ?? String(DEFAULTS.work);
    const sb = this.getAttribute('short-break') ?? String(DEFAULTS.shortBreak);
    const lb = this.getAttribute('long-break') ?? String(DEFAULTS.longBreak);
    const r = this.getAttribute('rounds') ?? String(DEFAULTS.rounds);
    let matched = false;
    for (const c of chips) {
      const m = c.dataset.work === w && c.dataset.shortBreak === sb && c.dataset.longBreak === lb && c.dataset.rounds === r;
      c.setAttribute('aria-pressed', String(m));
      if (m) matched = true;
    }
    if (matched) {
      customChip?.setAttribute('aria-pressed', 'false');
      if (fields) fields.hidden = true;
    } else {
      this.#showCustom(chips, customChip, fields);
    }
  }

  #showCustom(chips, customChip, fields) {
    for (const c of chips) c.setAttribute('aria-pressed', 'false');
    customChip?.setAttribute('aria-pressed', 'true');
    if (fields) fields.hidden = false;
  }
}

customElements.define('pomodoro-timer', PomodoroTimer);
