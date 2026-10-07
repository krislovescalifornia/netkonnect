const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
import { setupSteps, progressView } from './setup-progress.js';
import { appVersion } from './version.js';
let settings = null, changing = false, setupError = '', checkedAt = 0, checking = null, setupProgress = null;
// This remembers presentation only. Every launch still verifies live readiness.
const establishedKey = 'netkonnect-setup-established';
let established = false;
try { established = localStorage.getItem(establishedKey) === 'true'; } catch { /* Session-only layout if storage is unavailable. */ }
function rememberSetup() {
  if (!settings?.complete) return;
  established = true;
  try { localStorage.setItem(establishedKey, 'true'); } catch { /* Keep the compact layout for this session. */ }
}
export const setupVersion = () => settings?.version || appVersion;
export function setupSlot(location) {
  return `<div data-setup-slot="${location}">${setupSlotContent(location)}</div>`;
}
function setupSlotContent(location) {
  return location === 'main' && !established ? setupPanel() : '';
}
export function preferencesAlert() {
  const attention = !changing && (!!setupError || (established && !!settings && !settings.complete));
  return attention ? '<span class="preferences-alert" role="status" aria-label="Collection setup needs attention. Open Preferences and run the Easy Button." title="Collection setup needs attention">!</span>' : '';
}

function progressPanel() {
  if (!setupProgress) return '';
  const view = progressView(setupProgress);
  return `<div class="setup-journey ${view.complete?'landed':view.failed?'halted':''}">
    <div class="journey-heading"><span class="journey-mascot" aria-hidden="true">${view.complete?'✦':view.failed?'⚑':'↗'}</span><div role="status" aria-live="polite"><strong>${esc(view.title)}</strong><p>${esc(view.detail)}</p></div><span class="journey-count">${view.complete?'6 of 6 done':`Step ${view.step} of 6`}</span></div>
    <div class="journey-track" role="progressbar" aria-label="Easy Button setup" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${view.percent}" aria-valuetext="${esc(view.complete?'Setup complete':`Step ${view.step} of 6: ${view.label}${view.failed?', needs attention':''}`)}"><div class="journey-fill" style="width:${view.percent}%"><span aria-hidden="true">✦</span></div></div>
    <ol class="journey-stops">${setupSteps.map((stage,index)=>`<li class="${view.complete||index<view.step-1?'done':index===view.step-1?'current':''}" ${!view.complete&&index===view.step-1?'aria-current="step"':''}><span aria-hidden="true">${view.complete||index<view.step-1?'✓':index+1}</span>${stage.label}</li>`).join('')}</ol>
    <div class="journey-foot"><span>${esc(view.waiting || (view.complete?'The tiny crew sends a high-five.':view.failed?'Ready when you are.':'Small steps. A clearer picture.'))}</span><span>${view.complete?'100% verified':`${view.elapsed}s elapsed`}</span></div>
  </div>`;
}

// Replace only the setup panels; live feedback also works in an open drawer or paused dashboard.
function repaintSetup() {
  if (typeof document === 'undefined') return;
  document.querySelectorAll('[data-setup-slot]').forEach(slot => {
    const markup = setupSlotContent(slot.dataset.setupSlot);
    if (slot.setupMarkup !== markup) {
      const focused = slot.contains(document.activeElement) ? document.activeElement : null;
      slot.innerHTML = markup; slot.setupMarkup = markup;
      if (focused?.matches('.easy-button')) slot.querySelector('.easy-button')?.focus({preventScroll:true});
      else if (focused?.matches('summary')) slot.querySelector('summary')?.focus({preventScroll:true});
    }
  });
  document.querySelectorAll('.drawer .easy-setup').forEach(panel => { panel.outerHTML = setupPanel(); });
  document.querySelectorAll('[data-preferences-alert]').forEach(label => { label.innerHTML = preferencesAlert(); });
  document.querySelectorAll('[data-app-version]').forEach(label => { label.textContent = `v${setupVersion()}`; });
}
export async function refreshSetupStatus(force = false) {
  if (!window.netKonnect || changing || (!force && Date.now() - checkedAt < 10000)) return;
  if (checking) return checking;
  checking = window.netKonnect.setupStatus().then(result => {
    settings = result; setupProgress = result.progress || setupProgress;
    if (!result.complete && setupProgress?.state === 'complete') setupProgress = null;
    if (setupProgress && setupProgress.state !== 'running') setupProgress = { ...setupProgress, checks:result.checks };
    setupError = setupProgress?.state === 'error' ? setupProgress.error || '' : ''; checkedAt = Date.now();
    rememberSetup();
  })
    .catch(error => { setupError = error.message; if (setupProgress?.state === 'complete') setupProgress = null; checkedAt = Date.now(); })
    .finally(() => { checking = null; repaintSetup(); });
  return checking;
}
export function setupPanel() {
  if (!window.netKonnect) return '';
  const complete = settings?.complete && !setupError;
  const installNeeded = settings && !settings.startupAvailable;
  const checks = setupProgress?.checks?.length ? setupProgress.checks : settings?.checks || [];
  const attention = !changing && (!!setupError || (established && !!settings && !complete));
  const checkList = `<ul class="setup-checks">${checks.map(check=>`<li data-setup-check="${esc(check.id)}" class="${check.ready?'ready':'pending'}"><span aria-hidden="true">${check.ready?'✓':'○'}</span>${esc(check.label)}<small>${check.ready?'Ready':'Pending'}</small></li>`).join('')}</ul>`;
  return `<section class="easy-setup ${complete?'complete':''} ${attention?'needs-attention':''}" aria-label="Network collection setup" aria-busy="${changing}">
    <div class="easy-setup-heading"><div><span class="tiny-label">ONE BUTTON. EVERYTHING READY.</span><h2>${complete?'Detailed collection is ready.':'Get the full picture.'}</h2><p>${complete?'Background collection and automatic sign-in are enabled.':'Set up the companion, privileged helper, automatic startup and local history together. Approve Windows Administrator access if asked.'}</p></div>
    <button class="easy-button" data-companion-action="setup" ${changing||!settings||installNeeded?'disabled':''}><span aria-hidden="true">${attention?'!':complete?'✓':'↗'}</span>${changing?'Tiny crew at work…':installNeeded?'Available after installation':attention?'Easy Button · Repair setup':complete?'Easy Button · Check setup':'Easy Button · Set up everything'}</button></div>
    ${progressPanel()}
    ${checkList}
    <p class="setup-status" role="status">${setupError?esc(setupError):changing?'The progress above follows the actual setup work. Collection checks can take up to 45 seconds after Windows approval.':!settings?'Checking collection setup…':installNeeded?'Run the netKonnect installer to enable the Easy Button, protected capture and automatic sign-in collection. This preview keeps its companion separate from the installed app.':attention?'A collection check needs attention. Run the Easy Button again.':complete?'Verified against live collection. No scripts or terminal commands needed.':'Setup is complete only when all checks pass. Already completed steps are kept if Windows approval is canceled.'}</p>
    ${!complete?'<p class="setup-limits">Collects app traffic, IPs, ports, protocols and available hostname clues. Encrypted content and browser tabs are not exposed by Windows network metadata.</p>':''}
  </section>`;
}
export async function companionPreferences() {
  if (!window.netKonnect) return '';
  await refreshSetupStatus(true);
  if (!settings) return setupPanel();
  return `${setupPanel()}<details class="collection-controls"><summary>Background collection controls</summary><div class="companion-note"><span class="companion-glyph">⌂</span><div><strong>Your quiet little companion.</strong><p>Close this window whenever you like. The tray companion keeps a local field journal until you quit it or sign out.</p></div></div>
    <div class="preference-row"><div><strong>Start companion when I sign in</strong><p>${settings.startupAvailable?'Collect while the observatory is closed. Turning this off also removes detailed startup capture, with Windows approval if needed.':'Available in the installed app. Development runs never change startup.'}</p></div><button class="switch ${settings.startup?'on':''}" data-companion-action="startup" role="switch" aria-label="Start companion at sign-in" aria-checked="${settings.startup}" ${!settings.startupAvailable||changing?'disabled':''}><span></span></button></div>
    <div class="preference-row"><div><strong>Detailed capture at sign-in</strong><p>Save measured bytes by app and destination all week. Also starts the companion at sign-in. Windows asks for Administrator permission to manage its capture task. ${!settings.detailedAvailable?'Install the app to enable this.':''}</p></div><button class="switch ${settings.detailedStartup?'on':''}" data-companion-action="capture" role="switch" aria-label="Detailed capture at sign-in" aria-checked="${settings.detailedStartup}" ${!settings.detailedAvailable||changing?'disabled':''}><span></span></button></div>
    </details><div class="local-journal"><span class="tiny-label">YOUR LOCAL FIELD JOURNAL</span><strong>SQLite · 400 days of history</strong><code>${esc(settings.database)}</code><p>Application bytes require detailed capture. Connection and adapter observations continue with ordinary permissions. Computer sleep, sign-out, or a stopped companion leave visible gaps.</p></div>`;
}
export function handleCompanionAction(event, refresh, toast) {
  const button = event.target.closest('[data-companion-action]');
  if (!button) return false;
  if (changing || (!settings && button.dataset.companionAction !== 'setup')) return true;
  const setup = button.dataset.companionAction === 'setup';
  if (setup && (!settings || !settings.startupAvailable)) return true;
  changing = true; button.disabled = true;
  setupError = '';
  if (setup) { settings = { ...settings, complete:false }; setupProgress = {step:1,total:6,state:'running',percent:0,startedAt:Date.now()}; }
  refresh();
  const unsubscribe = setup ? window.netKonnect.onSetupProgress(progress => { setupProgress = progress; repaintSetup(); }) : () => {};
  const ticker = setup ? setInterval(repaintSetup,1000) : null;
  const operation = setup ? window.netKonnect.setup() : button.dataset.companionAction === 'startup'
    ? window.netKonnect.setStartup(!settings.startup)
    : window.netKonnect.setCapture(!settings.detailedStartup);
  operation.then(result => { settings = result; rememberSetup(); toast(setup?'Everything is set up. Detailed background collection is ready.':'Companion preferences saved.'); })
    .catch(error => { setupError = error.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, ''); toast(setupError); })
    .finally(async () => { unsubscribe(); clearInterval(ticker); changing = false;
      const failure = setupError; await refreshSetupStatus(true); if (failure) setupError = failure;
      repaintSetup(); refresh(); });
  return true;
}
export function coverageRibbon(timeline, now = Date.now()) {
  if (!timeline) return '';
  const days = [];
  for (let offset=6;offset>=0;offset--) {
    const start=new Date(now);start.setHours(0,0,0,0);start.setDate(start.getDate()-offset);
    const end=new Date(start);end.setDate(end.getDate()+1);
    const minutes=timeline.filter(m=>m.at>=start.getTime()&&m.at<end.getTime());
    const observed=minutes.reduce((s,m)=>s+m.snapshotSeconds,0), measured=minutes.reduce((s,m)=>s+m.captureSeconds,0), lost=minutes.reduce((s,m)=>s+m.lostEvents,0), lostBuffers=minutes.reduce((s,m)=>s+(m.lostBuffers||0),0);
    const available=Math.max(1,(Math.min(now,end.getTime())-start.getTime())/1000);
    const label=start.toLocaleDateString([],{weekday:'short'}), date=start.toLocaleDateString([],{month:'short',day:'numeric'});
    const title=`${date}: ${(measured/3600).toFixed(1)} measured hours, ${(observed/3600).toFixed(1)} snapshot hours${lost?`, ${lost} lost or skipped events`:''}${lostBuffers?`, ${lostBuffers} lost buffers`:''}. Unobserved time is a gap.`;
    days.push(`<div class="journal-day ${measured?'measured':observed?'observed':'gap'}" title="${esc(title)}"><span>${label}</span><div class="journal-track"><i style="width:${Math.min(100,observed/available*100)}%"></i><b style="width:${Math.min(100,measured/available*100)}%"></b></div><strong>${measured?`${(measured/3600).toFixed(1)}h`:observed?'Snapshots':'No capture'}</strong><small>${date}${lost||lostBuffers?' · loss':''}</small></div>`);
  }
  return `<section class="panel field-journal"><div class="journal-heading"><div><span class="eyebrow">WHILE YOU WERE AWAY</span><h2>Your week, quietly collected.</h2><p>Measured app traffic in green · connection snapshots in blue · empty space means a collection gap.</p></div><span class="journal-stamp">LOCAL<br>ONLY ↗</span></div><div class="journal-days">${days.join('')}</div></section>`;
}
export function observationCard(summary) {
  if(!summary)return '';
  const bytes=n=>{const units=['B','KB','MB','GB','TB'];let i=0;while(n>=1024&&i<4){n/=1024;i++;}return `${n.toFixed(i?1:0)} ${units[i]}`;};
  return `<section class="panel background-footprints"><div class="journal-heading"><div><span class="eyebrow">THE COMPANION'S FIELD NOTES</span><h2>Footprints from the background.</h2><p>Recent week · adapter activity and observed outside connections · independent of the traffic filters below.</p></div></div><div class="footprint-metrics"><div><strong>${bytes(summary.received)}</strong><span>Adapter download observed</span></div><div><strong>${bytes(summary.sent)}</strong><span>Adapter upload observed</span></div><div><strong>${summary.apps}</strong><span>Apps seen outside</span></div><div><strong>${summary.destinations}</strong><span>Outside IPs spotted</span></div></div><div class="footprint-apps">${summary.recentApps.map(a=>`<span title="Last seen ${esc(new Date(a.lastSeen).toLocaleString())}">${esc(a.app)} <small>${a.destinations} IP${a.destinations===1?'':'s'}</small></span>`).join('')||'<p>No outside routes have been observed yet.</p>'}</div><p class="footprint-note">Adapter totals are estimates from sampled counters and may count virtual-adapter traffic twice. These bytes are never assigned to applications. Sightings include sampled sockets and captured ETW events; missing capture can still leave brief activity unseen.</p></section>`;
}
