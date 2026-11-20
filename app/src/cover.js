// The VICE PANELS cover renderer.
// One function, renderCover, paints a complete poster onto any 2D context:
// graded photographs clipped into the layout's panels, heavy ink borders,
// a gradient headline with a script subtitle, a five-star heat meter and
// the VICE PANELS badge ribbon. The editor preview and the PNG export both
// call it, so what the user sees is exactly what they download.
import { layoutById, polygonBounds, shrinkPolygon } from './panels.js';
import { gradeById, paintGradeWash, paintFilmGrain, paintVignette, posterizePixels, kuwaharaPixels } from './grades.js';

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

// The painted version of a panel photograph. The photo is cover-fitted
// onto a small offscreen canvas the size of the panel's bounding box
// (capped, so a full-bleed panel never paints more than a poster's worth
// of pixels), run through the pixel pass the mode names, and handed back
// ready to be drawn into the clipped panel. Two modes:
//   'ink'      — Poster Ink: colours snapped to a few flat print levels.
//   'kuwahara' — Kuwahara Paint: each pixel takes the smoothest
//                quadrant's mean, melting the photo into brush fields,
//                then a light posterize lifts and flattens them.
// The Kuwahara cap is lower (512 against ink's 640) because its filter
// window is wider; both stay small enough to re-run interactively. The
// result is cached on the slot: a redraw that changes nothing about this
// panel reuses the same canvas instead of painting the same pixels again.
function paintedPanelCanvas(slot, points, w, h, grade, mode) {
  const image = slot.image;
  const box = polygonBounds(points);
  const bw = Math.max(2, Math.round(box.w * w));
  const bh = Math.max(2, Math.round(box.h * h));
  const cap = mode === 'kuwahara' ? 512 : 640;
  const shrink = Math.min(1, cap / Math.max(bw, bh));
  const ow = Math.max(2, Math.round(bw * shrink));
  const oh = Math.max(2, Math.round(bh * shrink));
  const zoom = slot.zoom ?? 1;
  const flavour = mode === 'kuwahara'
    ? `k${grade.kuwaRadius ?? 4}/${grade.kuwaLevels ?? 6}`
    : `i${grade.inkLevels ?? 5}`;
  const key = [
    mode, grade.filter, flavour, ow, oh, zoom,
    (slot.ox ?? 0).toFixed(3), (slot.oy ?? 0).toFixed(3),
  ].join('|');
  if (slot._paint && slot._paint.key === key && slot._paint.image === image) {
    return slot._paint.canvas;
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
  if (mode === 'kuwahara') {
    kuwaharaPixels(pixels, grade.kuwaRadius ?? 4);
    posterizePixels(pixels, grade.kuwaLevels ?? 6, grade.kuwaSaturation ?? 1.18, grade.kuwaContrast ?? 1.04);
  } else {
    posterizePixels(pixels, grade.inkLevels ?? 5, grade.inkSaturation ?? 1.3, grade.inkContrast ?? 1.1);
  }
  octx.putImageData(pixels, 0, 0);
  slot._paint = { key, image, canvas: off };
  return off;
}

// Paints one panel's photograph into an already-clipped context: the plain
// graded draw most of the time, or a painted version when a paint mode is
// active — the grade's own (the Poster Ink and Kuwahara Paint grades) or
// the editor's paint style laid over any other grade.
function paintPanelPhoto(ctx, slot, points, w, h, grade, paintMode) {
  const image = slot?.image ?? null;
  if (!image || !paintMode) {
    ctx.save();
    ctx.filter = grade.filter;
    drawPanelPhoto(ctx, image, points, w, h, slot);
    ctx.restore();
    return;
  }
  const box = polygonBounds(points);
  const painted = paintedPanelCanvas(slot, points, w, h, grade, paintMode);
  ctx.drawImage(painted, box.x * w, box.y * h, box.w * w, box.h * h);
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

// The gold frame: a thin double rule inset from the cover's edge, with a
// small diamond flourish sitting on each corner. Gallery framing is the
// oldest trick in poster printing — it tells the eye the collage inside
// is a finished piece, not a draft — and the double line (one bright, one
// deep gold) keeps it reading as metal rather than a yellow border.
function paintGoldFrame(ctx, w, h) {
  const unit = Math.min(w, h);
  const inset = unit * 0.02;
  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, '#f7e08b');
  grad.addColorStop(0.5, '#caa437');
  grad.addColorStop(1, '#f1d47a');
  ctx.save();
  ctx.strokeStyle = grad;
  ctx.lineWidth = Math.max(2, unit * 0.0045);
  ctx.strokeRect(inset, inset, w - inset * 2, h - inset * 2);
  const inset2 = inset + unit * 0.011;
  ctx.strokeStyle = 'rgba(245, 217, 126, 0.8)';
  ctx.lineWidth = Math.max(1, unit * 0.0018);
  ctx.strokeRect(inset2, inset2, w - inset2 * 2, h - inset2 * 2);
  // Corner diamonds: a small rotated square centred on each corner of
  // the outer rule, like the studs on a framed print.
  const gem = unit * 0.009;
  ctx.fillStyle = grad;
  ctx.strokeStyle = '#0a0512';
  ctx.lineWidth = Math.max(1, unit * 0.002);
  const corners = [
    [inset, inset],
    [w - inset, inset],
    [inset, h - inset],
    [w - inset, h - inset],
  ];
  for (const [cx, cy] of corners) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.PI / 4);
    ctx.beginPath();
    ctx.rect(-gem / 2, -gem / 2, gem, gem);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

// Panel callouts: small caption chips pinned near the foot of the first
// few panels, each naming its scene the way a poster names its set
// pieces. The wording is invented furniture — story beats, not brands —
// set in condensed capitals on a dark chip with a gold edge, tilted a
// degree or two so they feel stuck on rather than typeset.
const CALLOUT_LABELS = ['THE GETAWAY', 'THE PIER AT DUSK', 'THE CREW', 'MIDNIGHT RUN', 'THE DROP', 'PALM ROW'];
const CALLOUT_TILTS = [-0.05, 0.04, -0.03];

function paintCallouts(ctx, w, h, layout) {
  const unit = Math.min(w, h);
  const family = `'Arial Narrow', 'Liberation Sans Narrow', Arial, sans-serif`;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  layout.panels.slice(0, 3).forEach((points, i) => {
    const box = polygonBounds(points);
    const label = CALLOUT_LABELS[i % CALLOUT_LABELS.length];
    const size = unit * 0.02;
    ctx.font = `700 ${size}px ${family}`;
    try { ctx.letterSpacing = '0.08em'; } catch { /* garnish only */ }
    const chipW = ctx.measureText(label).width + size * 1.2;
    const chipH = size * 1.8;
    // Anchored a third of the way across the panel's foot, lifted clear
    // of the heat meter and billing band along the cover's bottom edge.
    let cx = (box.x + box.w * 0.3) * w;
    const bottom = Math.min((box.y + box.h) * h - unit * 0.014, h * 0.885);
    const cy = bottom - chipH / 2;
    cx = Math.max(chipW / 2 + unit * 0.012, Math.min(w - chipW / 2 - unit * 0.012, cx));
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(CALLOUT_TILTS[i % CALLOUT_TILTS.length]);
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = unit * 0.008;
    ctx.beginPath();
    ctx.roundRect(-chipW / 2, -chipH / 2, chipW, chipH, chipH * 0.28);
    ctx.fillStyle = 'rgba(10, 5, 18, 0.85)';
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(245, 217, 126, 0.9)';
    ctx.lineWidth = Math.max(1, unit * 0.002);
    ctx.stroke();
    ctx.fillStyle = '#ffeec4';
    ctx.fillText(label, 0, size * 0.04);
    ctx.restore();
  });
  ctx.restore();
}

// The film strip's sprocket holes: a row of pale rounded slots punched
// through the dark gutter between the hero frame and the strip below it.
// One row is all the geometry leaves room for, and one row is enough —
// the eye completes the film stock from a single perforated edge.
function paintFilmstripHoles(ctx, w, h) {
  const unit = Math.min(w, h);
  const holeW = unit * 0.017;
  const holeH = unit * 0.011;
  const cy = 0.5825 * h;
  const count = Math.max(8, Math.floor(w / (holeW * 2.2)));
  ctx.save();
  ctx.fillStyle = 'rgba(238, 228, 205, 0.42)';
  for (let i = 0; i < count; i++) {
    const x = ((i + 0.5) * w) / count - holeW / 2;
    ctx.beginPath();
    ctx.roundRect(x, cy - holeH / 2, holeW, holeH, holeH * 0.35);
    ctx.fill();
  }
  ctx.restore();
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
//     grain, vignette, paint, frame, callouts, billing, selectedIndex }
// where slots is an array parallel to the layout's panels, each entry
// either null or { image, zoom, ox, oy }. `paint` is the editor's paint
// style — 'ink' or 'kuwahara' laid over whatever grade is chosen, 'off'
// for none; a grade with its own paint (Poster Ink, Kuwahara Paint)
// paints even when the style is off. `frame` and `callouts` default on,
// as does `billing`, the movie-poster credits block along the bottom.
export function renderCover(ctx, state) {
  const w = state.width;
  const h = state.height;
  const layout = layoutById(state.layoutId);
  const grade = gradeById(state.gradeId);
  const isSnapshots = state.layoutId === 'snapshots';
  let paintMode = grade.paint ?? null;
  if (state.paint != null) {
    if (state.paint === 'ink' || state.paint === 'kuwahara') paintMode = state.paint;
  } else if (state.ink === true && !paintMode) {
    paintMode = 'ink';
  }

  ctx.save();
  ctx.fillStyle = '#0d0618';
  ctx.fillRect(0, 0, w, h);
  if (layout.filmstrip) {
    // The strip half of the cover sits on near-black film stock, darker
    // than the plum backdrop, so the frames and gutters read as one
    // length of film rather than four separate pictures.
    ctx.fillStyle = '#07030d';
    ctx.fillRect(0, h * 0.55, w, h * 0.45);
  }

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
      paintPanelPhoto(ctx, slot, inset, w, h, grade, paintMode);
    } else {
      tracePolygon(ctx, points, w, h);
      ctx.clip();
      paintPanelPhoto(ctx, slot, points, w, h, grade, paintMode);
    }
    ctx.restore();
  });

  paintGradeWash(ctx, grade, w, h);
  if (layout.filmstrip) paintFilmstripHoles(ctx, w, h);

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

  if (state.frame !== false) paintGoldFrame(ctx, w, h);
  if (state.callouts !== false) paintCallouts(ctx, w, h, layout);

  if (state.grain) paintFilmGrain(ctx, w, h);
  if (state.vignette) paintVignette(ctx, w, h);

  paintLettering(ctx, w, h, state.caption, state.subtitle);
  paintHeatMeter(ctx, w, h, state.heat ?? 0);
  paintBadgeRibbon(ctx, w, h, grade.accent);
  if (state.billing !== false) paintBillingBlock(ctx, w, h);
  ctx.restore();
}
