import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { verifyPackage } from './verify-package.mjs';

const build = process.argv[2] ? { unpacked:process.argv[2] } : JSON.parse(await readFile('dist/latest-build.json','utf8'));
await verifyPackage(build.unpacked);
const testDirectory=resolve('test-results', 'release-'+new Date().toISOString().replace(/[:.]/g,'-'));
await mkdir(testDirectory,{recursive:true});
await new Promise((resolve, reject) => {
  const env = { ...process.env, NETKONNECT_QA_DIRECTORY:testDirectory }; delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(join(build.unpacked, 'netKonnect.exe'), ['--smoke-test','--setup-smoke-test'], { env, stdio:'inherit', windowsHide:true });
  const timer = setTimeout(() => { child.kill(); reject(new Error('Packaged desktop QA timed out.')); }, 120000);
  child.once('error', error => { clearTimeout(timer); reject(error); });
  child.once('exit', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`Packaged desktop QA failed (${code}).`)); });
});
await writeFile(join(testDirectory,'qa-result.json'),JSON.stringify({unpacked:resolve(build.unpacked),passed:true,
  verified:['real Windows snapshots','local SQLite','six setup stages','cancellation and retry','healthy recheck','preferences','analytics journal','offline renderer'],
  windowsSetup:'OS mutations simulated; installed UAC and reboot acceptance still required'},null,2));
console.log('QA_RESULTS '+testDirectory);
