import { app } from 'electron';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readCompanionStartup, setCompanionStartup, companionStartupName, companionLoginOptions } from '../desktop/startup.mjs';

const name='netKonnect startup test '+randomUUID();
const executable=join(process.env.ProgramFiles,'netKonnect startup fixture','netKonnect.exe');
// Only remap the disposable registry name. All path/argument/approval evidence
// and writes come from Electron's actual Windows implementation.
const adapter={
  setLoginItemSettings:options=>app.setLoginItemSettings({...options,name}),
  getLoginItemSettings:options=>{
    const result=app.getLoginItemSettings(options);
    return {...result,launchItems:result.launchItems.map(item=>item.name===name?{...item,name:companionStartupName}:item)};
  }
};
app.whenReady().then(()=>{
  try {
    const initial=readCompanionStartup(adapter,executable);assert.equal(initial.ready,false);
    assert.equal(setCompanionStartup(adapter,executable,true).ready,true);
    adapter.setLoginItemSettings({...companionLoginOptions(executable),openAtLogin:true,enabled:false});
    assert.equal(readCompanionStartup(adapter,executable).ready,false);
    assert.equal(setCompanionStartup(adapter,executable,true).ready,true);
    setCompanionStartup(adapter,executable,false);
    assert.equal(readCompanionStartup(adapter,executable).registered,false);
    console.log('NATIVE_STARTUP_VERIFIED named entry, spaces, exact args, approval, removal');
  } finally { app.setLoginItemSettings({name,openAtLogin:false}); }
  app.quit();
}).catch(error=>{console.error(error);app.exit(1);});
