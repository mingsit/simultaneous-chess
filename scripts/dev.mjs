/**
 * Dev launcher: `next dev` on :3000 plus the websocket relay on :3001.
 * (In production a single process serves both — see `npm start`.)
 */
import { spawn } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const children = [];

function run(label, args, env) {
  const child = spawn(process.execPath, args, {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: 'inherit',
  });
  child.on('exit', (code) => {
    console.log(`[${label}] exited with ${code}`);
    shutdown();
  });
  children.push(child);
  return child;
}

let closing = false;
function shutdown() {
  if (closing) return;
  closing = true;
  for (const c of children) {
    try {
      c.kill();
    } catch {
      /* ignore */
    }
  }
}

process.on('SIGINT', () => {
  shutdown();
  process.exit(0);
});
process.on('SIGTERM', () => {
  shutdown();
  process.exit(0);
});

run('web', [path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next'), 'dev', '-p', '3000']);
run('relay', [path.join(root, 'server', 'index.mjs')], { PORT: '3001' });

console.log('\n  Simultaneous Chess');
console.log('  → http://localhost:3000\n');
