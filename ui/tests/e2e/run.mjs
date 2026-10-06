// Runs every e2e file against a live console + LocalEmu.
//
//   npm run test:e2e                       # console on :4321, LocalEmu behind it
//   BASE=http://localhost:4400 npm run test:e2e
//   E2E_LAMBDA=1 npm run test:e2e          # also run the Lambda test (needs Docker for LocalEmu)
//
// The tests create and delete their own resources but assume a LocalEmu that
// isn't running other workloads. Use a throwaway instance.
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = path.dirname(fileURLToPath(import.meta.url));
const only = process.argv[2];
const files = readdirSync(dir)
  .filter((f) => f.endsWith('.mjs') && !['lib.mjs', 'run.mjs'].includes(f))
  .filter((f) => (f === 'lambda.mjs' ? process.env.E2E_LAMBDA === '1' : true))
  .filter((f) => !only || f.includes(only))
  .sort();

let failed = 0;
for (const f of files) {
  console.log(`\n=== ${f}`);
  const r = spawnSync(process.execPath, [path.join(dir, f)], { stdio: 'inherit', env: process.env });
  if (r.status !== 0) { failed++; console.log(`!!! ${f} failed`); }
}
console.log(`\n${files.length - failed}/${files.length} e2e files passed`);
process.exit(failed ? 1 : 0);
