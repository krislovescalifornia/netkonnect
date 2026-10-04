import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { spawn } from 'node:child_process';
import { isProtectedInstall } from '../desktop/bundle.mjs';
import { callCompanion } from '../desktop/pipe.mjs';
import { assertCompanionIdentity } from '../desktop/companion-identity.mjs';

const executable=resolve(process.argv[2] || join(process.env.ProgramFiles,'netKonnect','netKonnect.exe'));
if(!isProtectedInstall(executable,[process.env.ProgramFiles,process.env['ProgramFiles(x86)']])) throw new Error('Use the actual Program Files installation for installed acceptance.');
const testDirectory=resolve('test-results','installed-'+new Date().toISOString().replace(/[:.]/g,'-'));
await mkdir(testDirectory,{recursive:true});
const env={...process.env,NETKONNECT_QA_DIRECTORY:testDirectory};delete env.ELECTRON_RUN_AS_NODE;
async function verifyUI() { await new Promise((resolve,reject)=>{
  const child=spawn(executable,['--verify-installed-setup'],{env,stdio:'inherit',windowsHide:true});
  const timer=setTimeout(()=>{child.kill();reject(new Error('Installed acceptance timed out.'));},150000);
  child.once('error',error=>{clearTimeout(timer);reject(error);});
  child.once('exit',code=>{clearTimeout(timer);code===0?resolve():reject(new Error(`Installed acceptance failed (${code}). Close the installed dashboard before running this check; its companion may stay running.`));});
});
  const result=JSON.parse(await readFile(join(testDirectory,'installed-acceptance.json'),'utf8'));
  if(result.fixtures!==false || !result.complete || result.checks.length!==7 || result.checks.some(c=>!c.ready)) throw new Error('Installed acceptance evidence is incomplete.');
  return result;
}
let result=await verifyUI();
const directory=join(process.env.LOCALAPPDATA,'netKonnect','data'), bundle=join(dirname(executable),'resources','app');
const previous=await callCompanion(directory,'snapshot');assertCompanionIdentity(previous,bundle,result.version);
await callCompanion(directory,'checkpoint');
await callCompanion(directory,'quit');
let stopped=false;
for(let i=0;i<60;i++) {
  await new Promise(resolve=>setTimeout(resolve,250));
  // The endpoint closes before trace/history teardown finishes. Wait for the
  // actual process exit, which also releases Electron's companion profile lock.
  try { process.kill(previous.service.pid,0); } catch(error) {
    if(error.code!=='ESRCH')throw error;
    stopped=true;break;
  }
}
if(!stopped)throw new Error('Companion did not shut down for the sign-in command test.');
// Execute the exact enabled launch entry returned by Electron, with the
// dashboard closed. This exercises Windows Run's command, without signing out.
const startup=result.startupStatus;
if(!startup.ready || resolve(startup.path).toLowerCase()!==executable.toLowerCase()
  || startup.args.length!==1 || startup.args[0]!=='collector') throw new Error('Startup launch evidence does not match the installed companion.');
const companion=spawn(startup.path,startup.args,{env,detached:true,stdio:'ignore',windowsHide:true});
let launchError;companion.once('error',error=>{launchError=error;});companion.unref();
let relaunched;
for(let i=0;i<60;i++) {
  if(launchError)throw launchError;
  await new Promise(resolve=>setTimeout(resolve,500));
  try {
    const data=await callCompanion(directory,'snapshot');
    assertCompanionIdentity(data,bundle,result.version);
    if(data.service.pid!==previous.service.pid && data.snapshot?.traffic.available && !data.error && !data.service.storageError) {relaunched=data;break;}
  } catch { }
}
if(!relaunched)throw new Error('The enabled sign-in command did not restore the companion and measured capture with the dashboard closed.');
await callCompanion(directory,'checkpoint');
result=await verifyUI();
result={...result,signInCommandLaunchRecovered:true,dashboardClosedCollection:true,actualSignOutTested:false};
await writeFile(join(testDirectory,'installed-acceptance.json'),JSON.stringify(result,null,2));
console.log('INSTALLED_QA_RESULTS '+testDirectory);
