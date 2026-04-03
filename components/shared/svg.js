/**
 * SVG geometry utilities shared across components.
 */

/**
 * Returns an SVG arc path string going clockwise from startRad to endRad.
 * Angles are in radians using the standard SVG convention (0 = 3 o'clock, y-down).
 * Handles wrap-around correctly: if endRad < startRad the arc crosses the 0-rad boundary.
 *
 * @param {number} cx        Centre X in SVG user units.
 * @param {number} cy        Centre Y in SVG user units.
 * @param {number} r         Radius in SVG user units.
 * @param {number} startRad  Start angle in radians.
 * @param {number} endRad    End angle in radians.
 * @returns {string}  e.g. "M85.00,50.00 A40,40 0 0,1 50.00,90.00"
 */
export function svgArcD(cx, cy, r, startRad, endRad) {
  const x1 = (cx + r * Math.cos(startRad)).toFixed(2);
  const y1 = (cy + r * Math.sin(startRad)).toFixed(2);
  const x2 = (cx + r * Math.cos(endRad)).toFixed(2);
  const y2 = (cy + r * Math.sin(endRad)).toFixed(2);
  const span = ((endRad - startRad) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
  const large = span > Math.PI ? 1 : 0;
  return `M${x1},${y1} A${r},${r} 0 ${large},1 ${x2},${y2}`;
}
