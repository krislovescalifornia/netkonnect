import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requiredAssets, verifyBundle, isProtectedInstall } from '../desktop/bundle.mjs';
import { verifyPackage } from '../scripts/verify-package.mjs';
import { progressView } from '../public/setup-progress.js';

test('release gate rejects the screenshot failure even when an executable and UI are present',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'nk-bundle-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  const root=join(directory,'resources','app');
  for(const asset of requiredAssets){await mkdir(dirname(join(root,asset)),{recursive:true});await writeFile(join(root,asset),asset==='package.json'?' {"version":"test"} ':'fixture');}
  await writeFile(join(directory,'netKonnect.exe'),'fixture');
  await verifyPackage(directory);
  await rm(join(root,'collector.ps1'));
  await assert.rejects(verifyPackage(directory),/incomplete.*Reinstall.*collector\.ps1/);
});
test('source tree has the complete runtime bundle',async()=>{
  await verifyBundle(fileURLToPath(new URL('../',import.meta.url)));
});
test('unpacked previews cannot enable privileged persistent setup',()=>{
  assert.equal(isProtectedInstall(join(tmpdir(),'dist','netKonnect.exe'),[join(tmpdir(),'Programs')]),false);
  const programs=join(tmpdir(),'Programs');
  assert.equal(isProtectedInstall(join(programs,'netKonnect','netKonnect.exe'),[programs]),true);
  assert.equal(isProtectedInstall(join(tmpdir(),'Programs-lookalike','netKonnect.exe'),[programs]),false);
});
test('progress copy identifies approval and live waits; elapsed time cannot invent completion',()=>{
  const start=Date.now();
  const waiting=progressView({step:3,percent:33,state:'running',startedAt:start},start+15000);
  assert.match(waiting.detail,/Approve.*Administrator/);assert.match(waiting.waiting,/approval/);
  assert.equal(waiting.percent,33);assert.equal(waiting.elapsed,15);
  const live=progressView({step:5,percent:67,state:'running',startedAt:start},start+50000);
  assert.match(live.waiting,/live data/);assert.equal(live.percent,67);assert.equal(live.complete,false);
  const failed=progressView({step:6,percent:83,state:'error'});assert.equal(failed.percent,83);assert.match(failed.detail,/try.*again/);
});
test('a later failed live check removes the previous completed progress display',async t=>{
  const savedWindow=globalThis.window;t.after(()=>{globalThis.window=savedWindow;});
  let complete=true;
  globalThis.window={netKonnect:{setupStatus:async()=>({startupAvailable:true,complete,
    checks:[{id:'capture',label:'Live capture',ready:complete}],progress:{step:6,state:'complete',percent:100}})}};
  const ui=await import('../public/companion-ui.js?readiness-regression');
  await ui.refreshSetupStatus(true);assert.match(ui.setupPanel(),/100% verified/);
  complete=false;await ui.refreshSetupStatus(true);
  assert.doesNotMatch(ui.setupPanel(),/100% verified/);assert.match(ui.setupPanel(),/Pending/);
});

test('failed setup retains its actionable message during automatic status refreshes',async t=>{
  const savedWindow=globalThis.window;t.after(()=>{globalThis.window=savedWindow;});
  globalThis.window={netKonnect:{setupStatus:async()=>({startupAvailable:true,complete:false,checks:[],
    progress:{step:5,state:'error',percent:67,error:'Windows capture failed with error 87.'}})}};
  const ui=await import('../public/companion-ui.js?failure-message-regression');
  await ui.refreshSetupStatus(true);
  assert.match(ui.setupPanel(),/Windows capture failed with error 87/);
  await ui.refreshSetupStatus(true);
  assert.match(ui.setupPanel(),/Windows capture failed with error 87/);
});

test('completed setup keeps all seven checked rows visible, including sign-in startup',async t=>{
  const savedWindow=globalThis.window;t.after(()=>{globalThis.window=savedWindow;});
  const ids=['companion','startup','helper','firewall','snapshots','capture','history'];
  globalThis.window={netKonnect:{setupStatus:async()=>({startupAvailable:true,complete:true,
    checks:ids.map(id=>({id,label:id,ready:true})),progress:{step:6,state:'complete',percent:100}})}};
  const ui=await import('../public/companion-ui.js?visible-completed-checks');await ui.refreshSetupStatus(true);
  const panel=ui.setupPanel();assert.equal((panel.match(/data-setup-check=/g)||[]).length,7);
  assert.match(panel,/data-setup-check="startup" class="ready"/);assert.doesNotMatch(panel,/class="pending"/);
});
