import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
execFileSync(process.execPath,['scripts/version.mjs','--check'],{stdio:'inherit'});
async function check(directory) {
  for (const item of await readdir(directory,{withFileTypes:true})) {
    const path=join(directory,item.name);
    if(item.isDirectory())await check(path);
    else if(/\.(mjs|cjs|js)$/.test(path))execFileSync(process.execPath,['--check',path],{stdio:'inherit'});
  }
}
for(const directory of ['desktop','lib','public','scripts','test'])await check(directory);
for(const file of ['server.mjs','restart-service.mjs'])execFileSync(process.execPath,['--check',file],{stdio:'inherit'});
console.log('JavaScript syntax checks passed.');
if(process.platform==='win32')execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File','scripts/check-powershell.ps1'],{stdio:'inherit',windowsHide:true});
