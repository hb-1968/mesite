// one-time dep install -- run with `node install.mjs`. wraps npm so
// the user never has to type `npm` themselves. uses `npm ci` if the
// lockfile is present (faster, deterministic), else falls back to
// `npm install`. exits with whatever npm exits with.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const cmd = existsSync('./package-lock.json') ? 'ci' : 'install';
console.log(`[install] npm ${cmd}`);

const child = spawn('npm', [cmd], { stdio: 'inherit', shell: true });
child.on('exit', (code) => process.exit(code ?? 0));
