import { loadWidgetAsShadow, toggleHidden } from '../shared/widget.js';
import { buildTimezoneSelectOptions, getTimeParts, utcOffsetHours } from '../shared/timezones.js';
import { svgArcD } from '../shared/svg.js';

// ── Layout constants ──────────────────────────────────────────────────────────
const CX = 50, CY = 50;   // Clock centre (matches HTML)
const FACE_R = 42;         // Outer ring radius (matches HTML)
const MAX_TZ = 4;

// ── Defaults ──────────────────────────────────────────────────────────────────
function defaultConfigs() {
  return [
    { iana: '', workStart: 9, workEnd: 17 },
    { iana: 'America/New_York', workStart: 9, workEnd: 17 },
  ];
}

// ── Geometry helpers ──────────────────────────────────────────────────────────

// Maps an hour (0–24) to an SVG angle: 0h = top, clockwise.
function hourAngle(hour) {
  return (hour / 24) * 2 * Math.PI - Math.PI / 2;
}

function polarXY(r, hour) {
  const a = hourAngle(hour);
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
}

// ── Timezone math ─────────────────────────────────────────────────────────────

// Converts [workStart, workEnd] in `iana` to the reference timezone's hours.
// The returned `end` may exceed 24 when the arc crosses the reference midnight boundary.
function toReferenceHours(iana, workStart, workEnd, refIana, now) {
  const refOff    = utcOffsetHours(refIana, now);
  const remoteOff = utcOffsetHours(iana, now);
  const delta     = refOff - remoteOff;
  const duration  = workEnd - workStart;
  const start     = ((workStart + delta) % 24 + 24) % 24;
  return { start, end: start + duration };
}

// Extracts a human-readable city name from an IANA identifier.
function ianaToCity(iana) {
  if (!iana) return 'Local';
  return iana.split('/').pop().replace(/_/g, ' ');
}

// ── Custom element ────────────────────────────────────────────────────────────
class TimezoneOverlap extends HTMLElement {
  #intervalId = null;

  #rings = [];
  #legends = [];
  #slots = [];
  #nowHand = null;
  #addTzBtn = null;
  #svg = null;
  #refSelect = null;

  static observedAttributes = ['timezones', 'reference'];

  get #configs() {
    try { return JSON.parse(this.getAttribute('timezones') ?? 'null') ?? defaultConfigs(); }
    catch { return defaultConfigs(); }
  }

  get #reference() {
    return this.getAttribute('reference') ?? 'UTC';
  }

  #save(configs) {
    this.setAttribute('timezones', JSON.stringify(configs));
  }

  async connectedCallback() {
    if (!this.shadowRoot) {
      await loadWidgetAsShadow(
        this,
        new URL('./timezone-overlap.html', import.meta.url),
        new URL('../shared/component.css', import.meta.url),
        new URL('./timezone-overlap.css', import.meta.url),
      );

      for (let i = 0; i < MAX_TZ; i++) {
        this.#rings.push({
          group: this.shadowRoot.getElementById(`ring-${i}`),
          bg: this.shadowRoot.getElementById(`ring-bg-${i}`),
          arc: this.shadowRoot.getElementById(`ring-arc-${i}`),
        });
        this.#legends.push({
          group: this.shadowRoot.getElementById(`legend-${i}`),
          swatch: this.shadowRoot.getElementById(`legend-swatch-${i}`),
          text: this.shadowRoot.getElementById(`legend-text-${i}`),
        });
        this.#slots.push({
          slot: this.shadowRoot.getElementById(`tz-slot-${i}`),
          swatch: this.shadowRoot.getElementById(`tz-swatch-${i}`),
          select: this.shadowRoot.getElementById(`tz-select-${i}`),
          start: this.shadowRoot.getElementById(`tz-start-${i}`),
          end: this.shadowRoot.getElementById(`tz-end-${i}`),
          remove: this.shadowRoot.getElementById(`tz-remove-${i}`),
        });

      }

      this.#nowHand   = this.shadowRoot.getElementById('now-hand');
      this.#addTzBtn  = this.shadowRoot.getElementById('add-tz-btn');
      this.#svg       = this.shadowRoot.getElementById('overlap-svg');
      this.#refSelect = this.shadowRoot.getElementById('ref-tz-select');

      this.#initSettings();
    }

    this.sync();
    this.#intervalId = setInterval(() => this.#render(), 60_000);
  }

  disconnectedCallback() {
    clearInterval(this.#intervalId);
    this.#intervalId = null;
  }

  attributeChangedCallback() {
    if (!this.shadowRoot) return;
    this.#render();
    this.#syncSettingsUI();
  }

  sync() { this.#render(); }

  // ── Render (updates element attributes, not DOM structure) ──
  #render() {
    const now = new Date();
    const configs = this.#configs.slice(0, MAX_TZ);
    const n = configs.length;

    this.#svg.dataset.count = n;

    const ref = this.#reference;
    const localRanges = configs.map(({ iana, workStart, workEnd }) =>
      toReferenceHours(iana, workStart, workEnd, ref, now)
    );

    for (let i = 0; i < MAX_TZ; i++) {
      const active = i < n;
      toggleHidden(this.#rings[i].group, !active);
      toggleHidden(this.#legends[i].group, !active);
      if (!active) continue;

      const r = this.#rings[i].bg.r.baseVal.value;
      const { start, end } = localRanges[i];
      const { bg, arc } = this.#rings[i];

      if (end - start >= 23.99) {
        // Full circle: dim ring covers it; clear the arc path.
        arc.setAttribute('d', '');
        bg.setAttribute('stroke-opacity', '1');
      } else {
        arc.setAttribute('d', svgArcD(CX, CY, r, hourAngle(start), hourAngle(end % 24)));
        bg.setAttribute('stroke-opacity', '0.15');
      }

      // Legend
      const { iana, workStart, workEnd } = configs[i];
      const { h: th, m: tm } = getTimeParts(now, iana || undefined);
      const time = `${String(th).padStart(2, '0')}:${String(tm).padStart(2, '0')}`;
      this.#legends[i].text.textContent = `${ianaToCity(iana)} · ${time} (${workStart}–${workEnd})`;
    }

    // Now hand
    const { h: nowH, m: nowM } = getTimeParts(now, ref);
    const [hx, hy] = polarXY(FACE_R - 2, nowH + nowM / 60);
    this.#nowHand.setAttribute('x2', hx.toFixed(2));
    this.#nowHand.setAttribute('y2', hy.toFixed(2));
  }

  // ── Settings ──
  #initSettings() {
    const tzOptions = buildTimezoneSelectOptions();

    // Populate reference timezone select (HTML already has UTC first)
    for (const { label, value } of tzOptions) {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = label;
      this.#refSelect.appendChild(opt);
    }
    this.#refSelect.addEventListener('input', () => {
      this.setAttribute('reference', this.#refSelect.value);
    });

    for (let i = 0; i < MAX_TZ; i++) {
      const { select, start, end, remove } = this.#slots[i];

      // Populate timezone options (HTML already has the "Local" option first)
      for (const { label, value } of tzOptions) {
        const opt = document.createElement('option');
        opt.value = value;
        opt.textContent = label;
        select.appendChild(opt);
      }

      select.addEventListener('input', () => {
        const configs = this.#configs;
        configs[i] = { ...configs[i], iana: select.value };
        this.#save(configs);
      });
      start.addEventListener('input', () => {
        const configs = this.#configs;
        configs[i] = { ...configs[i], workStart: parseInt(start.value) || 0 };
        this.#save(configs);
      });
      end.addEventListener('input', () => {
        const configs = this.#configs;
        configs[i] = { ...configs[i], workEnd: parseInt(end.value) || 17 };
        this.#save(configs);
      });
      remove.addEventListener('click', () => {
        this.#save(this.#configs.filter((_, j) => j !== i));
      });
    }

    this.#addTzBtn.addEventListener('click', () => {
      const configs = this.#configs;
      if (configs.length >= MAX_TZ) return;
      configs.push({ iana: 'Europe/London', workStart: 9, workEnd: 17 });
      this.#save(configs);
    });

    this.shadowRoot.getElementById('settings-popover')?.addEventListener('toggle', (e) => {
      if (e.newState === 'open') this.#syncSettingsUI();
    });

    this.#syncSettingsUI();
  }

  #syncSettingsUI() {
    if (!this.shadowRoot) return;
    const configs = this.#configs;
    const n = configs.length;
    const tzOptions = buildTimezoneSelectOptions();

    // Sync reference select
    const ref = this.#reference;
    let refResolved = 'UTC';
    if (ref !== 'UTC') {
      for (const { value, ianas } of tzOptions) {
        if (ianas.has(ref)) { refResolved = value; break; }
      }
    }
    this.#refSelect.value = refResolved;

    for (let i = 0; i < MAX_TZ; i++) {
      const { slot, select, start, end, remove } = this.#slots[i];
      const active = i < n;
      slot.hidden = !active;
      if (!active) continue;

      const cfg = configs[i];

      // Match stored IANA to an option value (groups like Mumbai/New Delhi share one option)
      let resolved = '';
      if (cfg.iana) {
        for (const { value, ianas } of tzOptions) {
          if (ianas.has(cfg.iana)) { resolved = value; break; }
        }
      }
      select.value = resolved;
      start.value = cfg.workStart;
      end.value = cfg.workEnd;

      // Remove button visible only when there's more than one timezone
      remove.hidden = n <= 1;
    }

    this.#addTzBtn.disabled = n >= MAX_TZ;
  }
}

customElements.define('timezone-overlap', TimezoneOverlap);
