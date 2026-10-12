// Inspect the installer actually shipped, not just the pre-compression app.
import { mkdir,mkdtemp,readdir,readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve,join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { verifyInstaller } from './verify-installer.mjs';

const [installer,unpacked]=process.argv.slice(2);
if(!installer||!unpacked)throw new Error('Usage: node scripts/qa-installer.mjs <installer.exe> <win-unpacked>');
const integrity=await verifyInstaller(installer);
const require=createRequire(import.meta.url),sevenZip=require.resolve('electron-winstaller/vendor/7z.exe');
const output=resolve('test-results/installer');await mkdir(output,{recursive:true});
const evidence=await mkdtemp(join(output,'verified-'));
const run=async args=>{
  const {stdout}=await promisify(execFile)(sevenZip,args,{windowsHide:true,maxBuffer:4*1024*1024});
  if(!stdout.includes('Everything is Ok'))throw new Error('Installer extraction did not confirm success.');
};
await run(['x',resolve(installer),'-o'+evidence,'-y']);
await verifyInstaller(join(evidence,'$R0','Uninstall netKonnect.exe'));
const payload=join(evidence,'$PLUGINSDIR','app-64.7z');
await run(['t',payload]);
const extracted=join(evidence,'app');await run(['x',payload,'-o'+extracted,'-y']);
async function manifest(root,relative=''){
  const result={};
  for(const entry of await readdir(join(root,relative),{withFileTypes:true})){
    const path=join(relative,entry.name);
    if(entry.isDirectory())Object.assign(result,await manifest(root,path));
    else result[path]=createHash('sha256').update(await readFile(join(root,path))).digest('hex');
  }
  return result;
}
const actual=await manifest(extracted),expected=await manifest(resolve(unpacked));
const paths=new Set([...Object.keys(actual),...Object.keys(expected)]);
for(const path of paths)if(actual[path]!==expected[path])throw new Error('Installer payload differs from tested app: '+path);
console.log('INSTALLER_PAYLOAD_VERIFIED '+JSON.stringify({...integrity,files:paths.size,evidence}));
