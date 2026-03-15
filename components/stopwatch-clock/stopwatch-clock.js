import { loadWidgetAsShadow, registerButton } from '../shared/widget.js';

const SECOND_REV = 60_000;
const MINUTE_REV = 30 * 60_000;

class StopwatchClock extends HTMLElement {
  #elapsed = 0;
  #startEpoch = null;
  #intervalId = null;
  #secondHand;
  #minuteHand;
  #timeEl;
  #pauseBtn;

  get #state() { return this.getAttribute('state'); }
  set #state(v) { this.setAttribute('state', v); this.#updateBtn(); }

  async connectedCallback() {
    if (!this.shadowRoot) {
      await loadWidgetAsShadow(
        this,
        new URL('./stopwatch-clock.html', import.meta.url),
        new URL('../shared/component.css', import.meta.url),
        new URL('../shared/clock.css', import.meta.url),
        new URL('./stopwatch-clock.css', import.meta.url),
      );

      this.#secondHand = this.shadowRoot.getElementById('second-hand');
      this.#minuteHand = this.shadowRoot.getElementById('minute-hand');
      this.#timeEl = this.shadowRoot.getElementById('clock-text');
      this.#placeNumbers('main-num', 12, 5, 60, 50, 40, 31);
      this.#placeNumbers('minute-num', 10, 3, 30, 50, 25, 6.5);

      this.#pauseBtn = registerButton(this.shadowRoot, 'pause-btn', () => this.#toggle());
      registerButton(this.shadowRoot, 'reset-btn', () => this.reset());
    }

    const st = this.getAttribute('start-time');
    const el = this.getAttribute('elapsed');
    if (this.#startEpoch !== null || st) {
      if (!this.#startEpoch) this.#startEpoch = Number(st);
      this.#elapsed = Date.now() - this.#startEpoch;
      this.#startInterval();
      this.#state = 'running';
    } else if (el) {
      this.#elapsed = Number(el);
      this.#state = 'paused';
    } else {
      this.#state = 'paused';
    }
    this.#initHands();
    this.#render();
  }

  disconnectedCallback() { this.#stopInterval(); }

  sync() {
    if (this.#startEpoch === null) return;
    this.#elapsed = Date.now() - this.#startEpoch;
    this.#initHands();
    this.#render();
  }

  #placeNumbers(prefix, count, step, max, cx, cy, r) {
    for (let i = 0; i < count; i++) {
      const el = this.shadowRoot.getElementById(`${prefix}-${i}`);
      if (!el) continue;
      const angle = (i / count) * 2 * Math.PI - Math.PI / 2;
      el.setAttribute('x', (cx + r * Math.cos(angle)).toFixed(2));
      el.setAttribute('y', (cy + r * Math.sin(angle)).toFixed(2));
      el.textContent = String(i * step || max);
    }
  }

  #initHand(hand, deg) {
    hand.style.animation = 'none';
    void this.shadowRoot.host.offsetWidth;
    hand.style.setProperty('--start', `${deg.toFixed(2)}deg`);
    hand.style.animation = '';
  }

  #initHands() {
    this.#initHand(this.#secondHand, (this.#elapsed % SECOND_REV) / SECOND_REV * 360);
    this.#initHand(this.#minuteHand, (this.#elapsed % MINUTE_REV) / MINUTE_REV * 360);
  }

  #startInterval() {
    if (this.#intervalId !== null) return;
    this.#initHands();
    this.#intervalId = setInterval(() => this.#tick(), 100);
  }

  #stopInterval() {
    if (this.#intervalId !== null) { clearInterval(this.#intervalId); this.#intervalId = null; }
  }

  #toggle() {
    if (this.#state === 'running') {
      this.#stopInterval();
      this.#initHands();
      this.#startEpoch = null;
      this.removeAttribute('start-time');
      if (this.#elapsed > 0) this.setAttribute('elapsed', String(this.#elapsed));
      this.#state = 'paused';
    } else {
      this.#startEpoch = Date.now() - this.#elapsed;
      this.setAttribute('start-time', String(this.#startEpoch));
      this.removeAttribute('elapsed');
      this.#startInterval();
      this.#state = 'running';
    }
  }

  reset() {
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
    if (this.#startEpoch !== null) this.#elapsed = Date.now() - this.#startEpoch;
    this.#render();
  }

  #render() {
    const total = Math.floor(this.#elapsed / 1000);
    const ds = Math.floor((this.#elapsed % 1000) / 100);
    const s = total % 60;
    const totalMin = Math.floor(total / 60);
    const m = totalMin % 60;
    const h = Math.floor(totalMin / 60);

    const text = h > 0
      ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${ds}`
      : `${m}:${String(s).padStart(2, '0')}.${ds}`;
    const datetime = h > 0
      ? `PT${h}H${m}M${s}.${ds}S`
      : `PT${m}M${s}.${ds}S`;

    this.#timeEl.textContent = text;
    this.#timeEl.setAttribute('datetime', datetime);
  }

  #updateBtn() {
    const [icon, label] = this.#state === 'running'
      ? ['⏸︎', 'Pause stopwatch']
      : ['▶︎', 'Start stopwatch'];
    this.#pauseBtn.textContent = icon;
    this.#pauseBtn.title = label;
    this.#pauseBtn.setAttribute('aria-label', label);
  }

}

customElements.define('stopwatch-clock', StopwatchClock);
