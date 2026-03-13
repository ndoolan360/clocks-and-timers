import { toLocalISO, currentOffset, buildTimezoneSelectOptions } from "./timezones.js";
import { loadComponentFromFiles } from "../load.js";

class AnalogClock extends HTMLElement {
  /** @type {number | null} */
  #intervalId = null;
  /** @type {HTMLTimeElement} */
  #timeEl;
  /** @type {HTMLSelectElement} */
  #timezoneSelect;

  static observedAttributes = ["timezone"];

  get timezone() {
    return this.getAttribute("timezone") || undefined;
  }

  async connectedCallback() {
    const { template, sheets } = await loadComponentFromFiles(
      new URL('./analog-clock.html', import.meta.url),
      new URL('./analog-clock.css', import.meta.url),
      new URL('../shared.css', import.meta.url)
    );

    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" });
      this.shadowRoot.adoptedStyleSheets = sheets;
      this.shadowRoot.appendChild(template.content.cloneNode(true));
      this.#timeEl = this.shadowRoot.getElementById("clock-text");

      const removeBtn = this.shadowRoot.getElementById("remove-btn");
      removeBtn.addEventListener('click', () =>
        removeBtn.dispatchEvent(new CustomEvent("widget-removed", { bubbles: true, composed: true }))
      );
      removeBtn.disabled = false;

      this.#initTimezoneSelect();
    }

    this.#initHands();
    this.#updateText();
    this.#intervalId = setInterval(() => this.#updateText(), 1000);
  }

  disconnectedCallback() {
    clearInterval(this.#intervalId);
    this.#intervalId = null;
  }

  attributeChangedCallback(name, _, __) {
    if (!this.shadowRoot) return;

    if (name === "timezone") {
      // Re-sync select value
      if (this.#timezoneSelect) {
        this.#populateTimezoneOptions();
      }
      // Reinitialise hands to the new timezone and update text immediately
      this.#initHands();
      this.#updateText();
    }
  }

  #initTimezoneSelect() {
    this.#timezoneSelect = this.shadowRoot.getElementById("setting-timezone");
    if (!this.#timezoneSelect) return;

    this.#populateTimezoneOptions();

    // Repopulate every time the popover opens so offsets stay fresh
    const popover = this.shadowRoot.getElementById("settings-popover");
    popover?.addEventListener("toggle", (e) => {
      if (e.newState === "open") {
        this.#populateTimezoneOptions();
      }
    });

    // Listen for changes
    this.#timezoneSelect.addEventListener("input", (e) => {
      const val = e.target.value;
      if (val) {
        this.setAttribute("timezone", val);
      } else {
        this.removeAttribute("timezone");
      }
      popover?.hidePopover();
    });
  }

  #populateTimezoneOptions() {
    const current = this.getAttribute("timezone") || "";

    // Clear all dynamic options (keep the first "Local" option from the template)
    const localOption = this.#timezoneSelect.querySelector('option[value=""]');
    this.#timezoneSelect.innerHTML = "";
    if (localOption) {
      this.#timezoneSelect.appendChild(localOption);
    }

    // Offset-prefixed options grouped by current offset
    const options = buildTimezoneSelectOptions();
    let resolved = "";
    for (const { label, value, ianas } of options) {
      const opt = document.createElement("option");
      opt.value = value;
      opt.textContent = label;
      this.#timezoneSelect.appendChild(opt);
      // Match if the current attribute is any IANA in this group
      if (current && ianas.has(current)) {
        resolved = value;
      }
    }

    this.#timezoneSelect.value = resolved;
  }

  /**
   * Get hour/minute/second/millis for the configured timezone.
   * If a timezone is set we format through Intl to extract parts,
   * otherwise we use the local Date methods directly.
   */
  #timeParts() {
    const now = new Date();
    const tz = this.timezone;

    if (!tz) {
      return {
        hours: now.getHours(),
        minutes: now.getMinutes(),
        seconds: now.getSeconds(),
        millis: now.getMilliseconds(),
      };
    }

    // Use Intl.DateTimeFormat to extract parts in the target timezone
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      hour12: false,
      fractionalSecondDigits: 3,
    })
      .formatToParts(now)
      .reduce((acc, p) => {
        acc[p.type] = p.value;
        return acc;
      }, {});

    return {
      hours: parseInt(parts.hour, 10),
      minutes: parseInt(parts.minute, 10),
      seconds: parseInt(parts.second, 10),
      millis: parseInt(parts.fractionalSecond || "0", 10),
    };
  }

  #initHands() {
    const { hours, minutes, seconds, millis } = this.#timeParts();

    const preciseSeconds = seconds + millis / 1000;
    const preciseMinutes = minutes + preciseSeconds / 60;
    const preciseHours = (hours % 12) + preciseMinutes / 60;

    const sDeg = (preciseSeconds / 60) * 360;
    const mDeg = (preciseMinutes / 60) * 360;
    const hDeg = (preciseHours / 12) * 360;

    const shadow = this.shadowRoot;
    const hands = [
      shadow.getElementById("hour-hand"),
      shadow.getElementById("minute-hand"),
      shadow.getElementById("second-hand"),
    ];
    const degs = [hDeg, mDeg, sDeg];

    // Remove animation, update --start, force reflow, then re-add animation
    // so the CSS @keyframes restarts from the new offset.
    for (const hand of hands) {
      hand.style.animation = "none";
    }
    // Force reflow to flush the removal
    void shadow.host.offsetWidth;
    for (let i = 0; i < hands.length; i++) {
      hands[i].style.setProperty("--start", `${degs[i].toFixed(2)}deg`);
      hands[i].style.animation = "";
    }
  }

  #updateText() {
    const now = new Date();
    const tz = this.timezone;

    const options = {
      timeStyle: "short",
      hourCycle: "h12",
    };
    if (tz) options.timeZone = tz;

    this.#timeEl.textContent = now.toLocaleTimeString("en-AU", options);
    this.#timeEl.setAttribute("datetime", toLocalISO(now, tz));

    const tzLabel = tz ? currentOffset(tz, now) : "";
    if (tzLabel) {
      this.#timeEl.style.setProperty("--tz-label", `"${tzLabel}"`);
      this.#timeEl.setAttribute("data-has-tz", "");
    } else {
      this.#timeEl.style.removeProperty("--tz-label");
      this.#timeEl.removeAttribute("data-has-tz");
    }
  }
}

customElements.define("analog-clock", AnalogClock);
