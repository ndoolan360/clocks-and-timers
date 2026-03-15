import { loadWidgetAsShadow } from '../shared/widget.js';
import { toLocalISO, currentOffset, buildTimezoneSelectOptions } from '../shared/timezones.js';

class AnalogClock extends HTMLElement {
  #intervalId = null;
  #timeEl;
  #tzSelect;

  static observedAttributes = ['timezone'];

  get timezone() {
    return this.getAttribute('timezone') || undefined;
  }

  async connectedCallback() {
    if (!this.shadowRoot) {
      await loadWidgetAsShadow(
        this,
        new URL('./analog-clock.html', import.meta.url),
        new URL('../shared/component.css', import.meta.url),
        new URL('../shared/clock.css', import.meta.url),
        new URL('./analog-clock.css', import.meta.url),
      );

      this.#timeEl = this.shadowRoot.getElementById('clock-text');

      // Wire timezone select
      this.#initTimezoneSelect();
    }

    this.sync();
    this.#intervalId = setInterval(() => this.#updateText(), 1000);
  }

  disconnectedCallback() {
    clearInterval(this.#intervalId);
    this.#intervalId = null;
  }

  attributeChangedCallback() {
    if (!this.shadowRoot) return;
    if (this.#tzSelect) this.#populateOptions();
    this.#initHands();
    this.#updateText();
  }

  sync() {
    this.#initHands();
    this.#updateText();
  }

  #timeParts() {
    const now = new Date();
    const tz = this.timezone;

    if (!tz) {
      return {
        h: now.getHours(),
        m: now.getMinutes(),
        s: now.getSeconds(),
        ms: now.getMilliseconds(),
      };
    }

    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: false,
      fractionalSecondDigits: 3,
    })
      .formatToParts(now)
      .reduce((acc, p) => ((acc[p.type] = p.value), acc), {});

    return {
      h: +parts.hour,
      m: +parts.minute,
      s: +parts.second,
      ms: +(parts.fractionalSecond || 0),
    };
  }

  #initHands() {
    const { h, m, s, ms } = this.#timeParts();

    const preciseSeconds = s + ms / 1000;
    const preciseMinutes = m + preciseSeconds / 60;
    const hours = h;

    const secondsDeg = (preciseSeconds / 60) * 360;
    const minutesDeg = (preciseMinutes / 60) * 360;
    const hoursDeg = (((hours % 12) + preciseMinutes / 60) / 12) * 360;

    const ids = ['hour-hand', 'minute-hand', 'second-hand'];
    const degs = [hoursDeg, minutesDeg, secondsDeg];
    const hands = ids.map((id) => this.shadowRoot.getElementById(id));

    hands.forEach((hand) => (hand.style.animation = 'none'));
    void this.shadowRoot.host.offsetWidth; // force reflow
    hands.forEach((hand, i) => {
      hand.style.setProperty('--start', `${degs[i].toFixed(2)}deg`);
      hand.style.animation = '';
    });
  }

  #updateText() {
    const now = new Date();
    const tz = this.timezone;
    const opts = { timeStyle: 'short', hourCycle: 'h12' };
    if (tz) opts.timeZone = tz;

    this.#timeEl.textContent = now.toLocaleTimeString('en-AU', opts);
    this.#timeEl.setAttribute('datetime', toLocalISO(now, tz));

    const label = tz ? currentOffset(tz, now) : '';
    if (label) {
      this.#timeEl.style.setProperty('--tz-label', `"${label}"`);
      this.#timeEl.setAttribute('data-has-tz', '');
    } else {
      this.#timeEl.style.removeProperty('--tz-label');
      this.#timeEl.removeAttribute('data-has-tz');
    }
  }

  #initTimezoneSelect() {
    this.#tzSelect = this.shadowRoot.getElementById('setting-timezone');
    this.#populateOptions();

    const popover = this.shadowRoot.getElementById('settings-popover');
    popover?.addEventListener('toggle', (e) => {
      if (e.newState === 'open') this.#populateOptions();
    });

    this.#tzSelect.addEventListener('input', (e) => {
      if (e.target.value) this.setAttribute('timezone', e.target.value);
      else this.removeAttribute('timezone');
      popover?.hidePopover();
    });
  }

  #populateOptions() {
    const current = this.getAttribute('timezone') || '';
    const local = this.#tzSelect.querySelector('option[value=""]');

    this.#tzSelect.innerHTML = '';
    if (local) this.#tzSelect.appendChild(local);

    let resolved = '';
    for (const { label, value, ianas } of buildTimezoneSelectOptions()) {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = label;
      this.#tzSelect.appendChild(opt);
      if (current && ianas.has(current)) resolved = value;
    }

    this.#tzSelect.value = resolved;
  }
}

customElements.define('analog-clock', AnalogClock);
