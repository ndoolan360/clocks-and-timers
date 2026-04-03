import { loadWidgetAsShadow } from '../shared/widget.js';
import { buildTimezoneSelectOptions, getTimeParts } from '../shared/timezones.js';

// ── Layout constants ──────────────────────────────────────────────────────────
const CX = 50, CY = 42;   // Clock centre
const FACE_R = 36;         // Outer ring radius (tick marks land here)
const LABEL_R = 40;        // Hour label radius
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

// Renders arc segment(s) as an SVG string; handles midnight wrap (end > 24).
function arcSVG(r, start, end, attrs) {
  if (end - start >= 23.99) {
    // Full circle
    return `<circle cx="${CX}" cy="${CY}" r="${r}" fill="none" ${attrs}/>`;
  }
  if (end <= 24) {
    return `<path d="${arcD(r, start, end)}" fill="none" ${attrs}/>`;
  }
  // Crosses midnight: two segments
  return (
    `<path d="${arcD(r, start, 23.9999)}" fill="none" ${attrs}/>` +
    `<path d="${arcD(r, 0.0001, end - 24)}" fill="none" ${attrs}/>`
  );
}

// ── Timezone math ─────────────────────────────────────────────────────────────

// Returns the UTC offset for an IANA timezone in decimal hours (e.g. 5.5 for UTC+5:30).
function utcOffsetHours(iana, now) {
  if (!iana) return -now.getTimezoneOffset() / 60;
  const raw = new Intl.DateTimeFormat('en-US', { timeZone: iana, timeZoneName: 'longOffset' })
    .formatToParts(now)
    .find(p => p.type === 'timeZoneName')?.value ?? 'GMT';
  if (raw === 'GMT') return 0;
  const m = raw.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!m) return 0;
  return (m[1] === '+' ? 1 : -1) * (parseInt(m[2]) + parseInt(m[3] ?? '0') / 60);
}

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
  #svg = null;

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
      this.#svg = this.shadowRoot.getElementById('overlap-svg');
      this.#buildStaticSVG();
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

  // ── Static SVG (clock face, ticks, labels) ──
  #buildStaticSVG() {
    let html = '';

    // Outer clock face ring
    html += `<circle cx="${CX}" cy="${CY}" r="${FACE_R}" class="face-ring"/>`;

    // 24 tick marks
    for (let h = 0; h < 24; h++) {
      const major = h % 6 === 0;
      const r0 = FACE_R - (major ? 4 : 2);
      const [x1, y1] = polarXY(r0, h);
      const [x2, y2] = polarXY(FACE_R, h);
      html += `<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" class="tick${major ? ' tick-major' : ''}"/>`;
    }

    // Hour labels at 0, 6, 12, 18
    for (const [h, label] of [[0, '24'], [6, '6'], [12, '12'], [18, '18']]) {
      const [lx, ly] = polarXY(LABEL_R, h);
      html += `<text x="${lx.toFixed(2)}" y="${ly.toFixed(2)}" class="hour-label" text-anchor="middle" dominant-baseline="middle">${label}</text>`;
    }

    // Placeholder for dynamic content
    html += `<g id="dyn"></g>`;

    this.#svg.innerHTML = html;
  }

  // ── Dynamic SVG (rings, now-hand, legend) ──
  #render() {
    const now = new Date();
    const configs = this.#configs.slice(0, MAX_TZ);
    const n = configs.length;
    const rings = RING_PARAMS[n] ?? RING_PARAMS[1];

    // Convert each timezone's work hours to local-time arcs
    const localRanges = configs.map(({ iana, workStart, workEnd }) =>
      toLocalHours(iana, workStart, workEnd, now)
    );

    let html = '';

    // ── Timezone rings ──
    for (let i = 0; i < n; i++) {
      const color = COLORS[i];
      const { r, sw } = rings[i];
      const { start, end } = localRanges[i];
      const strokeAttrs = `stroke="${color}" stroke-width="${sw}"`;

      // Full dim ring (non-working hours)
      html += `<circle cx="${CX}" cy="${CY}" r="${r}" fill="none" ${strokeAttrs} stroke-opacity="0.15"/>`;
      // Bright working-hours arc
      html += arcSVG(r, start, end, `${strokeAttrs} stroke-linecap="round"`);
    }

    // ── Now hand ──
    const { h: nowH, m: nowM } = getTimeParts(now, undefined);
    const nowFrac = nowH + nowM / 60;
    const [hx, hy] = polarXY(FACE_R - 2, nowFrac);
    html += `<line x1="${CX}" y1="${CY}" x2="${hx.toFixed(2)}" y2="${hy.toFixed(2)}" class="now-hand"/>`;
    html += `<circle cx="${CX}" cy="${CY}" r="1.5" class="center-dot"/>`;

    // ── Legend (bottom of SVG) ──
    const LEG_Y = 84;
    const LEG_LINE = 4.8;
    for (let i = 0; i < n; i++) {
      const { iana, workStart, workEnd } = configs[i];
      const color = COLORS[i];
      const { h: th, m: tm } = getTimeParts(now, iana || undefined);
      const time = `${String(th).padStart(2, '0')}:${String(tm).padStart(2, '0')}`;
      const city = ianaToCity(iana);
      const y = LEG_Y + i * LEG_LINE;

      html += `<rect x="6" y="${(y - 2).toFixed(1)}" width="2.5" height="2.5" fill="${color}" rx="0.5"/>`;
      html += `<text x="10.5" y="${y.toFixed(1)}" class="legend-text">${city} · ${time} (${workStart}–${workEnd})</text>`;
    }

    this.#svg.getElementById('dyn').innerHTML = html;
  }

  // ── Settings ──
  #initSettings() {
    this.shadowRoot.getElementById('add-tz-btn').addEventListener('click', () => {
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
    const slotsDiv = this.shadowRoot.getElementById('tz-slots');
    const addBtn = this.shadowRoot.getElementById('add-tz-btn');
    const configs = this.#configs;
    const tzOptions = buildTimezoneSelectOptions();

    slotsDiv.innerHTML = '';

    configs.slice(0, MAX_TZ).forEach((cfg, i) => {
      const row = document.createElement('div');
      row.className = 'tz-slot';

      // Colour swatch
      const swatch = document.createElement('span');
      swatch.className = 'tz-swatch';
      swatch.style.background = COLORS[i];
      row.appendChild(swatch);

      const fields = document.createElement('div');
      fields.className = 'tz-fields';

      // Timezone select
      const tzLbl = document.createElement('label');
      tzLbl.className = 'label';
      tzLbl.innerHTML = `<span>Timezone ${i + 1}</span>`;
      const select = document.createElement('select');
      if (i === 0) {
        const localOpt = document.createElement('option');
        localOpt.value = '';
        localOpt.textContent = 'Local';
        select.appendChild(localOpt);
      }
      for (const { label, value, ianas } of tzOptions) {
        const opt = document.createElement('option');
        opt.value = value;
        opt.textContent = label;
        select.appendChild(opt);
        if (cfg.iana && ianas.has(cfg.iana)) select.value = value;
      }
      if (!cfg.iana && i === 0) select.value = '';
      select.addEventListener('input', () => {
        const updated = this.#configs;
        updated[i] = { ...updated[i], iana: select.value };
        this.#save(updated);
      });
      tzLbl.appendChild(select);
      fields.appendChild(tzLbl);

      // Work hours
      const whLbl = document.createElement('label');
      whLbl.className = 'label';
      whLbl.innerHTML = '<span>Work hours</span>';
      const whRow = document.createElement('div');
      whRow.className = 'work-hours';

      const mkInput = (val, min, max, key) => {
        const inp = document.createElement('input');
        inp.type = 'number';
        inp.min = min;
        inp.max = max;
        inp.value = val;
        inp.addEventListener('input', () => {
          const updated = this.#configs;
          updated[i] = { ...updated[i], [key]: parseInt(inp.value) || val };
          this.#save(updated);
        });
        return inp;
      };

      const dash = document.createElement('span');
      dash.textContent = '–';
      whRow.appendChild(mkInput(cfg.workStart, '0', '23', 'workStart'));
      whRow.appendChild(dash);
      whRow.appendChild(mkInput(cfg.workEnd, '1', '24', 'workEnd'));
      whLbl.appendChild(whRow);
      fields.appendChild(whLbl);

      row.appendChild(fields);

      // Remove button (hidden when only one timezone remains)
      if (configs.length > 1) {
        const rm = document.createElement('button');
        rm.type = 'button';
        rm.className = 'remove-tz';
        rm.textContent = '×';
        rm.title = 'Remove timezone';
        rm.addEventListener('click', () => {
          this.#save(this.#configs.filter((_, j) => j !== i));
        });
        row.appendChild(rm);
      }

      slotsDiv.appendChild(row);
    });

    addBtn.disabled = configs.length >= MAX_TZ;
  }
}

customElements.define('timezone-overlap', TimezoneOverlap);
