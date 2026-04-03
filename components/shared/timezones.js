/**
 * Timezone utilities for clock components.
 * Provides offset resolution, ISO formatting, and select-option building.
 */

/** Curated locations: [display name, IANA identifier]. */
const locations = [
  ["Honolulu", "Pacific/Honolulu"],
  ["Anchorage", "America/Anchorage"],
  ["Los Angeles", "America/Los_Angeles"],
  ["Vancouver", "America/Vancouver"],
  ["Denver", "America/Denver"],
  ["Phoenix", "America/Phoenix"],
  ["Chicago", "America/Chicago"],
  ["Mexico City", "America/Mexico_City"],
  ["New York", "America/New_York"],
  ["Toronto", "America/Toronto"],
  ["Halifax", "America/Halifax"],
  ["Santiago", "America/Santiago"],
  ["Buenos Aires", "America/Argentina/Buenos_Aires"],
  ["São Paulo", "America/Sao_Paulo"],
  ["London", "Europe/London"],
  ["Dublin", "Europe/Dublin"],
  ["Casablanca", "Africa/Casablanca"],
  ["Paris", "Europe/Paris"],
  ["Berlin", "Europe/Berlin"],
  ["Rome", "Europe/Rome"],
  ["Cairo", "Africa/Cairo"],
  ["Jerusalem", "Asia/Jerusalem"],
  ["Kyiv", "Europe/Kyiv"],
  ["Moscow", "Europe/Moscow"],
  ["Riyadh", "Asia/Riyadh"],
  ["Dubai", "Asia/Dubai"],
  ["Baku", "Asia/Baku"],
  ["Mumbai", "Asia/Kolkata"],
  ["New Delhi", "Asia/Kolkata"],
  ["Kathmandu", "Asia/Kathmandu"],
  ["Bangkok", "Asia/Bangkok"],
  ["Jakarta", "Asia/Jakarta"],
  ["Singapore", "Asia/Singapore"],
  ["Kuala Lumpur", "Asia/Kuala_Lumpur"],
  ["Beijing", "Asia/Shanghai"],
  ["Hong Kong", "Asia/Hong_Kong"],
  ["Perth", "Australia/Perth"],
  ["Tokyo", "Asia/Tokyo"],
  ["Seoul", "Asia/Seoul"],
  ["Sydney", "Australia/Sydney"],
  ["Melbourne", "Australia/Melbourne"],
  ["Brisbane", "Australia/Brisbane"],
  ["Auckland", "Pacific/Auckland"],
];

/** UTC offsets to include in the select dropdown. */
const offsets = [
  "UTC-10", "UTC-9", "UTC-8", "UTC-7", "UTC-6", "UTC-5", "UTC-4", "UTC-3",
  "UTC+0", "UTC+1", "UTC+2", "UTC+3", "UTC+4", "UTC+5:30", "UTC+5:45",
  "UTC+7", "UTC+8", "UTC+9", "UTC+10", "UTC+11", "UTC+12", "UTC+13",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract the raw GMT offset string from Intl for a given timezone.
 * @param {string} timeZone  IANA timezone identifier.
 * @param {Date}   date
 * @returns {string} e.g. "GMT", "GMT+10:00", "GMT-05:00", "GMT+5:30"
 */
function gmtOffset(timeZone, date) {
  return new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
    .formatToParts(date)
    .find((p) => p.type === "timeZoneName")?.value ?? "GMT";
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns the UTC offset for an IANA timezone in decimal hours (e.g. 5.5 for UTC+5:30).
 * Pass an empty string or omit iana for the local timezone.
 * @param {string} iana  IANA timezone identifier, or "" for local.
 * @param {Date}   now
 * @returns {number}
 */
export function utcOffsetHours(iana, now) {
  if (!iana) return -now.getTimezoneOffset() / 60;
  const raw = gmtOffset(iana, now);
  if (raw === "GMT") return 0;
  const m = raw.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!m) return 0;
  return (m[1] === "+" ? 1 : -1) * (parseInt(m[2]) + parseInt(m[3] ?? "0") / 60);
}

/**
 * Resolve the current UTC offset string for a given IANA timezone.
 * @param {string} iana  IANA timezone identifier (e.g. "Australia/Sydney").
 * @param {Date}   now
 * @returns {string} e.g. "UTC+10", "UTC-5", "UTC+5:30"
 */
export function currentOffset(iana, now) {
  const raw = gmtOffset(iana, now);
  if (raw === "GMT") return "UTC+0";
  return raw.replace("GMT", "UTC").replace(/:00$/, "").replace(/([+-])0(\d)/, "$1$2");
}

/**
 * Convert a Date to an ISO 8601 datetime string with its UTC offset,
 * suitable for a `<time datetime>` attribute.
 * @param {Date}    now
 * @param {string} [timeZone]  IANA timezone (omit for local).
 * @returns {string} e.g. "2024-06-15T09:30:00+10:00"
 */
export function toLocalISO(now, timeZone) {
  const datetime = new Intl.DateTimeFormat("sv-SE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone,
  })
    .format(now)
    .replace(" ", "T");

  const raw = gmtOffset(timeZone, now);
  const offset = raw === "GMT" ? "+00:00" : raw.replace("GMT", "");

  return datetime + offset;
}

/**
 * Extract hour, minute, second, and millisecond parts for a given Date and timezone.
 * @param {Date} date
 * @param {string} [timezone] IANA timezone (omit for local).
 * @returns {{ h: number, m: number, s: number, ms: number }} 24-hour time parts
 */
export function getTimeParts(date, timezone) {
  const opts = {
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
    fractionalSecondDigits: 3,
  };
  if (timezone) opts.timeZone = timezone;

  const parts = new Intl.DateTimeFormat('en-US', opts)
    .formatToParts(date)
    .reduce((acc, p) => ((acc[p.type] = p.value), acc), {});

  return {
    h: +parts.hour,
    m: +parts.minute,
    s: +parts.second,
    ms: +(parts.fractionalSecond || 0),
  };
}

/**
 * Build an ordered array of timezone select options for the current moment.
 *
 * Groups curated locations by their current UTC offset and returns one entry
 * per offset. Each entry carries a Set of all IANA identifiers sharing that
 * offset so callers can match a previously-selected value.
 *
 * @returns {Array<{ label: string, value: string, ianas: Set<string> }>}
 */
export function buildTimezoneSelectOptions() {
  const now = new Date();
  const offsetSet = new Set(offsets);

  /** @type {Map<string, Array<{ name: string, iana: string }>>} */
  const byOffset = new Map();

  for (const [name, iana] of locations) {
    const offset = currentOffset(iana, now);
    if (!offsetSet.has(offset)) continue;

    let group = byOffset.get(offset);
    if (!group) {
      group = [];
      byOffset.set(offset, group);
    }
    if (!group.some((e) => e.iana === iana && e.name === name)) {
      group.push({ name, iana });
    }
  }

  return offsets
    .filter((offset) => byOffset.has(offset))
    .map((offset) => {
      const group = byOffset.get(offset);
      return {
        label: `${offset} · ${group.map((e) => e.name).join(", ")}`,
        value: group[0].iana,
        ianas: new Set(group.map((e) => e.iana)),
      };
    });
}
