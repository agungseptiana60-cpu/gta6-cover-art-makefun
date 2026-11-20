// Panel geometry for VICE PANELS.
// Every layout is a list of panels whose shape is a polygon in normalised
// cover coordinates: x and y both run from 0 to 1, so the same layout can be
// painted at a postcard size or at a full export size without rescaling data.
// Dividers lean a few percent off vertical or horizontal on purpose: that
// slight slant is what makes a grid of photos read as a poster collage
// instead of a spreadsheet.

// A small helper so the layout tables below stay readable: each point is
// written as a two-number array and converted into an {x, y} record.
function poly(points) {
  return points.map(([x, y]) => ({ x, y }));
}

// A rectangle that has been spun around its own centre. The snapshots layout
// uses these for its polaroid cards, which sit tilted on top of the scene.
function tiltedRect(cx, cy, w, h, degrees) {
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const corners = [
    [-w / 2, -h / 2],
    [w / 2, -h / 2],
    [w / 2, h / 2],
    [-w / 2, h / 2],
  ];
  return corners.map(([dx, dy]) => ({
    x: cx + dx * cos - dy * sin,
    y: cy + dx * sin + dy * cos,
  }));
}

// An axis-aligned rectangle in normalised coordinates.
function rect(x, y, w, h) {
  return poly([
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ]);
}

// The six layouts the editor offers. Order matters for the snapshots layout:
// panel 0 is the full-bleed backdrop and the tilted cards are painted after
// it, so they land on top.
export const LAYOUTS = {
  classic: {
    label: 'Classic Six',
    panels: [
      poly([[0, 0], [0.345, 0], [0.325, 0.575], [0, 0.6]]),
      poly([[0.655, 0], [1, 0], [1, 0.6], [0.675, 0.575]]),
      poly([[0.345, 0], [0.655, 0], [0.675, 0.575], [0.325, 0.575]]),
      poly([[0, 0.6], [0.325, 0.575], [0.335, 1], [0, 1]]),
      poly([[0.325, 0.575], [0.675, 0.575], [0.665, 1], [0.335, 1]]),
      poly([[0.675, 0.575], [1, 0.6], [1, 1], [0.665, 1]]),
    ],
  },
  hero3: {
    label: 'Hero + Three',
    panels: [
      poly([[0, 0], [0.615, 0], [0.585, 1], [0, 1]]),
      poly([[0.615, 0], [1, 0], [1, 0.335], [0.6, 0.345]]),
      poly([[0.6, 0.345], [1, 0.335], [1, 0.665], [0.592, 0.66]]),
      poly([[0.592, 0.66], [1, 0.665], [1, 1], [0.585, 1]]),
    ],
  },
  mosaic: {
    label: 'Mosaic Nine',
    panels: [
      rect(0, 0, 0.335, 0.335),
      rect(0.335, 0, 0.33, 0.335),
      rect(0.665, 0, 0.335, 0.335),
      rect(0, 0.335, 0.335, 0.33),
      rect(0.335, 0.335, 0.33, 0.33),
      rect(0.665, 0.335, 0.335, 0.33),
      rect(0, 0.665, 0.335, 0.335),
      rect(0.335, 0.665, 0.33, 0.335),
      rect(0.665, 0.665, 0.335, 0.335),
    ],
  },
  snapshots: {
    label: 'Snapshots',
    panels: [
      rect(0, 0, 1, 1),
      tiltedRect(0.27, 0.36, 0.42, 0.5, -7),
      tiltedRect(0.72, 0.32, 0.4, 0.46, 6),
      tiltedRect(0.52, 0.74, 0.44, 0.42, -3),
    ],
  },
  duo: {
    label: 'Diagonal Duo',
    panels: [
      poly([[0, 0], [1, 0], [0.6, 1], [0, 1]]),
      poly([[1, 0], [1, 1], [0.6, 1]]),
    ],
  },
  fullbleed: {
    label: 'Full Bleed',
    panels: [rect(0, 0, 1, 1)],
  },
};

// Layout ids in the order the picker shows them.
export const LAYOUT_ORDER = ['classic', 'hero3', 'mosaic', 'snapshots', 'duo', 'fullbleed'];

// Returns the layout record for an id, falling back to the classic six-panel
// arrangement when the id is unknown (for example a stale query parameter).
export function layoutById(id) {
  return LAYOUTS[id] ?? LAYOUTS.classic;
}

// The axis-aligned box that just contains a polygon, in the same normalised
// coordinates. Cover-fit maths works on boxes, so panels are fitted through
// their bounding box and then clipped back to the true polygon.
export function polygonBounds(points) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

// The average of a polygon's corners; good enough as a visual centre for
// shrinking a shape toward its middle when a polaroid photo inset is needed.
export function polygonCentroid(points) {
  let sx = 0;
  let sy = 0;
  for (const p of points) {
    sx += p.x;
    sy += p.y;
  }
  return { x: sx / points.length, y: sy / points.length };
}

// A copy of a polygon pulled toward (or pushed away from) its centroid by
// the given factor: 1 returns the shape unchanged, 0.9 a slightly smaller
// twin sitting inside it.
export function shrinkPolygon(points, factor) {
  const c = polygonCentroid(points);
  return points.map((p) => ({
    x: c.x + (p.x - c.x) * factor,
    y: c.y + (p.y - c.y) * factor,
  }));
}

// Ray-casting hit test: is the normalised point (x, y) inside the polygon?
// The editor uses this to turn a click on the preview into a panel choice.
export function pointInPolygon(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i];
    const b = points[j];
    const crosses = a.y > y !== b.y > y;
    if (crosses) {
      const xAtY = a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x);
      if (x < xAtY) inside = !inside;
    }
  }
  return inside;
}

// Finds which panel of a layout sits under a normalised point. Panels are
// tested from last painted to first, so in the snapshots layout a tilted
// card wins over the backdrop beneath it. Returns -1 when nothing is hit.
export function panelIndexAt(layout, x, y) {
  for (let i = layout.panels.length - 1; i >= 0; i--) {
    if (pointInPolygon(x, y, layout.panels[i])) return i;
  }
  return -1;
}
