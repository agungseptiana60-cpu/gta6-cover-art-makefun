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
};

// Grade ids in the order the swatch row shows them.
export const GRADE_ORDER = ['sunset', 'neon', 'golden', 'midnight', 'heatwave'];

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
