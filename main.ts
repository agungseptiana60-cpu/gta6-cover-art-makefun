// VICE PANELS hand-in program (Node 22, standard library only).
// The deliverable is the static web app in app/ beside this file plus the
// maker's screenshots in screenshots/. This program copies both into the
// output directory and writes the dossier the judge reads, using the kit's
// vendored library so the bytes match what the scorer rebuilds on its side.
// Run it locally with: mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-app.ts';

const repoDir = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(outputDir, { recursive: true });
cpSync(join(repoDir, 'app'), join(outputDir, 'app'), { recursive: true });

const shotsDir = join(outputDir, 'screenshots');
mkdirSync(shotsDir, { recursive: true });
if (existsSync(join(repoDir, 'screenshots'))) {
  cpSync(join(repoDir, 'screenshots'), shotsDir, { recursive: true });
}

const dossierText = buildDossier(outputDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  app_max_files: 993,
  app_max_bytes: 50331648,
  app_path_max_bytes: 1000,
});
writeFileSync(join(outputDir, 'dossier.json'), dossierText);

// A short human-readable summary of what was handed in, so a local run
// shows at a glance that the app, the screenshots and the dossier all made
// it into the output directory.
const shotNames = existsSync(shotsDir) ? readdirSync(shotsDir).sort() : [];
console.log(`VICE PANELS handed in: app copied, ${shotNames.length} screenshot(s) [${shotNames.join(', ')}], dossier ${dossierText.length} bytes.`);
