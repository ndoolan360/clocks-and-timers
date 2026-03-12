const STORAGE_KEY = 'clocks-and-timers.items';

/**
 * @typedef {{ tag: string, attributes: Record<string, string> }} WidgetEntry
 */

const SUPPORTED_TAGS = new Set(['analog-clock', 'countdown-timer', 'pomodoro-timer']);

/**
 * Serialise the current widget list from the DOM into an array of entries.
 * @param {HTMLElement} list  The <ul> container element.
 * @returns {WidgetEntry[]}
 */
function serialise(list) {
  /** @type {WidgetEntry[]} */
  const entries = [];

  for (const li of list.children) {
    const widget = li.firstElementChild;
    if (!widget || !SUPPORTED_TAGS.has(widget.tagName.toLowerCase())) continue;

    /** @type {Record<string, string>} */
    const attributes = {};
    for (const attr of widget.attributes) {
      // Skip internal attributes
      if (attr.name.startsWith('data-')) continue;
      attributes[attr.name] = attr.value;
    }

    entries.push({ tag: widget.tagName.toLowerCase(), attributes });
  }

  return entries;
}

/**
 * Rebuild the widget list DOM from an array of entries.
 * @param {HTMLElement} list  The <ul> container element.
 * @param {WidgetEntry[]} entries
 */
function deserialise(list, entries) {
  list.innerHTML = '';
  for (const { tag, attributes } of entries) {
    const li = document.createElement('li');
    const widget = document.createElement(tag);
    for (const [name, value] of Object.entries(attributes)) {
      widget.setAttribute(name, value);
    }
    li.appendChild(widget);
    list.appendChild(li);
  }
}

/**
 * Load saved widgets from localStorage and rebuild the list DOM.
 * Returns `true` if saved state was restored, `false` if there was
 * nothing to restore (first visit).
 * @param {HTMLElement} list  The <ul> container element.
 * @returns {boolean}
 */
export const loadStorage = (list) => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw == null) return false;

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return false;

    // Validate each entry before returning.
    const entries = parsed.filter(
      (e) =>
        e &&
        typeof e.tag === 'string' &&
        SUPPORTED_TAGS.has(e.tag) &&
        e.attributes &&
        typeof e.attributes === 'object',
    );

    deserialise(list, entries);
    return true;
  } catch {
    return false;
  }
};

export const saveStorage = (list) => {
  try {
    const entries = serialise(list);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Storage may be full or unavailable — fail silently.
  }
};
