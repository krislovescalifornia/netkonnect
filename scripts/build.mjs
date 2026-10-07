import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { verifyPackage } from './verify-package.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const { version } = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
// electron-builder clears its output. Never reuse a directory a customer may be running.
const output = join(root, 'dist', `${version}-${new Date().toISOString().replace(/[:.]/g,'-')}-${process.pid}`);
async function run(script, args = [], executable = process.execPath) {
  await new Promise((resolve, reject) => {
    const child = spawn(executable, [script, ...args], { cwd:root, stdio:'inherit', windowsHide:true });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`Build check failed (${code}): ${script}`)));
  });
}
await run('scripts/version.mjs');
await run('scripts/package-browsers.mjs');
await run('scripts/check.mjs');
await run('--test');
await run('-NoProfile', ['-NonInteractive','-ExecutionPolicy','Bypass','-File','test/traffic-trace.ps1'], 'powershell.exe');
await run('scripts/icon.mjs');
await run('node_modules/electron-builder/out/cli/cli.js', ['--win', ...(process.argv.includes('--dir') ? ['--dir'] : ['nsis']), `--config.directories.output=${output}`, `--config.electronDist=${join(root,'node_modules','electron','dist')}`]);
await verifyPackage(join(output, 'win-unpacked'));
await run('scripts/qa-release.mjs', [join(output, 'win-unpacked')]);
await mkdir(join(root, 'dist'), { recursive:true });
await writeFile(join(root, 'dist', 'latest-build.json'), JSON.stringify({ version, output, unpacked:join(output,'win-unpacked'), installer:process.argv.includes('--dir') ? null : join(output,`netKonnect-Setup-${version}.exe`) },null,2));
console.log(`Verified build: ${output}`);
