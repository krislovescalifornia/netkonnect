import { access, readFile } from 'node:fs/promises';
import { join, resolve, relative, isAbsolute } from 'node:path';

export const requiredAssets = [
  'package.json', 'collector.ps1', 'traffic.ps1', 'lib/TrafficTrace.cs',
  'lib/sqlite-history.mjs', 'desktop/main.mjs', 'desktop/preload.cjs', 'desktop/companion-identity.mjs', 'desktop/startup.mjs', 'desktop/installed-qa.mjs',
  'desktop/manage-capture.ps1', 'desktop/trace-host.ps1', 'desktop/trace-session.ps1',
  'desktop/icon.png', 'desktop/tray.png', 'public/index.html', 'public/app.js',
  'public/companion-ui.js', 'public/setup-progress.js', 'public/setup.css', 'public/version.js'
];

export async function verifyBundle(root) {
  const missing = [];
  for (const asset of requiredAssets) {
    try { await access(join(root, asset)); } catch { missing.push(asset); }
  }
  if (missing.length) throw new Error(`This copy of netKonnect is incomplete. Reinstall the latest release to restore collection. Missing files: ${missing.join(', ')}.`);
  return JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
}

export function isProtectedInstall(executable, programDirectories) {
  return programDirectories.filter(Boolean).some(directory => {
    const path = relative(resolve(directory), resolve(executable));
    return path && path !== '..' && !path.startsWith('..\\') && !path.startsWith('../') && !isAbsolute(path);
  });
}
