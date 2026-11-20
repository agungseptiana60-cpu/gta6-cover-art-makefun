// VICE PANELS editor: state, wiring and exports.
// The editor keeps one plain state object, renders it with renderCover from
// cover.js whenever anything changes, and exports by re-rendering that same
// state onto a fresh canvas at the chosen size, so the PNG a user downloads
// is the poster they were looking at, only bigger.
import { renderCover } from './cover.js';
import { LAYOUTS, LAYOUT_ORDER, layoutById, panelIndexAt } from './panels.js';
import { GRADES, GRADE_ORDER } from './grades.js';
import { readShotRequest, sampleUrlForPanel } from './shots.js';

// The post sizes the size picker offers, as [width, height] pairs.
const POST_SIZES = {
  '1080x1080': [1080, 1080],
  '1080x1350': [1080, 1350],
  '1920x1080': [1920, 1080],
  '1080x1920': [1080, 1920],
};

const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');
const captionInput = document.getElementById('captionInput');
const subtitleInput = document.getElementById('subtitleInput');
const zoomRange = document.getElementById('zoomRange');
const grainToggle = document.getElementById('grainToggle');
const vignetteToggle = document.getElementById('vignetteToggle');
const inkToggle = document.getElementById('inkToggle');
const billingToggle = document.getElementById('billingToggle');
const trayEl = document.getElementById('tray');
const heatLabel = document.getElementById('heatLabel');

// Editor state. slots runs parallel to the active layout's panels; each
// entry is null or { image, zoom, ox, oy } where ox/oy are drag offsets as
// a fraction of the panel box. photos is the user's pool: every picture
// they added plus the built-in samples, each { url, image, name }.
const state = {
  layoutId: 'classic',
  gradeId: 'sunset',
  sizeKey: '1080x1080',
  caption: 'NEON HARBOR',
  subtitle: 'where the heat never sleeps',
  heat: 4,
  grain: true,
  vignette: true,
  ink: false,
  billing: true,
  slots: [],
  selectedPanel: 0,
  selectedPhoto: 0,
  photos: [],
};

const undoStack = [];

function say(message) {
  statusEl.textContent = message;
}

// Loads an image element from a URL (an object URL for user files, a
// relative path for the built-in samples) and resolves once it can draw.
function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`could not load ${url}`));
    img.src = url;
  });
}

// Registers the two display fonts from local files and waits until the
// browser can actually paint with them; rendering before this resolves
// would bake fallback lettering into screenshots and exports alike.
async function loadLocalFonts() {
  const anton = new FontFace('Anton', 'url(./fonts/Anton-Regular.ttf)');
  const pacifico = new FontFace('Pacifico', 'url(./fonts/Pacifico-Regular.ttf)');
  document.fonts.add(anton);
  document.fonts.add(pacifico);
  await Promise.all([anton.load(), pacifico.load()]);
  await document.fonts.ready;
}

// A fresh slot for a photo: centred, unzoomed.
function makeSlot(image) {
  return { image, zoom: 1, ox: 0, oy: 0 };
}

// Remembers the current arrangement so Undo can walk back one step. The
// stack is capped; poster fiddling does not need a deep history.
function pushUndo() {
  undoStack.push(JSON.stringify({
    layoutId: state.layoutId,
    slots: state.slots.map((s) => (s ? { photo: state.photos.indexOf(s.imageRef), zoom: s.zoom, ox: s.ox, oy: s.oy } : null)),
  }));
  if (undoStack.length > 40) undoStack.shift();
}

// Slots keep a back-reference to their pool entry so undo snapshots and
// panel assignment can talk about pool indexes instead of image objects.
function assignPhotoToPanel(panelIndex, photoIndex) {
  const photo = state.photos[photoIndex];
  if (!photo) return;
  const slot = makeSlot(photo.image);
  slot.imageRef = photo;
  state.slots[panelIndex] = slot;
}

// Rebuilds the slot list for the active layout, keeping any arrangement
// that still fits and filling the rest by cycling the photo pool.
function rebuildSlots(keepExisting) {
  const count = layoutById(state.layoutId).panels.length;
  const next = [];
  for (let i = 0; i < count; i++) {
    if (keepExisting && state.slots[i]) next.push(state.slots[i]);
    else if (state.photos.length > 0) {
      const photo = state.photos[i % state.photos.length];
      const slot = makeSlot(photo.image);
      slot.imageRef = photo;
      next.push(slot);
    } else next.push(null);
  }
  state.slots = next;
  if (state.selectedPanel >= count) state.selectedPanel = 0;
}

// Paints the preview canvas at the currently chosen export size. The CSS
// scales the canvas down to fit the editor; its pixel size is the truth.
function redraw() {
  const [w, h] = POST_SIZES[state.sizeKey];
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  renderCover(ctx, {
    width: w,
    height: h,
    layoutId: state.layoutId,
    gradeId: state.gradeId,
    slots: state.slots,
    caption: state.caption,
    subtitle: state.subtitle,
    heat: state.heat,
    grain: state.grain,
    vignette: state.vignette,
    ink: state.ink,
    billing: state.billing,
    selectedIndex: document.body.classList.contains('shot-cover') ? -1 : state.selectedPanel,
  });
  syncControls();
}

// Mirrors state into the controls: picker highlights, the zoom slider's
// value for the selected panel, and the heat readout.
function syncControls() {
  document.querySelectorAll('[data-layout]').forEach((b) => {
    b.classList.toggle('active', b.dataset.layout === state.layoutId);
  });
  document.querySelectorAll('[data-grade]').forEach((b) => {
    b.classList.toggle('active', b.dataset.grade === state.gradeId);
  });
  document.querySelectorAll('[data-size]').forEach((b) => {
    b.classList.toggle('active', b.dataset.size === state.sizeKey);
  });
  document.querySelectorAll('[data-heat]').forEach((b) => {
    b.classList.toggle('active', Number(b.dataset.heat) === state.heat);
  });
  const slot = state.slots[state.selectedPanel];
  zoomRange.value = String(Math.round((slot?.zoom ?? 1) * 100));
  heatLabel.textContent = `${state.heat} / 5`;
  document.getElementById('panelLabel').textContent =
    `Panel ${state.selectedPanel + 1} of ${layoutById(state.layoutId).panels.length}`;
}

// Rebuilds the photo tray thumbnails, marking the pool photo that new
// panel clicks will place.
function renderTray() {
  trayEl.replaceChildren();
  state.photos.forEach((photo, index) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'thumb' + (index === state.selectedPhoto ? ' active' : '');
    btn.title = photo.name;
    const img = document.createElement('img');
    img.src = photo.url;
    img.alt = photo.name;
    btn.appendChild(img);
    btn.addEventListener('click', () => {
      state.selectedPhoto = index;
      pushUndo();
      assignPhotoToPanel(state.selectedPanel, index);
      redraw();
      renderTray();
      say(`${photo.name} placed in panel ${state.selectedPanel + 1}. Click another panel to place it there too.`);
    });
    trayEl.appendChild(btn);
  });
}

// Loads the five built-in samples into the pool and composes the default
// cover from them, so the editor opens on a finished-looking poster.
async function loadSamples() {
  state.photos = [];
  const names = ['Boulevard', 'Convertible', 'Pier', 'Rooftop', 'Neon'];
  for (let i = 0; i < names.length; i++) {
    const url = sampleUrlForPanel(i);
    const image = await loadImage(url);
    state.photos.push({ url, image, name: `Sample: ${names[i]}` });
  }
  state.selectedPhoto = 0;
  rebuildSlots(false);
  renderTray();
}

// Renders the state onto a throwaway canvas at an exact size and downloads
// it as a PNG. Used by both export buttons.
function exportPng(sizeKey) {
  const [w, h] = POST_SIZES[sizeKey];
  const off = document.createElement('canvas');
  off.width = w;
  off.height = h;
  renderCover(off.getContext('2d'), {
    width: w,
    height: h,
    layoutId: state.layoutId,
    gradeId: state.gradeId,
    slots: state.slots,
    caption: state.caption,
    subtitle: state.subtitle,
    heat: state.heat,
    grain: state.grain,
    vignette: state.vignette,
    ink: state.ink,
    billing: state.billing,
    selectedIndex: -1,
  });
  off.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `vice-panels-${sizeKey}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    say(`Saved vice-panels-${sizeKey}.png`);
  }, 'image/png');
}

// Builds the picker buttons from the layout and grade tables so the HTML
// stays lean and the labels can never drift from the renderer's data.
function buildPickers() {
  const layoutBox = document.getElementById('layoutPicker');
  for (const id of LAYOUT_ORDER) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.layout = id;
    b.textContent = LAYOUTS[id].label;
    b.addEventListener('click', () => {
      if (state.layoutId === id) return;
      pushUndo();
      state.layoutId = id;
      rebuildSlots(true);
      redraw();
    });
    layoutBox.appendChild(b);
  }
  const gradeBox = document.getElementById('gradePicker');
  for (const id of GRADE_ORDER) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.grade = id;
    b.className = 'swatch';
    b.textContent = GRADES[id].label;
    b.addEventListener('click', () => {
      state.gradeId = id;
      redraw();
    });
    gradeBox.appendChild(b);
  }
  const sizeBox = document.getElementById('sizePicker');
  for (const key of Object.keys(POST_SIZES)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.size = key;
    b.textContent = key.replace('x', ' × ');
    b.addEventListener('click', () => {
      state.sizeKey = key;
      redraw();
    });
    sizeBox.appendChild(b);
  }
  const heatBox = document.getElementById('heatPicker');
  for (let n = 0; n <= 5; n++) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.heat = String(n);
    b.textContent = n === 0 ? 'None' : '★'.repeat(n);
    b.addEventListener('click', () => {
      state.heat = n;
      redraw();
    });
    heatBox.appendChild(b);
  }
}

// Pointer handling on the preview: a press selects the panel under the
// pointer, and moving while pressed drags that panel's photo around. Drag
// deltas are converted from screen pixels into fractions of the panel box.
let drag = null;
canvas.addEventListener('pointerdown', (event) => {
  const rect = canvas.getBoundingClientRect();
  const nx = (event.clientX - rect.left) / rect.width;
  const ny = (event.clientY - rect.top) / rect.height;
  const index = panelIndexAt(layoutById(state.layoutId), nx, ny);
  if (index < 0) return;
  state.selectedPanel = index;
  const slot = state.slots[index];
  if (slot) {
    drag = { startX: event.clientX, startY: event.clientY, ox: slot.ox, oy: slot.oy, moved: false };
    canvas.setPointerCapture(event.pointerId);
  }
  redraw();
});
canvas.addEventListener('pointermove', (event) => {
  if (!drag) return;
  const slot = state.slots[state.selectedPanel];
  if (!slot) return;
  const rect = canvas.getBoundingClientRect();
  const dx = ((event.clientX - drag.startX) / rect.width) * canvas.width;
  const dy = ((event.clientY - drag.startY) / rect.height) * canvas.height;
  if (Math.abs(event.clientX - drag.startX) + Math.abs(event.clientY - drag.startY) > 3 && !drag.moved) {
    pushUndo();
    drag.moved = true;
  }
  const [w, h] = POST_SIZES[state.sizeKey];
  slot.ox = drag.ox + dx / w;
  slot.oy = drag.oy + dy / h;
  redraw();
});
canvas.addEventListener('pointerup', () => { drag = null; });
canvas.addEventListener('pointercancel', () => { drag = null; });

// Wires every remaining control once, at boot.
function wireControls() {
  document.getElementById('fileInput').addEventListener('change', async (event) => {
    const files = [...event.target.files];
    if (files.length === 0) return;
    say(`Loading ${files.length} photo(s)…`);
    for (const file of files) {
      const url = URL.createObjectURL(file);
      const image = await loadImage(url);
      state.photos.push({ url, image, name: file.name });
    }
    state.selectedPhoto = state.photos.length - files.length;
    pushUndo();
    assignPhotoToPanel(state.selectedPanel, state.selectedPhoto);
    renderTray();
    redraw();
    say('Photos added locally — nothing was uploaded. Click panels to place the selected photo.');
  });
  captionInput.addEventListener('input', () => { state.caption = captionInput.value; redraw(); });
  subtitleInput.addEventListener('input', () => { state.subtitle = subtitleInput.value; redraw(); });
  zoomRange.addEventListener('input', () => {
    const slot = state.slots[state.selectedPanel];
    if (slot) {
      slot.zoom = Number(zoomRange.value) / 100;
      redraw();
    }
  });
  grainToggle.addEventListener('change', () => { state.grain = grainToggle.checked; redraw(); });
  vignetteToggle.addEventListener('change', () => { state.vignette = vignetteToggle.checked; redraw(); });
  inkToggle.addEventListener('change', () => { state.ink = inkToggle.checked; redraw(); });
  billingToggle.addEventListener('change', () => { state.billing = billingToggle.checked; redraw(); });
  document.getElementById('fillAllBtn').addEventListener('click', () => {
    pushUndo();
    for (let i = 0; i < state.slots.length; i++) assignPhotoToPanel(i, state.selectedPhoto);
    redraw();
    say('Every panel now shows the selected photo.');
  });
  document.getElementById('samplesBtn').addEventListener('click', async () => {
    pushUndo();
    await loadSamples();
    redraw();
    say('Sample photos restored across the panels.');
  });
  document.getElementById('shuffleBtn').addEventListener('click', () => {
    pushUndo();
    const order = state.slots.slice();
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    state.slots = order;
    redraw();
    say('Panels shuffled.');
  });
  document.getElementById('undoBtn').addEventListener('click', undoLast);
  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      undoLast();
    }
  });
  document.getElementById('exportBtn').addEventListener('click', () => exportPng(state.sizeKey));
  document.getElementById('exportAllBtn').addEventListener('click', () => {
    for (const key of Object.keys(POST_SIZES)) exportPng(key);
    say('Exporting all four sizes…');
  });
}

// Restores the most recent undo snapshot, if there is one.
function undoLast() {
  const raw = undoStack.pop();
  if (!raw) {
    say('Nothing to undo yet.');
    return;
  }
  const snap = JSON.parse(raw);
  state.layoutId = snap.layoutId;
  state.slots = snap.slots.map((s) => {
    if (!s || s.photo < 0 || !state.photos[s.photo]) return null;
    const slot = { image: state.photos[s.photo].image, zoom: s.zoom, ox: s.ox, oy: s.oy };
    slot.imageRef = state.photos[s.photo];
    return slot;
  });
  redraw();
  say('Undone.');
}

// Applies a shot scene to the state and the visible controls, so editor
// screenshots show the same poster the query describes.
function applyShot(shot) {
  state.layoutId = shot.layoutId;
  state.gradeId = shot.gradeId;
  state.caption = shot.caption;
  state.subtitle = shot.subtitle;
  state.heat = shot.heat;
  state.ink = shot.ink === true;
  state.billing = shot.billing !== false;
  inkToggle.checked = state.ink;
  billingToggle.checked = state.billing;
  const key = `${shot.width}x${shot.height}`;
  if (POST_SIZES[key]) state.sizeKey = key;
  captionInput.value = shot.caption;
  subtitleInput.value = shot.subtitle;
}

// Boots the page: fonts first, then samples, then either a shot scene or
// the everyday editor. The shot-ready flag is raised only after a painted
// frame, which is what the screenshot script waits for.
async function boot() {
  buildPickers();
  wireControls();
  captionInput.value = state.caption;
  subtitleInput.value = state.subtitle;
  grainToggle.checked = state.grain;
  vignetteToggle.checked = state.vignette;
  inkToggle.checked = state.ink;
  billingToggle.checked = state.billing;
  const shot = readShotRequest(location.search);
  try {
    await loadLocalFonts();
  } catch {
    say('Display fonts failed to load; using system fallbacks.');
  }
  await loadSamples();
  if (shot) {
    applyShot(shot);
    rebuildSlots(true);
    renderTray();
    if (shot.mode === 'cover') document.body.classList.add('shot-cover');
    redraw();
    requestAnimationFrame(() => requestAnimationFrame(() => { window.__shotReady = true; }));
  } else {
    redraw();
    say('Samples are loaded — add your own photos, pick a layout, export your cover.');
  }
}

boot();
