// Screenshot scenes for VICE PANELS.
// The screenshot script drives the app through its query string:
//   ?shot=cover  renders only the finished poster, full-frame
//   ?shot=editor shows the normal editor with a composed cover in it
// Both modes accept layout, grade, caption, subtitle, heat and size
// parameters so each screenshot can show a different poster, plus paint=
// (off, ink or kuwahara) for the paint style, frame=0 / callouts=0 to
// hide the gold frame or the panel callouts, and billing=0 to hide the
// credits block. The older ink=1 spelling still works and means
// paint=ink. This module only parses and describes those scenes; main.js
// does the loading and painting, then flags window.__shotReady once a
// frame is on screen.

// The built-in photographs, in the order panels are filled by default. The
// cycle repeats when a layout has more panels than there are samples, and
// every panel still starts on a different scene for the smaller layouts.
export const SAMPLE_URLS = [
  'samples/boulevard.jpg',
  'samples/convertible.jpg',
  'samples/pier.jpg',
  'samples/rooftop.jpg',
  'samples/neon.jpg',
];

// The sample URL assigned to a panel index under the default assignment.
export function sampleUrlForPanel(index) {
  return SAMPLE_URLS[index % SAMPLE_URLS.length];
}

// Export sizes the shot scenes understand, keyed by their query spelling.
export const SHOT_SIZES = {
  '1080x1080': { w: 1080, h: 1080 },
  '1080x1350': { w: 1080, h: 1350 },
  '1920x1080': { w: 1920, h: 1080 },
  '1080x1920': { w: 1080, h: 1920 },
};

// Reads a ?shot= scene out of a query string. Returns null when the page
// was opened plainly, with no shot requested, so the caller can boot the
// editor in its everyday mode instead.
export function readShotRequest(search) {
  const params = new URLSearchParams(search);
  const mode = params.get('shot');
  if (mode !== 'cover' && mode !== 'editor') return null;
  const sizeKey = params.get('size') ?? '1080x1080';
  const size = SHOT_SIZES[sizeKey] ?? SHOT_SIZES['1080x1080'];
  const heatRaw = Number.parseInt(params.get('heat') ?? '4', 10);
  const paintRaw = params.get('paint');
  const paint = ['off', 'ink', 'kuwahara'].includes(paintRaw)
    ? paintRaw
    : (params.get('ink') === '1' ? 'ink' : null);
  return {
    mode,
    layoutId: params.get('layout') ?? 'classic',
    gradeId: params.get('grade') ?? 'sunset',
    caption: params.get('caption') ?? 'NEON HARBOR',
    subtitle: params.get('subtitle') ?? '',
    heat: Number.isNaN(heatRaw) ? 4 : Math.max(0, Math.min(5, heatRaw)),
    paint,
    frame: params.get('frame') !== '0',
    callouts: params.get('callouts') !== '0',
    billing: params.get('billing') !== '0',
    width: size.w,
    height: size.h,
  };
}
