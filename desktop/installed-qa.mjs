// This acceptance path uses the installed app's real profile, Electron startup
// API, Windows task/firewall evidence, helper, SQLite and renderer bridge.
// It never substitutes fixture settings or independently infers readiness.
export async function checkInstalledSetupUI(window, saveScreenshot) {
  const evaluate = code => window.webContents.executeJavaScript(code);
  const until = async (code, message, timeout = 90000) => {
    const deadline=Date.now()+timeout;
    while(Date.now()<deadline) {
      if(await evaluate(code))return;
      if(await evaluate(`!!document.querySelector('.setup-journey.halted')`))break;
      await new Promise(resolve=>setTimeout(resolve,500));
    }
    await saveScreenshot('installed-setup-failure.png');
    throw new Error(message+': '+await evaluate(`document.querySelector('.easy-setup')?.innerText`));
  };
  await until(`!!document.querySelector('.easy-button:not(:disabled)')`, 'Installed Easy Button did not become available');
  await evaluate(`document.querySelector('.easy-button').click()`);
  await until(`document.querySelector('.setup-journey.landed') && !document.querySelector('.easy-button').disabled`, 'Real installed setup did not finish');
  const evidence = () => evaluate(`(async()=>{
    const status=await window.netKonnect.setupStatus(), data=await window.netKonnect.snapshot();
    return {complete:status.complete,checks:status.checks,startupStatus:status.startupStatus,
      progress:status.progress,visibleChecks:[...document.querySelectorAll('.sidebar [data-setup-check]')].map(e=>({id:e.dataset.setupCheck,ready:e.classList.contains('ready')})),
      percent:document.querySelector('.sidebar [role="progressbar"]')?.getAttribute('aria-valuenow'),
      pending:document.querySelectorAll('.sidebar .setup-checks .pending').length,
      instanceId:data.service.instanceId,collectorError:data.error,storageError:data.service.storageError,trafficAvailable:data.snapshot?.traffic.available,
      trafficTimestamp:data.snapshot?.traffic.timestamp};
  })()`);
  const assertReady = result => {
    if(!result.complete || result.checks?.length!==7 || result.checks.some(c=>!c.ready)
      || result.visibleChecks?.length!==7 || result.visibleChecks.some(c=>!c.ready) || result.pending!==0
      || result.percent!=='100' || result.progress?.state!=='complete'
      || !result.startupStatus?.ready || !result.trafficAvailable || result.collectorError || result.storageError) {
      throw new Error('Installed UI readiness verification failed: '+JSON.stringify(result));
    }
  };
  let result=await evidence();assertReady(result);
  await saveScreenshot('installed-all-checks-ready.png');
  // Exercise the actual Restart Service control, then require fresh capture and
  // all the same setup checks to recover. Recheck setup through the same button.
  await evaluate(`document.querySelector('[data-action="restart-service"]').click()`);
  await until(`(async()=>{const s=await window.netKonnect.setupStatus(),d=await window.netKonnect.snapshot();return d.service.instanceId!==${JSON.stringify(result.instanceId)} && s.complete && s.checks.length===7 && s.checks.every(c=>c.ready) && !document.querySelector('[data-action="restart-service"]').disabled})()`, 'Installed capture did not recover after Restart Service',30000);
  await evaluate(`document.querySelector('.easy-button').click()`);
  await until(`document.querySelector('.setup-journey.landed') && !document.querySelector('.easy-button').disabled`, 'Installed setup recheck did not finish');
  // Wait across multiple real collector intervals and UI refreshes.
  for(let i=0;i<3;i++) { await new Promise(resolve=>setTimeout(resolve,4000));result=await evidence();assertReady(result); }
  await saveScreenshot('installed-after-restart-ready.png');
  return { ...result, restartRecovered:true, stableChecks:true, checkpoint:true, fixtures:false };
}
