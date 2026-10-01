// Loads the built extension into Chrome and checks the side panel mounts
// without uncaught errors. Requires a built dist/ (run `npm run build` first)
// and a browser (Puppeteer downloads Chrome for Testing on install).
//
// In CI this runs under xvfb with a headful browser, since extension loading
// is most reliable that way. Run with: node test/smoke.mjs
import puppeteer from 'puppeteer';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist');

if (!existsSync(resolve(DIST, 'manifest.json'))) {
  console.error(`[smoke] No build found at ${DIST}. Run "npm run build" first.`);
  process.exit(1);
}

// The extension page's default MV3 CSP (script-src 'self') blocks the inline
// <script> that page.addScriptTag({ path }) injects, so window.axe never
// gets set (no error is thrown, it just silently fails to load). Injecting
// via page.evaluate instead works because CDP's Runtime.evaluate is not
// subject to the page's CSP.
const AXE_SOURCE = readFileSync(resolve(DIST, 'vendor/axe.js'), 'utf8');

const checks = [];
const ok = (name, cond) => checks.push([name, Boolean(cond)]);

// Injects the vendored axe engine into `page` and runs it against the full
// document, returning the violations array. Uses no `runOnly` restriction:
// the full default ruleset is the bar the panel is held to.
async function selfAudit(page, label) {
  // Several tokens (e.g. --ap-accent) drive a CSS transition, so a theme
  // switch just applied via emulateMediaFeatures can still be mid-animation
  // here even after data-theme has flipped. Freeze all transitions/animations
  // first so color-contrast reads the settled end state, not an interpolated
  // frame - otherwise the check flakes on whichever color the transition
  // happened to be mid-flight through.
  await page.evaluate(() => {
    const style = document.createElement('style');
    style.textContent = '*, *::before, *::after { transition: none !important; animation: none !important; }';
    document.head.appendChild(style);
  });
  await page.evaluate(AXE_SOURCE);
  const violations = await page.evaluate(async () => {
    const result = await window.axe.run(document, { resultTypes: ['violations'] });
    return result.violations;
  });
  if (violations.length) {
    console.error(`[smoke] self-audit (${label}) violations:`);
    for (const v of violations) {
      const targets = v.nodes.map((n) => n.target.join(' ')).join(', ');
      console.error(`  ${v.id} [${v.impact}] - ${targets}`);
    }
  }
  return violations;
}

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
  ok('no console errors', consoleErrors.length === 0);

  if (pageErrors.length) console.error('[smoke] page errors:\n  ' + pageErrors.join('\n  '));
  if (consoleErrors.length) console.warn('[smoke] console errors (non-fatal):\n  ' + consoleErrors.join('\n  '));

  // useThemeClass resolves the theme via a matchMedia 'change' listener and
  // applies it to <html data-theme> inside a React effect, which lands one
  // tick after emulateMediaFeatures resolves. Wait for the attribute itself
  // rather than assuming the emulate call already took effect, or the audit
  // below measures the *previous* theme's colors.
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'light', {
    timeout: 5_000,
  });
  const lightViolations = await selfAudit(page, 'light');
  ok('panel self-audit (light): zero violations', lightViolations.length === 0);

  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark', {
    timeout: 5_000,
  });
  const darkViolations = await selfAudit(page, 'dark');
  ok('panel self-audit (dark): zero violations', darkViolations.length === 0);
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
