// Colour grades and finishing passes for VICE PANELS.
// A grade is two things at once: a canvas filter string applied while each
// photograph is drawn (so skin, sky and paintwork all shift together), and a
// translucent gradient wash laid over the finished panels to marry them into
// one poster. The finishing passes, grain and vignette, run last of all.

// Each wash is described as gradient stops from the top of the cover to the
// bottom: offset 0 is the sky, offset 1 is the street.
export const GRADES = {
  sunset: {
    label: 'Sunset Vice',
    filter: 'saturate(1.35) contrast(1.08) brightness(1.03)',
    wash: [
      [0, 'rgba(64, 16, 96, 0.28)'],
      [0.45, 'rgba(255, 94, 98, 0.10)'],
      [0.75, 'rgba(255, 140, 66, 0.16)'],
      [1, 'rgba(120, 20, 90, 0.34)'],
    ],
    accent: '#ffb347',
  },
  neon: {
    label: 'Neon Nights',
    filter: 'saturate(1.5) contrast(1.22) brightness(0.98)',
    wash: [
      [0, 'rgba(0, 40, 70, 0.30)'],
      [0.5, 'rgba(0, 180, 200, 0.10)'],
      [1, 'rgba(200, 30, 140, 0.32)'],
    ],
    accent: '#2ee6d6',
  },
  golden: {
    label: 'Golden Hour',
    filter: 'saturate(1.2) contrast(1.05) brightness(1.1) sepia(0.22)',
    wash: [
      [0, 'rgba(120, 60, 10, 0.16)'],
      [0.55, 'rgba(255, 170, 60, 0.12)'],
      [1, 'rgba(90, 30, 60, 0.26)'],
    ],
    accent: '#ffd166',
  },
  midnight: {
    label: 'Midnight',
    filter: 'saturate(1.1) contrast(1.18) brightness(0.86)',
    wash: [
      [0, 'rgba(4, 10, 40, 0.42)'],
      [0.6, 'rgba(10, 60, 90, 0.18)'],
      [1, 'rgba(2, 6, 30, 0.48)'],
    ],
    accent: '#7ab8ff',
  },
  heatwave: {
    label: 'Heatwave',
    filter: 'saturate(1.6) contrast(1.15) brightness(1.05)',
    wash: [
      [0, 'rgba(255, 80, 20, 0.20)'],
      [0.5, 'rgba(255, 30, 60, 0.12)'],
      [1, 'rgba(80, 0, 40, 0.36)'],
    ],
    accent: '#ff5d3a',
  },
  acid: {
    label: 'Acid Pop',
    filter: 'saturate(1.85) contrast(1.14) brightness(1.05) hue-rotate(-10deg)',
    wash: [
      [0, 'rgba(255, 46, 166, 0.22)'],
      [0.5, 'rgba(120, 0, 200, 0.10)'],
      [1, 'rgba(0, 200, 190, 0.26)'],
    ],
    accent: '#2effd8',
  },
  ink: {
    // Poster Ink is more than a filter: the renderer runs every panel
    // photograph through posterizePixels (below) so the colours flatten
    // into a few bold levels, the way a screen-printed poster is built
    // from a handful of inks. The filter string here is only the gentle
    // pre-grade the pixels get before they are flattened.
    label: 'Poster Ink',
    filter: 'saturate(1.2) contrast(1.08) brightness(1.02)',
    wash: [
      [0, 'rgba(70, 20, 90, 0.20)'],
      [0.55, 'rgba(255, 120, 60, 0.08)'],
      [1, 'rgba(90, 10, 70, 0.26)'],
    ],
    accent: '#ffb347',
    ink: true,
    paint: 'ink',
    inkLevels: 4,
    inkSaturation: 1.35,
    inkContrast: 1.12,
  },
  kuwahara: {
    // Kuwahara Paint runs every panel photograph through a real
    // Kuwahara filter (kuwaharaPixels, below): each pixel takes the
    // average colour of whichever quadrant around it is smoothest, so
    // flat areas melt into brush fields while edges stay where the
    // photograph put them. A light posterize afterwards flattens the
    // fields a touch further and lifts the saturation, the way a
    // painted poster keeps its colours louder than life.
    label: 'Kuwahara Paint',
    filter: 'saturate(1.12) contrast(1.04) brightness(1.01)',
    wash: [
      [0, 'rgba(64, 16, 96, 0.24)'],
      [0.5, 'rgba(255, 94, 98, 0.08)'],
      [1, 'rgba(120, 20, 90, 0.30)'],
    ],
    accent: '#ffd166',
    paint: 'kuwahara',
    kuwaRadius: 4,
    kuwaLevels: 6,
    kuwaSaturation: 1.18,
    kuwaContrast: 1.04,
  },
};

// Grade ids in the order the swatch row shows them.
export const GRADE_ORDER = ['sunset', 'neon', 'golden', 'midnight', 'heatwave', 'acid', 'ink', 'kuwahara'];

// Returns the grade record for an id, defaulting to Sunset Vice.
export function gradeById(id) {
  return GRADES[id] ?? GRADES.sunset;
}

// Paints a grade's wash over a rectangle that spans the whole cover. The
// caller decides when in the paint order this happens; VICE PANELS washes
// after the panels are drawn but before borders and lettering go on.
export function paintGradeWash(ctx, grade, w, h) {
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  for (const [offset, colour] of grade.wash) grad.addColorStop(offset, colour);
  ctx.save();
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

// A tiny deterministic random source (mulberry32). Grain must look identical
// every time the same cover is re-rendered or exported, so Math.random is
// never used for it: the seed pins the speckle pattern in place.
export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The Poster Ink pixel pass. Each channel is pushed through a contrast
// curve and a saturation stretch, then snapped to the nearest of a few
// flat levels, so a photograph stops looking photographed and starts
// looking printed: skies become one bold slab of colour, shadows merge,
// and edges between tones go crisp. It runs on ImageData the caller has
// already sized to a panel, never on the full-resolution original, which
// keeps it fast enough to re-run on every editor redraw.
export function posterizePixels(imageData, levels = 5, saturation = 1.3, contrast = 1.1) {
  const data = imageData.data;
  const steps = Math.max(1, Math.round(levels) - 1);
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i] / 255;
    let g = data[i + 1] / 255;
    let b = data[i + 2] / 255;
    // Contrast around mid-grey first, so the levels that survive the
    // posterize are the ones that carry the picture.
    r = (r - 0.5) * contrast + 0.5;
    g = (g - 0.5) * contrast + 0.5;
    b = (b - 0.5) * contrast + 0.5;
    // Saturation: push each channel away from the pixel's own luminance.
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    r = luma + (r - luma) * saturation;
    g = luma + (g - luma) * saturation;
    b = luma + (b - luma) * saturation;
    // Snap to the level grid, clamping the overshoot the two stretches
    // above can produce.
    data[i] = Math.round(Math.min(1, Math.max(0, Math.round(r * steps) / steps)) * 255);
    data[i + 1] = Math.round(Math.min(1, Math.max(0, Math.round(g * steps) / steps)) * 255);
    data[i + 2] = Math.round(Math.min(1, Math.max(0, Math.round(b * steps) / steps)) * 255);
  }
  return imageData;
}

// The Kuwahara paint pass. The classic painterly filter: around every
// pixel sit four overlapping quadrants; the pixel takes the mean colour
// of the quadrant whose luminance varies least. Smooth regions (skies,
// walls, skin) therefore collapse into flat fields of averaged colour —
// the look of paint laid down in blocks — while a quadrant straddling a
// real edge has high variance and loses, so edges survive sharp.
// Quadrant statistics come from integral images (summed-area tables of
// the channel values and of luminance and its square), which makes each
// quadrant's mean and variance an O(1) lookup: the whole pass stays a
// single linear sweep however large the radius.
export function kuwaharaPixels(imageData, radius = 4) {
  const w = imageData.width;
  const h = imageData.height;
  const data = imageData.data;
  if (w < 3 || h < 3 || radius < 1) return imageData;
  const stride = w + 1;
  const size = stride * (h + 1);
  const sumR = new Float64Array(size);
  const sumG = new Float64Array(size);
  const sumB = new Float64Array(size);
  const sumL = new Float64Array(size);
  const sumL2 = new Float64Array(size);
  for (let y = 0; y < h; y++) {
    let rowR = 0;
    let rowG = 0;
    let rowB = 0;
    let rowL = 0;
    let rowL2 = 0;
    const srcRow = y * w * 4;
    const dstRow = (y + 1) * stride;
    const upRow = y * stride;
    for (let x = 0; x < w; x++) {
      const i = srcRow + x * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      rowR += r;
      rowG += g;
      rowB += b;
      rowL += luma;
      rowL2 += luma * luma;
      const j = dstRow + x + 1;
      sumR[j] = sumR[upRow + x + 1] + rowR;
      sumG[j] = sumG[upRow + x + 1] + rowG;
      sumB[j] = sumB[upRow + x + 1] + rowB;
      sumL[j] = sumL[upRow + x + 1] + rowL;
      sumL2[j] = sumL2[upRow + x + 1] + rowL2;
    }
  }
  // Sum of a table over the inclusive pixel rectangle (x1..x2, y1..y2).
  const rectSum = (table, x1, y1, x2, y2) =>
    table[(y2 + 1) * stride + x2 + 1] - table[y1 * stride + x2 + 1] -
    table[(y2 + 1) * stride + x1] + table[y1 * stride + x1];
  const r = Math.round(radius);
  for (let y = 0; y < h; y++) {
    const yTop = Math.max(0, y - r);
    const yBot = Math.min(h - 1, y + r);
    for (let x = 0; x < w; x++) {
      const xLeft = Math.max(0, x - r);
      const xRight = Math.min(w - 1, x + r);
      // The four quadrants: [x1, y1, x2, y2] each anchored on the pixel.
      const quads = [
        [xLeft, yTop, x, y],
        [x, yTop, xRight, y],
        [xLeft, y, x, yBot],
        [x, y, xRight, yBot],
      ];
      let best = null;
      let bestVar = Infinity;
      for (const [qx1, qy1, qx2, qy2] of quads) {
        const count = (qx2 - qx1 + 1) * (qy2 - qy1 + 1);
        const meanL = rectSum(sumL, qx1, qy1, qx2, qy2) / count;
        const variance = rectSum(sumL2, qx1, qy1, qx2, qy2) / count - meanL * meanL;
        if (variance < bestVar) {
          bestVar = variance;
          best = [qx1, qy1, qx2, qy2, count];
        }
      }
      const [bx1, by1, bx2, by2, bCount] = best;
      const i = (y * w + x) * 4;
      data[i] = rectSum(sumR, bx1, by1, bx2, by2) / bCount;
      data[i + 1] = rectSum(sumG, bx1, by1, bx2, by2) / bCount;
      data[i + 2] = rectSum(sumB, bx1, by1, bx2, by2) / bCount;
    }
  }
  return imageData;
}

// Sprinkles film grain over the cover: thousands of one-pixel specks, half
// light and half dark, at a low alpha so the effect reads as texture rather
// than noise. The count scales with area so exports and previews match.
export function paintFilmGrain(ctx, w, h, seed = 2026) {
  const rand = seededRandom(seed);
  const count = Math.round((w * h) / 900);
  ctx.save();
  for (let i = 0; i < count; i++) {
    const x = rand() * w;
    const y = rand() * h;
    const light = rand() > 0.5;
    ctx.fillStyle = light ? 'rgba(255,255,255,0.055)' : 'rgba(0,0,0,0.06)';
    ctx.fillRect(x, y, 1.4, 1.4);
  }
  ctx.restore();
}

// Darkens the corners with a radial falloff, the classic poster vignette.
// The middle stays untouched so faces in the hero panel keep their light.
export function paintVignette(ctx, w, h, strength = 0.42) {
  const radius = Math.hypot(w, h) * 0.62;
  const grad = ctx.createRadialGradient(w / 2, h / 2, radius * 0.45, w / 2, h / 2, radius);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, `rgba(5,0,16,${strength})`);
  ctx.save();
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}
