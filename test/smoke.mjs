// Loads the built extension into Chrome and checks the side panel mounts
// without uncaught errors. Requires a built dist/ (run `npm run build` first)
// and a browser (Puppeteer downloads Chrome for Testing on install).
//
// In CI this runs under xvfb with a headful browser, since extension loading
// is most reliable that way. Run with: node test/smoke.mjs
import puppeteer from 'puppeteer';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist');

if (!existsSync(resolve(DIST, 'manifest.json'))) {
  console.error(`[smoke] No build found at ${DIST}. Run "npm run build" first.`);
  process.exit(1);
}

const checks = [];
const ok = (name, cond) => checks.push([name, Boolean(cond)]);

let browser;
try {
  browser = await puppeteer.launch({
    headless: false,
    args: [
      `--disable-extensions-except=${DIST}`,
      `--load-extension=${DIST}`,
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
    ],
  });

  // The service worker target appears once the extension loads; its URL host
  // is the generated extension id.
  const swTarget = await browser.waitForTarget(
    (t) => t.type() === 'service_worker' && t.url().startsWith('chrome-extension://'),
    { timeout: 20_000 },
  );
  const extId = new URL(swTarget.url()).hostname;
  ok('service worker registered', extId);

  const page = await browser.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });

  const url = `chrome-extension://${extId}/src/sidepanel/index.html`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20_000 });

  await page.waitForSelector('.brand', { timeout: 15_000 });
  const brand = (await page.$eval('.brand', (el) => el.textContent || '')).trim();
  const hasButton = (await page.$('button')) !== null;

  ok('side panel renders the Mend brand', brand.includes('Mend'));
  ok('empty state offers a control', hasButton);
  ok('no uncaught page errors', pageErrors.length === 0);

  if (pageErrors.length) console.error('[smoke] page errors:\n  ' + pageErrors.join('\n  '));
  if (consoleErrors.length) console.warn('[smoke] console errors (non-fatal):\n  ' + consoleErrors.join('\n  '));
} catch (err) {
  console.error('[smoke] failed to run:', err);
  ok('smoke test ran to completion', false);
} finally {
  await browser?.close();
}

let pass = 0;
for (const [name, cond] of checks) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`);
  if (cond) pass++;
}
console.log(`\n${pass}/${checks.length} checks passed`);
process.exit(pass === checks.length && checks.length > 0 ? 0 : 1);
