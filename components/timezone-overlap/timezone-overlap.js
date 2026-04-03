import { loadWidgetAsShadow, toggleHidden } from '../shared/widget.js';
import { buildTimezoneSelectOptions, getTimeParts, utcOffsetHours } from '../shared/timezones.js';

// ── Layout constants ──────────────────────────────────────────────────────────
const CX = 50, CY = 42;   // Clock centre (matches HTML)
const FACE_R = 36;         // Outer ring radius (matches HTML)
const MAX_TZ = 4;
const COLORS = ['#5580ff', '#ff6b5b', '#3dbe7a', '#e0a84b'];

// Ring geometry indexed by timezone count
const RING_PARAMS = {
  1: [{ r: 28, sw: 6 }],
  2: [{ r: 30, sw: 5 }, { r: 21, sw: 5 }],
  3: [{ r: 30, sw: 4.5 }, { r: 23, sw: 4.5 }, { r: 16, sw: 4.5 }],
  4: [{ r: 30, sw: 4 }, { r: 23, sw: 4 }, { r: 16, sw: 4 }, { r: 9, sw: 4 }],
};

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

// Returns an SVG arc path string from h1 to h2 (clockwise) on radius r.
function arcD(r, h1, h2) {
  const [x1, y1] = polarXY(r, h1);
  const [x2, y2] = polarXY(r, h2);
  const large = (h2 - h1) > 12 ? 1 : 0;
  return `M${x1.toFixed(2)},${y1.toFixed(2)} A${r},${r} 0 ${large},1 ${x2.toFixed(2)},${y2.toFixed(2)}`;
}

// ── Timezone math ─────────────────────────────────────────────────────────────

// Converts [workStart, workEnd] in `iana` to local-timezone hours.
// The returned `end` may exceed 24 when the arc crosses midnight in local time.
function toLocalHours(iana, workStart, workEnd, now) {
  const localOff = -now.getTimezoneOffset() / 60;
  const remoteOff = utcOffsetHours(iana, now);
  const delta = localOff - remoteOff;
  const duration = workEnd - workStart;
  const start = ((workStart + delta) % 24 + 24) % 24;
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

  // Cached element references (populated once in connectedCallback)
  #rings = [];  // [{ group, bg, arc0, arc1 }, ...]
  #legends = [];  // [{ group, swatch, text }, ...]
  #slots = [];  // [{ slot, swatch, select, start, end, remove }, ...]
  #nowHand = null;
  #addTzBtn = null;

  static observedAttributes = ['timezones'];

  get #configs() {
    try { return JSON.parse(this.getAttribute('timezones') ?? 'null') ?? defaultConfigs(); }
    catch { return defaultConfigs(); }
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

      // Cache element references
      for (let i = 0; i < MAX_TZ; i++) {
        this.#rings.push({
          group: this.shadowRoot.getElementById(`ring-${i}`),
          bg: this.shadowRoot.getElementById(`ring-bg-${i}`),
          arc0: this.shadowRoot.getElementById(`ring-arc-${i}a`),
          arc1: this.shadowRoot.getElementById(`ring-arc-${i}b`),
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

        // Apply static colours
        const color = COLORS[i];
        this.#rings[i].bg.setAttribute('stroke', color);
        this.#rings[i].arc0.setAttribute('stroke', color);
        this.#rings[i].arc1.setAttribute('stroke', color);
        this.#legends[i].swatch.setAttribute('fill', color);
        this.#slots[i].swatch.style.background = color;
      }

      this.#nowHand = this.shadowRoot.getElementById('now-hand');
      this.#addTzBtn = this.shadowRoot.getElementById('add-tz-btn');

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
    const params = RING_PARAMS[n] ?? RING_PARAMS[1];

    const localRanges = configs.map(({ iana, workStart, workEnd }) =>
      toLocalHours(iana, workStart, workEnd, now)
    );

    for (let i = 0; i < MAX_TZ; i++) {
      const active = i < n;
      toggleHidden(this.#rings[i].group, !active);
      toggleHidden(this.#legends[i].group, !active);
      if (!active) continue;

      const { r, sw } = params[i];
      const { start, end } = localRanges[i];
      const { bg, arc0, arc1 } = this.#rings[i];

      bg.setAttribute('r', r);
      bg.setAttribute('stroke-width', sw);
      arc0.setAttribute('stroke-width', sw);
      arc1.setAttribute('stroke-width', sw);

      if (end - start >= 23.99) {
        // Full circle: dim ring is already showing; no arc needed
        toggleHidden(arc0, true);
        toggleHidden(arc1, true);
        bg.setAttribute('stroke-opacity', '1');
      } else if (end <= 24) {
        arc0.setAttribute('d', arcD(r, start, end));
        toggleHidden(arc0, false);
        toggleHidden(arc1, true);
        bg.setAttribute('stroke-opacity', '0.15');
      } else {
        // Crosses midnight: two arc segments
        arc0.setAttribute('d', arcD(r, start, 23.9999));
        toggleHidden(arc0, false);
        arc1.setAttribute('d', arcD(r, 0.0001, end - 24));
        toggleHidden(arc1, false);
        bg.setAttribute('stroke-opacity', '0.15');
      }

      // Legend
      const { iana, workStart, workEnd } = configs[i];
      const { h: th, m: tm } = getTimeParts(now, iana || undefined);
      const time = `${String(th).padStart(2, '0')}:${String(tm).padStart(2, '0')}`;
      this.#legends[i].text.textContent = `${ianaToCity(iana)} · ${time} (${workStart}–${workEnd})`;
    }

    // Now hand
    const { h: nowH, m: nowM } = getTimeParts(now, undefined);
    const [hx, hy] = polarXY(FACE_R - 2, nowH + nowM / 60);
    this.#nowHand.setAttribute('x2', hx.toFixed(2));
    this.#nowHand.setAttribute('y2', hy.toFixed(2));
  }

  // ── Settings ──
  #initSettings() {
    const tzOptions = buildTimezoneSelectOptions();

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
