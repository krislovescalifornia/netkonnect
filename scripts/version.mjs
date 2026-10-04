import { readFile, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const metadata = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
const lock = JSON.parse(await readFile(new URL('package-lock.json', root), 'utf8'));
if (lock.version !== metadata.version || lock.packages[''].version !== metadata.version) {
  throw new Error('Package and lockfile versions differ. Use npm version <version> --no-git-tag-version to update the release.');
}
if (!Number.isInteger(metadata.releaseYear) || metadata.releaseYear < 2020) throw new Error('Set releaseYear to the year this release was made.');
const output = new URL('public/version.js', root);
const source = `// Generated from package.json by scripts/version.mjs.\nexport const appVersion = ${JSON.stringify(metadata.version)};\nexport const releaseYear = ${metadata.releaseYear};\n`;
if (process.argv.includes('--check')) {
  if ((await readFile(output, 'utf8')).replace(/\r\n/g, '\n') !== source) throw new Error('Dashboard version is out of date. Run node scripts/version.mjs.');
} else {
  await writeFile(output, source);
  console.log(`Dashboard version synchronized: ${metadata.version}`);
}
