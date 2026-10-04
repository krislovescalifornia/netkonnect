// Only selected by the explicit desktop QA flags. OS setup mutations are fixtures;
// snapshots, IPC, UI, packaged resources and the SQLite checkpoint stay real.
export function setupSmokeFixture({ readSnapshot, checkpoint }) {
  let configured = false, startup = false, cancelOnce = true, reads = 0;
  const pause = ms => new Promise(resolve => setTimeout(resolve,ms));
  return {
    readSettings:async()=>({ startup, detailedStartup:configured, firewall:configured,
      startupAvailable:true, detailedAvailable:true, offline:true, database:'QA local history' }),
    configure:async()=> { await pause(800); if (cancelOnce) { cancelOnce=false; throw new Error('Windows approval canceled. Click Easy Button to retry.'); } configured=true; },
    startHelper:async()=>pause(200),
    enableStartup:async()=> { await pause(400); startup=true; },
    readSnapshot:async()=> { const data=await readSnapshot(); return { ...data, snapshot:data.snapshot
      ? {...data.snapshot, traffic:{...data.snapshot.traffic,available:configured && ++reads >= 4}} : null }; },
    checkpoint:async()=> { await pause(400); await checkpoint(); }
  };
}

export async function checkSetupUI(window, saveScreenshot) {
  const evaluate = code => window.webContents.executeJavaScript(code);
  const until = async (code, message) => {
    const deadline=Date.now()+20000;
    while (Date.now()<deadline) { if (await evaluate(code)) return; await new Promise(resolve=>setTimeout(resolve,100)); }
    await saveScreenshot('easy-button-failure.png');
    throw new Error(message + ': ' + await evaluate(`document.querySelector('.easy-setup')?.innerText`));
  };
  await until(`!!document.querySelector('.easy-button:not(:disabled)')`, 'Easy Button did not become ready');
  await evaluate(`document.querySelector('.easy-button').click()`);
  await until(`document.querySelector('.setup-journey.halted') && !document.querySelector('.easy-button').disabled`, 'Canceled approval did not allow retry');
  await saveScreenshot('easy-button-retry.png');
  await evaluate(`document.querySelector('[data-action="pause"]').click(); document.querySelector('[data-action="settings"]').click()`);
  await until(`!!document.querySelector('.drawer .easy-button:not(:disabled)')`, 'Easy Button did not render in Preferences');
  await evaluate(`window.qaSteps=[]; window.qaUnsubscribe=window.netKonnect.onSetupProgress(p=>window.qaSteps.push(p)); document.querySelector('.drawer .easy-button').click()`);
  await until(`document.querySelector('[aria-current="step"]')?.textContent.includes('Helper')`, 'Helper progress was missing');
  await until(`document.querySelector('.drawer [aria-current="step"]')?.textContent.includes('Helper')`, 'Paused drawer did not receive live progress');
  await saveScreenshot('easy-button-drawer-progress.png');
  await evaluate(`document.querySelector('[data-action="close"]').click()`);
  await saveScreenshot('easy-button-progress.png');
  await until(`!document.querySelector('#main .easy-setup')`, 'Completed setup remained on the dashboard');
  await evaluate(`document.querySelector('[data-action="settings"]').click()`);
  await until(`document.querySelector('.drawer .setup-journey.landed') && !document.querySelector('.drawer .easy-button').disabled && !document.querySelector('.sidebar .easy-button')`, 'Completed setup did not move into Preferences');
  const result=await evaluate(`({steps:[...new Set(window.qaSteps.map(p=>p.step))],percent:document.querySelector('[role="progressbar"]').getAttribute('aria-valuenow'),errors:document.querySelector('.error-notice')?.textContent,complete:document.querySelector('.easy-setup').classList.contains('complete')})`);
  if (result.steps.join(',')!=='1,2,3,4,5,6' || result.percent!=='100' || !result.complete || result.errors) throw new Error('Setup UI QA failed: '+JSON.stringify(result));
  await saveScreenshot('easy-button-complete.png');
  await evaluate(`window.qaUnsubscribe(); document.querySelector('[data-action="pause"]').click(); document.querySelector('.easy-button').click()`);
  await until(`document.querySelector('.setup-journey.landed') && !document.querySelector('.easy-button').disabled`, 'Healthy setup recheck failed');
  await evaluate(`document.querySelector('[data-action="close"]').click()`);
  await saveScreenshot('dashboard-sidebar-ready.png');
  await evaluate(`location.reload()`);
  await until(`!document.querySelector('#main .easy-setup') && !document.querySelector('.sidebar .easy-button') && !document.querySelector('.preferences-alert')`, 'Relaunch restored the setup panel or showed a false alert');
  for (const page of ['activity','connections','secrets','adapters','overview']) {
    await evaluate(`document.querySelector('[data-page="${page}"]').click()`);
    const layout=await evaluate(`({sidebar:!!document.querySelector('.sidebar .easy-button'),main:!!document.querySelector('#main .easy-setup'),search:!!document.querySelector('.sidebar #global-search'),controls:document.querySelectorAll('.sidebar [data-action="pause"],.sidebar [data-action="restart-service"]').length,removed:!!document.querySelector('.breadcrumb,.topbar,[data-action="mode"],.sidebar-postcard')})`);
    if (layout.sidebar || layout.main || !layout.search || layout.controls!==2 || layout.removed) throw new Error('Sidebar layout QA failed on '+page+': '+JSON.stringify(layout));
  }
  await until(`document.querySelector('.metric-value .speed-value')?.innerText.includes('Mbit/s')`, 'Live megabit traffic did not render after relaunch');
  await evaluate(`document.querySelector('.metric-value .speed-value').click()`);
  await until(`document.querySelector('.metric-value .speed-value')?.innerText.includes('MB/s') && JSON.parse(localStorage.getItem('netkonnect-preferences')).speedUnit==='MB/s'`, 'Speed click did not change or save units');
  await evaluate(`location.reload()`);
  await until(`document.querySelector('.metric-value .speed-value')?.innerText.includes('MB/s')`, 'Speed units did not survive reload');
  for(let i=0;i<6;i++)await evaluate(`document.querySelector('.metric-value .speed-value').click()`);
  await until(`document.querySelector('.metric-value .speed-value')?.innerText.includes('Mbit/s')`, 'Speed units did not cycle back to megabits');
  const footer=await evaluate(`document.querySelector('.version').innerText`);
  if(!footer.includes('kneurons made this for you') || !footer.includes('© 2026') || footer.includes('KURIOUS'))throw new Error('Release attribution did not render: '+footer);
  await evaluate(`document.querySelector('[data-map-expand]').click(); document.querySelector('[data-route]').click()`);
  await until(`!!document.querySelector('.drawer .route-endpoint .speed-value')`, 'Route connection speeds did not render');
  await evaluate(`document.querySelector('.drawer .route-endpoint .speed-value').click()`);
  await until(`!!document.querySelector('.drawer .route-detail-heading') && JSON.parse(localStorage.getItem('netkonnect-preferences')).speedUnit==='MB/s'`, 'Clicking a route connection speed changed the drawer instead of the units');
  await evaluate(`document.querySelector('.drawer .route-endpoint [data-connection]').click()`);
  await until(`!!document.querySelector('.drawer .detail-list .speed-value')`, 'Connection detail speed did not render');
  await evaluate(`document.querySelector('.drawer .detail-list .speed-value').click()`);
  await until(`!!document.querySelector('.drawer .detail-list') && JSON.parse(localStorage.getItem('netkonnect-preferences')).speedUnit==='KB/s'`, 'Connection detail speed did not change units');
  await evaluate(`document.querySelector('[data-action="close"]').click()`);
  for(let i=0;i<5;i++)await evaluate(`document.querySelector('.metric-value .speed-value').click()`);
  await evaluate(`document.querySelector('.metric-value .speed-value').blur()`);
  await saveScreenshot('dashboard-sidebar-relaunch.png');
  console.log('DESKTOP_SETUP_QA '+JSON.stringify(result)+' cancellation=passed retry=passed recheck=passed pausedDrawer=passed (Windows setup fixture)');
}
