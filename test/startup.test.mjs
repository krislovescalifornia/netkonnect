import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { companionLoginOptions, readCompanionStartup, setCompanionStartup } from '../desktop/startup.mjs';

const executable='C:\\Program Files\\netKonnect\\netKonnect.exe';
const item={name:'netKonnect Companion',scope:'user',path:executable,args:['collector'],enabled:true};

test('named companion startup is verified even when Electron openAtLogin reads the app ID instead',()=>{
  const app={getLoginItemSettings:options=>{
    assert.equal(options.path,`"${executable}"`);
    assert.deepEqual(options.args,['collector']);
    return {openAtLogin:false,executableWillLaunchAtLogin:true,launchItems:[item]};
  }};
  assert.equal(readCompanionStartup(app,executable).ready,true);
  assert.equal(companionLoginOptions(executable).path,executable);
});

test('startup requires the exact enabled user companion entry, path and arguments',()=>{
  for(const broken of [{...item,enabled:false},{...item,args:[]},{...item,args:['collector','--smoke-test']},
    {...item,scope:'machine'},{...item,name:'Other app'},{...item,path:'C:\\Other\\netKonnect.exe'}]) {
    const app={getLoginItemSettings:()=>({openAtLogin:true,executableWillLaunchAtLogin:true,launchItems:[broken]})};
    assert.equal(readCompanionStartup(app,executable).ready,false);
  }
  assert.equal(readCompanionStartup({getLoginItemSettings:()=>({openAtLogin:true,launchItems:[]})},executable).ready,false);
});

test('real Electron verifies named Program Files startup, disabled approval and removal', {skip:process.platform!=='win32',timeout:30000},()=>{
  const require=createRequire(import.meta.url),env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  const result=execFileSync(require('electron'),['scripts/qa-startup-native.mjs'],{cwd:process.cwd(),env,encoding:'utf8',timeout:20000,windowsHide:true});
  assert.match(result,/NATIVE_STARTUP_VERIFIED/);
});

test('startup enablement verifies the actual launch item immediately and surfaces failed writes',()=>{
  let enabled=false;
  const app={setLoginItemSettings:options=>{assert.equal(options.enabled,true);enabled=options.openAtLogin;},
    getLoginItemSettings:()=>({launchItems:enabled?[item]:[]})};
  assert.equal(setCompanionStartup(app,executable,true).ready,true);
  assert.throws(()=>setCompanionStartup({setLoginItemSettings:()=>{},getLoginItemSettings:()=>({launchItems:[]})},executable,true),/could not be enabled/);
});
