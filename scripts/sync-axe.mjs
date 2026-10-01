// Copies the vendored axe-core engine into public/vendor so it ships in the
// bundle and can be injected via chrome.scripting.executeScript. The engine is
// never imported into our own code; it is loaded at audit time as a file.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = resolve(root, 'node_modules/axe-core/axe.js');
const dest = resolve(root, 'public/vendor/axe.js');

if (!existsSync(src)) {
  console.warn('[sync-axe] axe-core is not installed yet; skipping copy. Run "npm run sync-axe" after install completes.');
  process.exit(0);
}

// axe-core includes a core-js Object.create fallback for pre-modern browsers.
// Its iframe/javascript: construction is unreachable in supported Chrome, but
// the Web Store flags the string-built URL as obfuscation. Remove the entire
// fallback rather than disguising the URL. Keep the replacement guarded so an
// upstream axe-core update cannot silently change what we publish.
const source = readFileSync(src, 'utf8');
const startMarker = '    var require_object_create = __commonJS(function(exports, module) {';
const endMarker = '    var require_define_built_in = __commonJS(function(exports, module) {';
const start = source.indexOf(startMarker);
const end = source.indexOf(endMarker, start + startMarker.length);
if (
  start < 0 || end < 0 ||
  source.indexOf(startMarker, start + 1) !== -1 ||
  !source.slice(start, end).includes("var JS = 'java' + SCRIPT + ':';") ||
  !source.slice(start, end).includes('module.exports = Object.create || function create')
) {
  throw new Error('[sync-axe] unexpected axe-core Object.create fallback; inspect the new upstream bundle before publishing');
}
const chromeOnlyCreate = `    var require_object_create = __commonJS(function(exports, module) {
      'use strict';
      // Chrome implements Object.create. The obsolete iframe fallback is omitted.
      module.exports = Object.create;
    });
`;
const vendored = source.slice(0, start) + chromeOnlyCreate + source.slice(end);
mkdirSync(dirname(dest), { recursive: true });
writeFileSync(dest, vendored);
rmSync(resolve(root, 'public/vendor/axe.min.js'), { force: true });
console.log('[sync-axe] wrote Chrome-only readable axe.js -> public/vendor/axe.js');
