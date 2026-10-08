import { access, readFile } from 'node:fs/promises';
import { join, resolve, relative, isAbsolute } from 'node:path';
import {TRUCK_ASSETS} from '../public/truck-art.js';
import {WORLD_ASSETS} from '../public/world.js';
import {ILLUSTRATION_ASSETS} from '../public/artwork/manifest.js';

export const requiredAssets = [
  'package.json', 'collector.ps1', 'traffic.ps1', 'lib/TrafficTrace.cs',
  'lib/sqlite-history.mjs', 'lib/app-icons.mjs', 'lib/icon-wishlist.mjs', 'lib/WindowsIcons.cs', 'desktop/windows-icons.ps1', 'desktop/main.mjs', 'desktop/preload.cjs', 'desktop/companion-identity.mjs', 'desktop/startup.mjs', 'desktop/installed-qa.mjs',
  'desktop/manage-capture.ps1', 'desktop/trace-host.ps1', 'desktop/trace-session.ps1',
  'desktop/icon.png', 'desktop/tray.png', 'public/index.html', 'public/app.js', 'public/render.js',
  'public/companion-ui.js', 'public/icon-wishlist.js', 'public/setup-progress.js', 'public/setup.css', 'public/version.js', 'public/speed.js', 'public/cities.js', 'public/vehicles.js',
  'public/world.js', ...WORLD_ASSETS.map(name=>'public/'+name), 'public/routes.js', 'public/brands.js', 'public/address.js', 'public/providers.js', 'public/service-evidence.js','public/enrichment.js', 'public/truck-art.js', ...TRUCK_ASSETS.map(name=>'public/'+name), 'public/illustration-art.js', 'public/artwork/manifest.js', ...ILLUSTRATION_ASSETS.map(name=>'public/'+name), 'lib/dns.mjs',
  'lib/evidence.mjs','lib/enhanced-lookup.mjs','lib/NameTrace.cs','lib/BrowserHost.cs','desktop/browser-bridge.ps1','desktop/enhanced-lookup.ps1',
  'browser/identities.json','browser/chrome/manifest.json','browser/chrome/background.js','browser/chrome/popup.js','browser/chrome/popup.html','browser/edge/manifest.json','browser/edge/background.js','browser/edge/popup.js','browser/edge/popup.html','browser/netKonnect-chrome-Service-Insight.zip','browser/netKonnect-edge-Service-Insight.zip','browser/firefox/manifest.json','browser/firefox/background.js','browser/netKonnect-Service-Insight.xpi'
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
