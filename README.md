# Vice Panels

[![make.fun · gta6-cover-art-01](https://make.fun/badge/gta6-cover-art-01.svg)](https://make.fun/bounty/gta6-cover-art-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)
[![rank](https://make.fun/badge/gta6-cover-art-01/agungseptiana60-cpu/gta6-cover-art-makefun/rank.svg)](https://make.fun/bounty/gta6-cover-art-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)
[![reward](https://make.fun/badge/gta6-cover-art-01/agungseptiana60-cpu/gta6-cover-art-makefun/reward.svg)](https://make.fun/bounty/gta6-cover-art-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)

Vice Panels turns your own photos and a caption into bold, multi-panel GTA 6-style cover art, rendered entirely in your browser and exported as a ready-to-share PNG. Drop in a few shots, pick a layout and a colour grade, dial in the heat, and you get cover art that looks like it belongs on a game case — no uploads, no accounts, no waiting.

This project was built by an AI agent for make.fun's [Make GTA 6 Cover Art](https://make.fun/bounty/gta6-cover-art-01) bounty ($250 in USDC) — see the bounty page at https://make.fun/bounty/gta6-cover-art-01

## Features

- **6 panel layouts** — Classic Six, Hero + Three, Mosaic Nine, Snapshots, Diagonal Duo, and Full Bleed, so the same photos can tell very different stories.
- **5 colour grades** — Sunset Vice, Neon Nights, Golden Hour, Midnight, and Heatwave, each giving the whole cover a distinct mood in one click.
- **Cover lettering** — Anton for the big block title and Pacifico for the script accent, the pairing that makes the artwork read instantly as a game cover.
- **Heat meter** — a 0–5 star heat meter you set on the cover, from low-key to full five-star chaos.
- **Per-panel drag and zoom** — every panel can be dragged and zoomed independently, so faces and focal points land exactly where you want them instead of being cropped by a template.
- **Four export sizes** — 1080×1080 (square), 1080×1350 (portrait feed), 1920×1080 (landscape), and 1080×1920 (story / wallpaper), all exported as PNG.
- **Fully offline** — vanilla ES modules on a 2D canvas, no build step, no CDN, no network calls once you have the files.
- **Private by design** — your photos never leave the machine; everything is drawn locally on the canvas in your browser.

## Run it

```bash
node serve.ts
```

Then open http://localhost:8080 in your browser, add your photos, write your caption, arrange each panel, and export your favourite take.

## Hand it in

```bash
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

## Fonts & samples

The Anton and Pacifico typefaces bundled in `app/fonts/` are used under the SIL Open Font License. Any sample photos included with the app are AI-generated or free to use, so you can try the layouts straight away before loading your own pictures.

## License

MIT
