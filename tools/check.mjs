// Runs the test suites.
//
//   node tools/check.mjs          # everything: tests, level checks, solutions, audit
//   node tools/check.mjs test     # just the engine and client tests
//
// Each suite runs in its own process, as it would by hand, and the run stops
// at the first that fails. SUPREMIX_PACK picks the level pack the level tools
// check (see tools/pack.mjs).

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const TESTS = ['tools/test-engine.mjs', 'tools/test-client.mjs'];
const LEVELS = ['tools/validate-levels.mjs', 'tools/test-upgrades.mjs', 'tools/verify-solutions.mjs', 'tools/design-audit.mjs'];
// The optional local server's own tests, when that server is in this copy.
const SERVER = existsSync('server.js') && existsSync('tools/test-server.mjs') ? ['tools/test-server.mjs'] : [];

const suites = process.argv[2] === 'test' ? TESTS : [...TESTS, ...SERVER, ...LEVELS];
for (const suite of suites) {
  console.log(`\n--- ${suite}`);
  const run = spawnSync(process.execPath, [suite], { stdio: 'inherit' });
  if (run.status !== 0) {
    console.error(`\n${suite} failed`);
    process.exit(run.status || 1);
  }
}
console.log(`\nall ${suites.length} suites passed`);
