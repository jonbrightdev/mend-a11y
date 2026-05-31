// Copies the vendored axe-core engine into public/vendor so it ships in the
// bundle and can be injected via chrome.scripting.executeScript. The engine is
// never imported into our own code; it is loaded at audit time as a file.
import { existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = resolve(root, 'node_modules/axe-core/axe.min.js');
const dest = resolve(root, 'public/vendor/axe.min.js');

if (!existsSync(src)) {
  console.warn('[sync-axe] axe-core is not installed yet; skipping copy. Run "npm run sync-axe" after install completes.');
  process.exit(0);
}

mkdirSync(dirname(dest), { recursive: true });
copyFileSync(src, dest);
console.log('[sync-axe] copied axe.min.js -> public/vendor/axe.min.js');
