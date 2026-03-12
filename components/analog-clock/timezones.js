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

/** UTC offsets we want to show in the select. */
const offsets = [
  "UTC-10",
  "UTC-9",
  "UTC-8",
  "UTC-7",
  "UTC-6",
  "UTC-5",
  "UTC-4",
  "UTC-3",
  "UTC+0",
  "UTC+1",
  "UTC+2",
  "UTC+3",
  "UTC+4",
  "UTC+5:30",
  "UTC+5:45",
  "UTC+7",
  "UTC+8",
  "UTC+9",
  "UTC+10",
  "UTC+11",
  "UTC+12",
  "UTC+13",
];

/**
 * Resolve the current UTC offset string for a given IANA timezone.
 * Returns e.g. "UTC+10" or "UTC-5" or "UTC+5:30".
 * @param {string} iana
 * @param {Date} now
 * @returns {string}
 */
export const currentOffset = (iana, now) => {
  const raw = new Intl.DateTimeFormat("en-US", {
    timeZone: iana,
    timeZoneName: "longOffset",
  })
    .formatToParts(now)
    .find((p) => p.type === "timeZoneName")?.value ?? "GMT";

  // "GMT" → "UTC+0", "GMT+10:00" → "UTC+10", "GMT+5:30" → "UTC+5:30"
  if (raw === "GMT") return "UTC+0";
  return raw
    .replace("GMT", "UTC")
    .replace(/:00$/, "")
    .replace(/([+-])0(\d)/, "$1$2");
};

/**
 * Converts date to ISO8601 string with UTC offset for datetime attribute of <time> element.
 * @param {Date} now
 * @param {string} [timeZone]
 * @returns {string}
 */
export const toLocalISO = (now, timeZone) => {
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

  // Extract UTC offset string like "GMT+10:00" or "GMT-05:00"
  const offsetStr = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "longOffset",
  })
    .formatToParts(now)
    .find((p) => p.type === "timeZoneName")?.value ?? "";

  // "GMT" alone means +00:00; otherwise strip the "GMT" prefix
  const offset = offsetStr === "GMT" ? "+00:00" : offsetStr.replace("GMT", "");

  return datetime + offset;
};

/**
 * Build timezone select options for the current moment.
 * Groups locations by their current UTC offset, only including offsets
 * from our curated list. Each option uses the first location's IANA
 * identifier as its value and carries all IANA identifiers in the group
 * so callers can match a previously-selected value.
 * @returns {Array<{label: string, value: string, ianas: Set<string>}>}
 */
export const buildTimezoneSelectOptions = () => {
  const now = new Date();

  // Map each offset to the locations currently at that offset
  /** @type {Map<string, Array<{name: string, iana: string}>>} */
  const byOffset = new Map();
  const offsetSet = new Set(offsets);

  for (const [name, iana] of locations) {
    const offset = currentOffset(iana, now);
    if (!offsetSet.has(offset)) continue;
    if (!byOffset.has(offset)) byOffset.set(offset, []);
    const group = byOffset.get(offset);
    if (!group.some((e) => e.iana === iana && e.name === name)) {
      group.push({ name, iana });
    }
  }

  // Return options in offset order, using our curated offsets list to
  // maintain a stable sort.
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
};
