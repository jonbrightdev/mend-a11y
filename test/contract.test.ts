// Guards the extension's half of the shared ingest contract in
// test/contract/ (verbatim copy of mend-website's contract/ — see
// test/contract/README.md). buildIngestPayload must still produce
// fixtures/valid/canonical.json byte-for-byte for the synthetic audit below;
// that's the drift tripwire, since the fixture was generated from this exact
// code path. The website's half lives in
// src/lib/ingest-payload.contract.test.ts, which asserts its parser accepts
// or rejects every fixture in this same directory.
// Run with: tsx test/contract.test.ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildIngestPayload } from '../src/lib/sync';
import type { AuditResult, NormalizedIssue } from '../src/lib/types';

const checks: [string, boolean][] = [];
const ok = (name: string, cond: boolean) => checks.push([name, cond]);

const contractDir = fileURLToPath(new URL('./contract', import.meta.url));

function readFixture(relPath: string): unknown {
  return JSON.parse(readFileSync(`${contractDir}/${relPath}`, 'utf8'));
}

// The exact synthetic audit that produced fixtures/valid/canonical.json
// (see mend-website's scratchpad generator referenced in plan 027).
const issue = (over: Partial<NormalizedIssue> = {}): NormalizedIssue => ({
  id: 'abc123',
  ruleId: 'image-alt',
  impact: 'critical',
  category: 'images',
  wcag: ['1.1.1'],
  title: 'Images must have alternate text',
  description: 'Add an alt attribute.',
  documented: true,
  helpUrl: 'https://example.com/help',
  selector: 'img.hero',
  html: '<img class="hero">',
  failureSummary: 'Element has no alt',
  domOrder: 3,
  ...over,
});

const result: AuditResult = {
  url: 'https://site.test/page',
  startedAt: 1_752_000_000_000,
  durationMs: 812,
  issues: [
    issue(),
    issue({ id: 'def456', ruleId: 'label', category: 'forms', selector: 'input#q', domOrder: 1 }),
  ],
  totalChecks: 950,
  partial: false,
};

function main(): void {
  const readme = readFileSync(`${contractDir}/README.md`, 'utf8');
  ok('CONTRACT_VERSION: 1 is recorded in the copied README', /CONTRACT_VERSION: 1/.test(readme));

  const payload = buildIngestPayload(result, 'Site title');
  const canonical = readFixture('fixtures/valid/canonical.json');
  ok('buildIngestPayload reproduces fixtures/valid/canonical.json byte-for-byte',
    JSON.stringify(payload) === JSON.stringify(canonical));

  let pass = 0;
  for (const [name, cond] of checks) {
    console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`);
    if (cond) pass++;
  }
  console.log(`\n${pass}/${checks.length} checks passed`);
  process.exit(pass === checks.length ? 0 : 1);
}

main();
