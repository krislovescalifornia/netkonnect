import test from 'node:test';
import assert from 'node:assert/strict';
import { appVersion } from '../public/version.js';

const ids = ['companion','startup','helper','firewall','snapshots','capture','history'];
const ready = () => ({startupAvailable:true,version:appVersion,complete:true,
  checks:ids.map(id=>({id,label:id,ready:true}))});
async function renderer(t, initial = {}) {
  const saved = {window:globalThis.window,localStorage:globalThis.localStorage};
  t.after(()=>Object.assign(globalThis,saved));
  const storage = new Map(Object.entries(initial));
  globalThis.localStorage = {getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)};
  let status = { ...ready(), complete:false, checks:ids.map(id=>({id,label:id,ready:false})) }, failure = null;
  globalThis.window = {netKonnect:{setupStatus:async()=> { if(failure)throw failure; return status; }}};
  const ui = await import(`../public/companion-ui.js?sidebar-${t.name}`);
  return {ui,storage,setStatus:value=> {status=value;},setFailure:value=> {failure=value;}};
}

test('first-run setup disappears after verification and stays available in Preferences',async t=>{
  const {ui,storage,setStatus} = await renderer(t);
  await ui.refreshSetupStatus(true);
  assert.match(ui.setupSlot('main'),/Set up everything/);
  assert.doesNotMatch(ui.setupSlot('sidebar'),/easy-button/);
  assert.equal(ui.preferencesAlert(),'');
  setStatus(ready());await ui.refreshSetupStatus(true);
  assert.doesNotMatch(ui.setupSlot('main'),/easy-setup/);
  assert.doesNotMatch(ui.setupSlot('sidebar'),/easy-button/);
  const preferences = await ui.companionPreferences();
  assert.match(preferences,/Easy Button · Check setup/);
  assert.equal((preferences.match(/data-setup-check=/g)||[]).length,7);
  assert.equal(ui.preferencesAlert(),'');
  assert.equal(storage.get('netkonnect-setup-established'),'true');
  assert.equal(ui.setupVersion(),appVersion);
});

test('a saved setup stays out of navigation while live checks run',async t=>{
  const {ui,setStatus} = await renderer(t,{'netkonnect-setup-established':'true'});
  assert.doesNotMatch(ui.setupSlot('main'),/easy-setup/);
  assert.doesNotMatch(ui.setupSlot('sidebar'),/easy-button/);
  assert.doesNotMatch(ui.setupPanel(),/Verified against live collection/);
  assert.equal(ui.preferencesAlert(),'');
  setStatus(ready());await ui.refreshSetupStatus(true);
  assert.equal(ui.preferencesAlert(),'');
  assert.match(ui.setupPanel(),/Easy Button · Check setup/);
});

test('a lost check flags Preferences, prompts repair there, and clears stale completion',async t=>{
  const {ui,setStatus} = await renderer(t,{'netkonnect-setup-established':'true'});
  setStatus({...ready(),progress:{step:6,state:'complete',percent:100}});
  await ui.refreshSetupStatus(true);
  setStatus({...ready(),complete:false,checks:ready().checks.map(c=>({...c,ready:c.id!=='capture'})),
    progress:{step:6,state:'complete',percent:100}});
  await ui.refreshSetupStatus(true);
  assert.doesNotMatch(ui.setupSlot('main'),/easy-setup/);
  assert.doesNotMatch(ui.setupSlot('sidebar'),/easy-button/);
  assert.match(ui.preferencesAlert(),/preferences-alert/);
  assert.match(ui.preferencesAlert(),/Open Preferences and run the Easy Button/);
  const preferences=await ui.companionPreferences();
  assert.match(preferences,/Easy Button · Repair setup/);
  assert.match(preferences,/Run the Easy Button again/);
  assert.match(preferences,/data-setup-check="capture" class="pending"/);
  assert.doesNotMatch(preferences,/100% verified|Verified against live collection/);
  setStatus(ready());await ui.refreshSetupStatus(true);
  assert.equal(ui.preferencesAlert(),'');
  assert.doesNotMatch(ui.setupPanel(),/needs-attention/);
});

test('an unavailable companion flags Preferences even after healthy completion',async t=>{
  const {ui,setStatus,setFailure} = await renderer(t,{'netkonnect-setup-established':'true'});
  setStatus({...ready(),progress:{step:6,state:'complete',percent:100}});await ui.refreshSetupStatus(true);
  setFailure(new Error('Companion unavailable'));await ui.refreshSetupStatus(true);
  assert.match(ui.preferencesAlert(),/preferences-alert/);
  assert.match(ui.setupPanel(),/Companion unavailable/);
  assert.doesNotMatch(ui.setupPanel(),/Verified against live collection|100% verified/);
  setFailure(null);await ui.refreshSetupStatus(true);
  assert.equal(ui.preferencesAlert(),'');
});

test('unavailable storage still keeps completed setup in Preferences for the session',async t=>{
  const {ui,setStatus} = await renderer(t);
  globalThis.localStorage.setItem = () => {throw new Error('Storage unavailable');};
  setStatus(ready());await ui.refreshSetupStatus(true);
  assert.doesNotMatch(ui.setupSlot('main'),/easy-setup/);
  assert.doesNotMatch(ui.setupSlot('sidebar'),/easy-button/);
  assert.match(await ui.companionPreferences(),/Easy Button · Check setup/);
});
