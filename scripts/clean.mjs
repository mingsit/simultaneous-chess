/**
 * Remove generated directories.
 *
 *   node scripts/clean.mjs          # .next + out
 *   node scripts/clean.mjs cache    # .next only (keeps the deployable export)
 *
 * Nothing here is source: `npm run build` recreates both. The production
 * server only reads ./out, so .next can be deleted at any time.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const cacheOnly = process.argv[2] === 'cache';
const targets = cacheOnly ? ['.next'] : ['.next', 'out'];

for (const dir of targets) {
  const full = path.join(root, dir);
  if (!fs.existsSync(full)) {
    console.log(`skip  ${dir}/ (already absent)`);
    continue;
  }
  fs.rmSync(full, { recursive: true, force: true });
  console.log(`clean ${dir}/`);
}

if (!cacheOnly) console.log('run "npm run build" to regenerate out/');
