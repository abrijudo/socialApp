/**
 * Ejecutado con el servidor ya en marcha (p. ej. start-server-and-test).
 * Evita que Playwright intente un segundo webServer en el mismo puerto.
 */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

process.env.PLAYWRIGHT_SKIP_WEBSERVER = '1';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(root, 'package.json'));
const playwrightCli = require.resolve('@playwright/test/cli');

function run(nodeArgs) {
  const r = spawnSync(process.execPath, nodeArgs, { stdio: 'inherit', cwd: root });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

function runCommand(command, args, cwd = root) {
  const r = spawnSync(command, args, { stdio: 'inherit', cwd, shell: process.platform === 'win32' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

run([join(root, 'scripts', 'test-api.js')]);
runCommand(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['test'], join(root, 'frontend-v2'));

const pw = spawnSync(process.execPath, [playwrightCli, 'test'], {
  stdio: 'inherit',
  cwd: root,
});
if (pw.status !== 0) process.exit(pw.status ?? 1);
