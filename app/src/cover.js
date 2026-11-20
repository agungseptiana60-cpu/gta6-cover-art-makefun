// The VICE PANELS cover renderer.
// One function, renderCover, paints a complete poster onto any 2D context:
// graded photographs clipped into the layout's panels, heavy ink borders,
// a gradient headline with a script subtitle, a five-star heat meter and
// the VICE PANELS badge ribbon. The editor preview and the PNG export both
// call it, so what the user sees is exactly what they download.
import { layoutById, polygonBounds, shrinkPolygon } from './panels.js';
import { gradeById, paintGradeWash, paintFilmGrain, paintVignette, posterizePixels } from './grades.js';

// Traces a polygon as the current path, scaled from normalised coordinates
// into the pixel space of a w by h cover.
function tracePolygon(ctx, points, w, h) {
  ctx.beginPath();
  points.forEach((p, i) => {
    if (i === 0) ctx.moveTo(p.x * w, p.y * h);
    else ctx.lineTo(p.x * w, p.y * h);
  });
  ctx.closePath();
}

// Draws one photograph so it covers its panel's bounding box: the image is
// scaled until both box dimensions are filled, then the panel state nudges
// it with a zoom multiplier and a fractional offset the user dragged to.
function drawPanelPhoto(ctx, image, points, w, h, view) {
  const box = polygonBounds(points);
  const bx = box.x * w;
  const by = box.y * h;
  const bw = box.w * w;
  const bh = box.h * h;
  if (!image) {
    // An empty panel still needs presence: a deep plum placeholder with a
    // soft diagonal sheen, so an unfinished cover never shows raw black.
    const sheen = ctx.createLinearGradient(bx, by, bx + bw, by + bh);
    sheen.addColorStop(0, '#3a1454');
    sheen.addColorStop(1, '#160a2c');
    ctx.fillStyle = sheen;
    ctx.fillRect(bx, by, bw, bh);
    return;
  }
  const zoom = view?.zoom ?? 1;
  const scale = Math.max(bw / image.naturalWidth, bh / image.naturalHeight) * zoom;
  const dw = image.naturalWidth * scale;
  const dh = image.naturalHeight * scale;
  const ox = (view?.ox ?? 0) * bw;
  const oy = (view?.oy ?? 0) * bh;
  ctx.drawImage(image, bx + (bw - dw) / 2 + ox, by + (bh - dh) / 2 + oy, dw, dh);
}

// The Poster Ink version of a panel photograph. The photo is cover-fitted
// onto a small offscreen canvas the size of the panel's bounding box
// (capped, so a full-bleed panel never posterizes more than a poster's
// worth of pixels), run through the posterize pass, and handed back ready
// to be drawn into the clipped panel. The result is cached on the slot:
// a redraw that changes nothing about this panel reuses the same canvas
// instead of flattening the same pixels again.
function inkedPanelCanvas(slot, points, w, h, grade, levels) {
  const image = slot.image;
  const box = polygonBounds(points);
  const bw = Math.max(2, Math.round(box.w * w));
  const bh = Math.max(2, Math.round(box.h * h));
  const shrink = Math.min(1, 640 / Math.max(bw, bh));
  const ow = Math.max(2, Math.round(bw * shrink));
  const oh = Math.max(2, Math.round(bh * shrink));
  const zoom = slot.zoom ?? 1;
  const key = [
    grade.filter, levels, ow, oh, zoom,
    (slot.ox ?? 0).toFixed(3), (slot.oy ?? 0).toFixed(3),
  ].join('|');
  if (slot._ink && slot._ink.key === key && slot._ink.image === image) {
    return slot._ink.canvas;
  }
  const off = document.createElement('canvas');
  off.width = ow;
  off.height = oh;
  const octx = off.getContext('2d', { willReadFrequently: true });
  octx.fillStyle = '#2a1140';
  octx.fillRect(0, 0, ow, oh);
  octx.filter = grade.filter;
  const scale = Math.max(ow / image.naturalWidth, oh / image.naturalHeight) * zoom;
  const dw = image.naturalWidth * scale;
  const dh = image.naturalHeight * scale;
  const ox = (slot.ox ?? 0) * ow;
  const oy = (slot.oy ?? 0) * oh;
  octx.drawImage(image, (ow - dw) / 2 + ox, (oh - dh) / 2 + oy, dw, dh);
  octx.filter = 'none';
  const pixels = octx.getImageData(0, 0, ow, oh);
  posterizePixels(pixels, levels, grade.inkSaturation ?? 1.3, grade.inkContrast ?? 1.1);
  octx.putImageData(pixels, 0, 0);
  slot._ink = { key, image, canvas: off };
  return off;
}

// Paints one panel's photograph into an already-clipped context: the plain
// graded draw most of the time, or the flattened Poster Ink version when
// the ink pass is on (the Poster Ink grade itself, or the editor's Ink
// toggle laid over any other grade).
function paintPanelPhoto(ctx, slot, points, w, h, grade, inkOn, inkLevels) {
  const image = slot?.image ?? null;
  if (!image || !inkOn) {
    ctx.save();
    ctx.filter = grade.filter;
    drawPanelPhoto(ctx, image, points, w, h, slot);
    ctx.restore();
    return;
  }
  const box = polygonBounds(points);
  const inked = inkedPanelCanvas(slot, points, w, h, grade, inkLevels);
  ctx.drawImage(inked, box.x * w, box.y * h, box.w * w, box.h * h);
}

// Strokes one panel's outline: a thick black ink line first, then a hairline
// of pale light centred on it, which is the two-tone edge poster art uses to
// separate photographs that would otherwise bleed into each other.
function strokePanelEdge(ctx, points, w, h) {
  tracePolygon(ctx, points, w, h);
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#0a0512';
  ctx.lineWidth = Math.max(5, w * 0.009);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255, 240, 220, 0.5)';
  ctx.lineWidth = Math.max(1, w * 0.0016);
  ctx.stroke();
}

// A five-point star path centred at (cx, cy) with the given outer radius.
function traceStar(ctx, cx, cy, radius) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? radius : radius * 0.46;
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

// The heat meter: a row of stars near the foot of the cover. Lit stars burn
// gold with a warm glow; unlit ones stay as dark outlines so the scale of
// five is always readable.
function paintHeatMeter(ctx, w, h, heat) {
  const level = Math.max(0, Math.min(5, Math.round(heat)));
  const radius = Math.min(w, h) * 0.026;
  const gap = radius * 2.5;
  const total = gap * 4;
  const cy = h - radius * 2.1;
  ctx.save();
  ctx.textAlign = 'center';
  for (let i = 0; i < 5; i++) {
    const cx = w / 2 - total / 2 + i * gap;
    traceStar(ctx, cx, cy, radius);
    if (i < level) {
      ctx.shadowColor = 'rgba(255, 170, 40, 0.85)';
      ctx.shadowBlur = radius * 0.7;
      ctx.fillStyle = '#ffc233';
      ctx.fill();
      ctx.shadowBlur = 0;
    } else {
      ctx.fillStyle = 'rgba(10, 5, 20, 0.45)';
      ctx.fill();
    }
    ctx.lineWidth = Math.max(1.5, radius * 0.12);
    ctx.strokeStyle = '#0a0512';
    ctx.stroke();
  }
  ctx.restore();
}

// The badge ribbon: a small angled pill in the lower-left corner carrying
// the app's own name. It is furniture, not a logo copy: plain lettering on
// a sunset gradient, drawn fresh on every cover.
function paintBadgeRibbon(ctx, w, h, accent) {
  const label = 'VICE PANELS';
  const fontSize = Math.min(w, h) * 0.024;
  ctx.save();
  ctx.font = `${fontSize}px Anton, 'Arial Black', sans-serif`;
  const textWidth = ctx.measureText(label).width;
  const padX = fontSize * 0.7;
  const pillW = textWidth + padX * 2;
  const pillH = fontSize * 1.7;
  const x = w * 0.028;
  const y = h - pillH - h * 0.028;
  ctx.translate(x + pillW / 2, y + pillH / 2);
  ctx.rotate(-0.045);
  const grad = ctx.createLinearGradient(-pillW / 2, 0, pillW / 2, 0);
  grad.addColorStop(0, '#ff7a3d');
  grad.addColorStop(0.55, '#ff2e88');
  grad.addColorStop(1, '#7b2ff7');
  ctx.fillStyle = grad;
  ctx.strokeStyle = '#0a0512';
  ctx.lineWidth = Math.max(2, fontSize * 0.14);
  ctx.beginPath();
  ctx.roundRect(-pillW / 2, -pillH / 2, pillW, pillH, pillH / 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 0, fontSize * 0.05);
  ctx.restore();
  void accent;
}

// The billing block: the dense little credits paragraph every real movie
// poster carries along its bottom edge. All the names are invented for
// this app — a fictional studio, fictional cast, fictional crew — set in
// tiny condensed capitals, centred, in two lines tucked under the heat
// meter. It is pure furniture, but it is the furniture that makes a
// collage read as a cinema poster at thumbnail size.
const BILLING_LINES = [
  'VICE PANELS PICTURES PRESENTS · A SOUTH SHORE PRODUCTION',
  'STARRING J. MARLOWE · T. VANCE · L. SOLANO — MUSIC BY THE PALM CLUB — EDITED BY R. CUTTER — DIRECTED BY A. REYES',
];

function paintBillingBlock(ctx, w, h) {
  const unit = Math.min(w, h);
  const family = `'Arial Narrow', 'Liberation Sans Narrow', Arial, sans-serif`;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  try { ctx.letterSpacing = '0.14em'; } catch { /* older engines: spacing is a garnish */ }
  ctx.shadowColor = 'rgba(0,0,0,0.7)';
  ctx.shadowBlur = unit * 0.004;
  ctx.fillStyle = 'rgba(255, 244, 230, 0.88)';
  const baselines = [h - unit * 0.0245, h - unit * 0.0085];
  BILLING_LINES.forEach((line, i) => {
    const size = fitFontSize(ctx, line, family, unit * (i === 0 ? 0.0125 : 0.011), w * 0.66);
    ctx.font = `600 ${size}px ${family}`;
    ctx.fillText(line, w / 2, baselines[i]);
  });
  ctx.restore();
}

// Shrinks a font size until the text fits the allowed width, measuring with
// the context's current font family. Returns the size that fits.
function fitFontSize(ctx, text, family, startSize, maxWidth) {
  let size = startSize;
  const set = () => { ctx.font = `${size}px ${family}`; };
  set();
  while (ctx.measureText(text).width > maxWidth && size > 10) {
    size *= 0.94;
    set();
  }
  return size;
}

// The lettering block at the top centre of the cover: the caption in Anton
// capitals filled with a sunset gradient and ringed in black, and beneath
// it the subtitle in glowing neon-pink script. Both are auto-fitted so a
// long caption shrinks gracefully instead of spilling off the poster.
function paintLettering(ctx, w, h, caption, subtitle) {
  const title = (caption ?? '').trim().toUpperCase();
  const sub = (subtitle ?? '').trim();
  ctx.save();
  // A soft dusk scrim behind the lettering block: bright skies and pale
  // shirts sit right where the words go, and the gradient type needs a
  // darker stage to stay readable on any photograph.
  if (title || sub) {
    const scrimH = h * (sub ? 0.27 : 0.2);
    const scrim = ctx.createLinearGradient(0, 0, 0, scrimH);
    scrim.addColorStop(0, 'rgba(8, 2, 20, 0.52)');
    scrim.addColorStop(1, 'rgba(8, 2, 20, 0)');
    ctx.fillStyle = scrim;
    ctx.fillRect(0, 0, w, scrimH);
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  let cursorY = h * 0.055;
  if (title) {
    const family = `Anton, 'Arial Black', sans-serif`;
    const size = fitFontSize(ctx, title, family, h * 0.115, w * 0.9);
    cursorY += size;
    const grad = ctx.createLinearGradient(0, cursorY - size, 0, cursorY);
    grad.addColorStop(0, '#ffe259');
    grad.addColorStop(0.45, '#ffa751');
    grad.addColorStop(0.75, '#ff2e88');
    grad.addColorStop(1, '#a044ff');
    ctx.font = `${size}px ${family}`;
    ctx.lineJoin = 'round';
    // The 3D extrude: a staircase of dark copies stepping down and to the
    // left behind the face of the letter, so the headline has the carved,
    // dimensional depth of real poster lettering instead of sitting flat
    // on the photograph. Drawn first, with no shadow, so the gradient
    // face and its black outline land cleanly on top of it.
    const depth = Math.max(2, size * 0.055);
    const steps = 5;
    ctx.fillStyle = '#150722';
    for (let i = steps; i >= 1; i--) {
      const t = i / steps;
      ctx.fillText(title, w / 2 - depth * t, cursorY + depth * t);
    }
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = size * 0.16;
    ctx.shadowOffsetY = size * 0.05;
    ctx.strokeStyle = '#0a0512';
    ctx.lineWidth = size * 0.16;
    ctx.strokeText(title, w / 2, cursorY);
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.fillStyle = grad;
    ctx.fillText(title, w / 2, cursorY);
    cursorY += size * 0.28;
  }
  if (sub) {
    const family = `Pacifico, 'Comic Sans MS', cursive`;
    const size = fitFontSize(ctx, sub, family, h * 0.042, w * 0.8);
    cursorY += size;
    ctx.font = `${size}px ${family}`;
    ctx.shadowColor = 'rgba(255, 46, 136, 0.95)';
    ctx.shadowBlur = size * 0.55;
    ctx.fillStyle = '#ffd7ec';
    ctx.fillText(sub, w / 2, cursorY);
    ctx.shadowBlur = size * 0.25;
    ctx.fillStyle = '#ff5da2';
    ctx.fillText(sub, w / 2, cursorY);
    ctx.shadowBlur = 0;
  }
  ctx.restore();
}

// Paints the whole cover described by `state`:
//   { width, height, layoutId, gradeId, slots, caption, subtitle, heat,
//     grain, vignette, ink, billing, selectedIndex }
// where slots is an array parallel to the layout's panels, each entry
// either null or { image, zoom, ox, oy }. `ink` asks for the Poster Ink
// pixel pass over whatever grade is chosen; `billing` (default on) adds
// the movie-poster credits block along the bottom edge.
export function renderCover(ctx, state) {
  const w = state.width;
  const h = state.height;
  const layout = layoutById(state.layoutId);
  const grade = gradeById(state.gradeId);
  const isSnapshots = state.layoutId === 'snapshots';
  const inkOn = state.ink === true || grade.ink === true;
  const inkLevels = grade.inkLevels ?? 5;

  ctx.save();
  ctx.fillStyle = '#0d0618';
  ctx.fillRect(0, 0, w, h);

  layout.panels.forEach((points, index) => {
    const slot = state.slots[index] ?? null;
    ctx.save();
    if (isSnapshots && index > 0) {
      // Polaroid cards: a white card first, then the photograph inset on
      // it, leaving a deeper white chin at the bottom like real instant film.
      tracePolygon(ctx, points, w, h);
      ctx.fillStyle = '#fdfbf6';
      ctx.fill();
      const inset = shrinkPolygon(points, 0.9);
      tracePolygon(ctx, inset, w, h);
      ctx.clip();
      paintPanelPhoto(ctx, slot, inset, w, h, grade, inkOn, inkLevels);
    } else {
      tracePolygon(ctx, points, w, h);
      ctx.clip();
      paintPanelPhoto(ctx, slot, points, w, h, grade, inkOn, inkLevels);
    }
    ctx.restore();
  });

  paintGradeWash(ctx, grade, w, h);

  layout.panels.forEach((points, index) => {
    if (isSnapshots && index === 0) return;
    strokePanelEdge(ctx, points, w, h);
  });

  if (state.selectedIndex != null && state.selectedIndex >= 0) {
    const points = layout.panels[state.selectedIndex];
    if (points) {
      tracePolygon(ctx, points, w, h);
      ctx.save();
      ctx.setLineDash([14, 10]);
      ctx.lineWidth = Math.max(3, w * 0.004);
      ctx.strokeStyle = '#2ee6d6';
      ctx.stroke();
      ctx.restore();
    }
  }

  if (state.grain) paintFilmGrain(ctx, w, h);
  if (state.vignette) paintVignette(ctx, w, h);

  paintLettering(ctx, w, h, state.caption, state.subtitle);
  paintHeatMeter(ctx, w, h, state.heat ?? 0);
  paintBadgeRibbon(ctx, w, h, grade.accent);
  if (state.billing !== false) paintBillingBlock(ctx, w, h);
  ctx.restore();
}
