import test from 'node:test';
import assert from 'node:assert/strict';

const ids = ['companion','startup','helper','firewall','snapshots','capture','history'];
const ready = () => ({startupAvailable:true,version:'1.1.3',complete:true,
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

test('first-run setup moves to the sidebar only after live verification succeeds',async t=>{
  const {ui,storage,setStatus} = await renderer(t);
  await ui.refreshSetupStatus(true);
  assert.match(ui.setupSlot('main'),/Set up everything/);
  assert.doesNotMatch(ui.setupSlot('sidebar'),/easy-button/);
  assert.equal(storage.get('netkonnect-setup-established'),undefined);
  setStatus(ready());await ui.refreshSetupStatus(true);
  assert.doesNotMatch(ui.setupSlot('main'),/easy-setup/);
  const sidebar = ui.setupSlot('sidebar');
  assert.match(sidebar,/Easy Button · Ready/);
  assert.match(sidebar,/7 of 7 checks ready/);
  assert.equal((sidebar.match(/data-setup-check=/g)||[]).length,7);
  assert.doesNotMatch(sidebar,/<details[^>]*\sopen[\s>]/);
  assert.equal(storage.get('netkonnect-setup-established'),'true');
  assert.equal(ui.setupVersion(),'1.1.3');
});

test('a saved layout starts compact but cannot claim readiness before startup checks',async t=>{
  const {ui,setStatus} = await renderer(t,{'netkonnect-setup-established':'true'});
  assert.doesNotMatch(ui.setupSlot('main'),/easy-setup/);
  assert.match(ui.setupSlot('sidebar'),/Easy Button · Checking…/);
  assert.doesNotMatch(ui.setupSlot('sidebar'),/All collection checks passed/);
  setStatus(ready());await ui.refreshSetupStatus(true);
  assert.match(ui.setupSlot('sidebar'),/Easy Button · Ready/);
});

test('a failed check stays in the sidebar, prompts repair, and clears stale completion',async t=>{
  const {ui,setStatus} = await renderer(t,{'netkonnect-setup-established':'true'});
  setStatus({...ready(),progress:{step:6,state:'complete',percent:100}});
  await ui.refreshSetupStatus(true);
  setStatus({...ready(),complete:false,checks:ready().checks.map(c=>({...c,ready:c.id!=='capture'})),
    progress:{step:6,state:'complete',percent:100}});
  await ui.refreshSetupStatus(true);
  const sidebar = ui.setupSlot('sidebar');
  assert.doesNotMatch(ui.setupSlot('main'),/easy-setup/);
  assert.match(sidebar,/needs-attention/);
  assert.match(sidebar,/Easy Button · Repair setup/);
  assert.match(sidebar,/Run the Easy Button again/);
  assert.match(sidebar,/data-setup-check="capture" class="pending"/);
  assert.match(sidebar,/<details[^>]*\sopen[\s>]/);
  assert.doesNotMatch(sidebar,/100% verified|All collection checks passed/);
  setStatus(ready());await ui.refreshSetupStatus(true);
  assert.doesNotMatch(ui.setupSlot('sidebar'),/needs-attention/);
});

test('a status error cannot leave a previously healthy Easy Button green',async t=>{
  const {ui,setStatus,setFailure} = await renderer(t,{'netkonnect-setup-established':'true'});
  setStatus({...ready(),progress:{step:6,state:'complete',percent:100}});await ui.refreshSetupStatus(true);
  setFailure(new Error('Companion unavailable'));await ui.refreshSetupStatus(true);
  assert.match(ui.setupSlot('sidebar'),/needs-attention/);
  assert.match(ui.setupSlot('sidebar'),/Companion unavailable/);
  assert.doesNotMatch(ui.setupSlot('sidebar'),/All collection checks passed|100% verified/);
});

test('unavailable preference storage still retains compact setup within the session',async t=>{
  const {ui,setStatus} = await renderer(t);
  globalThis.localStorage.setItem = () => {throw new Error('Storage unavailable');};
  setStatus(ready());await ui.refreshSetupStatus(true);
  assert.doesNotMatch(ui.setupSlot('main'),/easy-setup/);
  assert.match(ui.setupSlot('sidebar'),/Easy Button · Ready/);
});
