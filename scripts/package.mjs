// Package the production build into a Chrome Web Store zip.
//
// Run via `npm run prod` (which builds first) or `npm run package` against an
// existing dist/. Writes mend-a11y-<version>.zip to the repo root with
// manifest.json at the zip root, which is what Chrome expects on upload.
//
// Guardrails encode lessons from past submissions: a `key` field breaks Web
// Store updates, the manifest version must track package.json, and source maps
// must never ship.

import { execFileSync } from 'node:child_process';
import { existsSync, rmSync, readFileSync, statSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = join(root, 'dist');

function fail(message) {
  console.error(`\n[package] ${message}\n`);
  process.exit(1);
}

// The build must have run.
if (!existsSync(distDir)) {
  fail('dist/ not found. Run `npm run build` first, or use `npm run prod`.');
}

// Chrome reads manifest.json from the zip root, so it has to sit at dist/ root.
const manifestPath = join(distDir, 'manifest.json');
if (!existsSync(manifestPath)) {
  fail('dist/manifest.json is missing; the build did not produce a valid extension.');
}

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

if ('key' in manifest) {
  fail(
    'manifest.json contains a `key` field. The Web Store rejects this when ' +
      'updating a published item. Remove it from manifest.config.ts and rebuild.',
  );
}
if (manifest.version !== pkg.version) {
  fail(
    `Version mismatch: manifest.json is ${manifest.version} but package.json is ` +
      `${pkg.version}. The manifest is baked from package.json at build time, so ` +
      'run `npm run build` to rebuild, or cut the release with `npm run release:patch` ' +
      '(which bumps, builds, and packages in order).',
  );
}

const strayMaps = readdirSync(distDir, { recursive: true }).filter((f) =>
  String(f).endsWith('.map'),
);
if (strayMaps.length > 0) {
  // Defensive: prod builds emit none, but never ship maps if that changes.
  console.warn(`[package] excluding ${strayMaps.length} source map(s) from the zip.`);
}

const zipName = `mend-a11y-${pkg.version}.zip`;
const zipPath = join(root, zipName);

// Always produce a fresh artifact.
if (existsSync(zipPath)) rmSync(zipPath);

// Zip the *contents* of dist/ (not the folder), with clean attributes and no
// maps or OS cruft. execFileSync passes patterns literally (no shell globbing).
try {
  execFileSync(
    'zip',
    ['-qr', '-X', zipPath, '.', '-x', '*.map', '.DS_Store', '__MACOSX*'],
    { cwd: distDir, stdio: 'inherit' },
  );
} catch (err) {
  fail(
    `zip failed: ${err.message}. The \`zip\` CLI is required and is preinstalled ` +
      'on macOS and on GitHub ubuntu runners.',
  );
}

if (!existsSync(zipPath)) fail('zip completed but produced no archive.');

const sizeKb = (statSync(zipPath).size / 1024).toFixed(1);
const rootEntries = readdirSync(distDir).sort().join(', ');

console.log(`\n[package] wrote ${zipName} (${sizeKb} kB)`);
console.log(`[package] zip-root entries: ${rootEntries}`);
console.log('[package] manifest.json is at the zip root, no key field, version ' + manifest.version);
console.log('[package] ready to upload in the Chrome Web Store dashboard.\n');
