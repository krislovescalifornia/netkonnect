// Completion means live evidence, not just a successfully registered task.
export function setupChecks(settings, data, now = Date.now()) {
  const snapshot = data?.snapshot;
  const fresh = !!snapshot && now - Date.parse(snapshot.timestamp) < 30000 && !data.error;
  const observations = fresh && Array.isArray(snapshot.connections) && Array.isArray(snapshot.adapters)
    && (Array.isArray(snapshot.dnsRecords) || data.service?.observations?.dns === true)
    && (!!snapshot.processes || data.service?.observations?.processes === true);
  return [
    { id:'companion', label:'Background companion', ready:!!data?.service?.companion },
    { id:'startup', label:'Automatic collection at sign-in', ready:settings.startup === true },
    { id:'helper', label:'Privileged capture helper', ready:settings.detailedStartup === true },
    { id:'firewall', label:'Local-only app protection', ready:settings.firewall === true },
    { id:'snapshots', label:'Connections, processes, adapters and DNS clues', ready:!!observations },
    { id:'capture', label:'Measured TCP / UDP bytes and destination peers', ready:fresh && snapshot.traffic?.available === true },
    { id:'history', label:'Local history storage', ready:!!data?.service?.database && !data.service.storageError }
  ];
}

export function createSetup({ ensureCompanion, readSettings, configure, startHelper, enableStartup, readSnapshot, checkpoint,
  preflight = async () => {}, onProgress = () => {},
  now = Date.now, delay = ms => new Promise(resolve => setTimeout(resolve, ms)), timeout = 45000 }) {
  let running = null;
  let progress = null;
  const report = (step, state = 'running', checks = progress?.checks || [], error = '') => {
    progress = { step, total:6, state, checks, error, startedAt:progress?.startedAt ?? now(), updatedAt:now(),
      percent:state === 'complete' ? 100 : Math.max(progress?.percent || 0, Math.round((step - 1) / 6 * 100)) };
    onProgress({ ...progress });
  };
  const run = () => {
    if (running) return running;
    progress = null;
    report(1);
    running = (async () => {
      await preflight();
      await ensureCompanion();
      report(2);
      let settings = await readSettings();
      let data = await readSnapshot();
      report(3, 'running', setupChecks(settings, data, now()));
      // Healthy rechecks do not trigger another UAC approval or reset a trace.
      if (!settings.detailedStartup || !settings.firewall) await configure();
      else if (!data.snapshot?.traffic?.available) await startHelper();
      report(4);
      await enableStartup();
      settings = await readSettings();
      if (!settings.startup) throw new Error('Setup needs attention: Automatic collection at sign-in. Windows did not enable the companion startup entry. Check Windows Startup Apps and retry.');
      report(5);
      const deadline = now() + timeout;
      do {
        settings = await readSettings();
        data = await readSnapshot();
        const checks = setupChecks(settings, data, now());
        report(5, 'running', checks);
        if (checks.every(check => check.ready)) {
          report(6, 'running', checks);
          await checkpoint();
          settings = await readSettings();
          data = await readSnapshot();
          const verified = setupChecks(settings, data, now());
          if (verified.every(check => check.ready)) {
            report(6, 'complete', verified);
            return { ...settings, checks:verified, complete:true };
          }
          report(5, 'running', verified);
        }
        if (now() >= deadline) break;
        await delay(1000);
      } while (true);
      const checks = setupChecks(settings, data, now());
      const pending = checks.filter(check => !check.ready).map(check => check.label).join(', ');
      throw new Error(`Setup needs attention: ${pending}. ${data.error || data.service?.storageError || data.snapshot?.traffic?.message || 'Click Easy Button to check and repair again.'}`);
    })().catch(error => {
      report(progress.step, 'error', progress.checks, error.message);
      throw error;
    }).finally(() => { running = null; });
    return running;
  };
  run.getProgress = () => progress ? { ...progress } : null;
  return run;
}
