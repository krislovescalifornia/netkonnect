import { verifyBundle } from '../desktop/bundle.mjs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export async function verifyPackage(directory) {
  const metadata = await verifyBundle(join(directory, 'resources', 'app'));
  const { access } = await import('node:fs/promises');
  await access(join(directory, 'netKonnect.exe'));
  console.log(`PACKAGE_VERIFIED netKonnect ${metadata.version}: collectors, helper and UI assets present.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) throw new Error('Usage: node scripts/verify-package.mjs <win-unpacked directory>');
  await verifyPackage(resolve(process.argv[2]));
}
