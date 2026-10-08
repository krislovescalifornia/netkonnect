import { app, BrowserWindow, Menu, Tray, nativeImage, protocol, session, ipcMain, dialog } from 'electron';
import { fileURLToPath } from 'node:url';
import { join, resolve, extname } from 'node:path';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { spawn, execFile } from 'node:child_process';
import { APP_ORIGIN, isLocalAsset, configureOfflineSession, installNodeOfflineGuard } from './offline.mjs';
import { callCompanion } from './pipe.mjs';
import { createSetup, setupChecks } from './setup.mjs';
import { verifyBundle, isProtectedInstall } from './bundle.mjs';
import { createHash } from 'node:crypto';
import { setupSmokeFixture, checkSetupUI } from './setup-smoke.mjs';
import { assertCompanionIdentity } from './companion-identity.mjs';
import { readCompanionStartup, setCompanionStartup } from './startup.mjs';
import { checkInstalledSetupUI } from './installed-qa.mjs';

installNodeOfflineGuard();
const root = fileURLToPath(new URL('../', import.meta.url));
const collectorMode = process.argv.includes('--collector') || process.argv.includes('collector');
const smokeTest = process.argv.includes('--smoke-test');
const installedQA = process.argv.includes('--verify-installed-setup') && !collectorMode;
const installed = app.isPackaged && isProtectedInstall(process.execPath, [process.env.ProgramFiles, process.env['ProgramFiles(x86)']]);
const testDirectory = (smokeTest || installedQA) && process.env.NETKONNECT_QA_DIRECTORY || join(root,'test-results');
// Distinct singleton locks let UI and companion run as independent processes.
// Roaming AppData can point at an SMB share. Keep the journal on a fixed local disk.
const previewId = createHash('sha256').update(root).digest('hex').slice(0,12);
const localRoot = smokeTest ? join(testDirectory, 'smoke-profile') : app.isPackaged
  ? join(process.env.LOCALAPPDATA || '', 'netKonnect', ...(installed ? [] : ['preview-' + previewId]))
  : join(root, 'data', 'desktop');
if (!/^[a-z]:\\/i.test(localRoot)) throw new Error('netKonnect requires a local Windows data directory.');
app.setPath('userData', join(localRoot, collectorMode ? 'companion-profile' : 'desktop-profile'));
const directory = join(localRoot, 'data');
let window, tray, collector, exiting = false;
app.commandLine.appendSwitch('disable-background-networking');
// Software compositing avoids driver-dependent blank windows on Windows hosts.
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-component-update');
app.commandLine.appendSwitch('disable-domain-reliability');
app.commandLine.appendSwitch('disable-sync');
app.commandLine.appendSwitch('no-pings');
app.commandLine.appendSwitch('host-resolver-rules', 'MAP * ~NOTFOUND');
app.commandLine.appendSwitch('force-webrtc-ip-handling-policy', 'disable_non_proxied_udp');
app.commandLine.appendSwitch('disable-features', 'MediaRouter,OptimizationHints,AutofillServerCommunication,CertificateTransparencyComponentUpdater');
protocol.registerSchemesAsPrivileged([{ scheme:'netkonnect', privileges:{ standard:true, secure:true, supportFetchAPI:true, corsEnabled:true } }]);
if (!app.requestSingleInstanceLock()) { if (smokeTest || installedQA) app.exit(1); else app.quit(); }
else {
  app.on('second-instance', () => { if (!collectorMode) { if (window?.isMinimized()) window.restore(); window?.show(); window?.focus(); } });
  app.on('window-all-closed', () => { if (!collectorMode) app.quit(); });
  app.whenReady().then(start).catch(async error => {
    console.error(error);
    if (smokeTest && !collectorMode) await callCompanion(directory,'smoke-stop').catch(()=>{});
    if (collectorMode) { await mkdir(directory,{recursive:true}); await writeFile(join(directory,'companion-error.log'),error.stack || error.message); }
    else if (!smokeTest && !installedQA) await dialog.showMessageBox({ type:'error',title:'netKonnect could not start',message:error.message });
    app.exit(1);
  });
}
function launch(args) {
  const env={...process.env}; delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(process.execPath, [...(app.isPackaged ? [] : [root]), ...args, ...(smokeTest ? ['--smoke-test'] : [])], { detached:true, windowsHide:true, stdio:'ignore', env });
  child.on('error', () => {}); child.unref();
}
async function ensureCompanion() {
  let data;
  try { data = await callCompanion(directory, 'snapshot'); } catch { launch(['--collector']); }
  if (data) { assertCompanionIdentity(data, root, app.getVersion()); return; }
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 250));
    try { data = await callCompanion(directory, 'snapshot'); } catch { continue; }
    assertCompanionIdentity(data, root, app.getVersion()); return;
  }
  throw new Error('The tray companion could not start. Check the Windows notification area.');
}
const powershell = join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
const runPowerShell = args => new Promise((resolve, reject) => execFile(powershell, args, { windowsHide:true, timeout:120000 },
  (error, out, err) => error ? reject(new Error(err.trim() || 'Windows did not approve setup. Click Easy Button to retry.')) : resolve(out.trim())));
let userId;
async function currentUserId() {
  userId ??= runPowerShell(['-NoProfile','-NonInteractive','-Command','[Security.Principal.WindowsIdentity]::GetCurrent().User.Value']);
  return userId;
}
async function captureStatus() {
  if (!installed) return { installed:false, firewall:false };
  const out = await runPowerShell(['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',join(root,'desktop','manage-capture.ps1'),
    '-Action','Status','-DataDirectory',directory,'-UserId',await currentUserId()]);
  return JSON.parse(out);
}
async function captureInstalled() { return (await captureStatus()).installed; }
async function liveSettings() {
  const capture = await captureStatus();
  const data = capture.firewall === null ? await callCompanion(directory,'snapshot').catch(()=>null) : null;
  const startupStatus = readCompanionStartup(app, process.execPath);
  return { startup:startupStatus.ready, startupStatus, startupAvailable:installed,
    detailedStartup:capture.installed, detailedAvailable:installed, firewall:capture.firewall ?? data?.service?.protection?.firewall === true,
    database:join(directory,'history.sqlite'), offline:true, version:app.getVersion() };
}
const setupFixture = smokeTest && process.argv.includes('--setup-smoke-test') && !collectorMode ? setupSmokeFixture({
  readSnapshot:()=>callCompanion(directory,'snapshot'), checkpoint:()=>callCompanion(directory,'checkpoint')
}) : null;
const settings = setupFixture ? setupFixture.readSettings : liveSettings;
async function configureCapture(enabled) {
  if (typeof enabled !== 'boolean' || !installed) throw new Error('Install netKonnect to enable automatic detailed collection.');
  const quote = value => "'" + value.replace(/'/g, "''") + "'";
  const script = join(root,'desktop','manage-capture.ps1');
  const args = `-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${script}" -Action ${enabled ? 'Enable' : 'Disable'} -DataDirectory "${directory}" -UserId ${await currentUserId()}`;
  const command = `$p=Start-Process -FilePath ${quote(powershell)} -Verb RunAs -WindowStyle Hidden -ArgumentList ${quote(args)} -Wait -PassThru; if($p.ExitCode -ne 0){throw 'Windows could not finish setup. Approve Administrator access and click Easy Button to retry.'}`;
  await runPowerShell(['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(command,'utf16le').toString('base64')]);
  if (!enabled) await callCompanion(directory,'capture-stop');
}
async function setCapture(enabled) {
  await configureCapture(enabled);
  if (enabled) setCompanionStartup(app, process.execPath, true);
  return settings();
}
const easySetup = createSetup({ preflight:async()=> {
    await verifyBundle(root);
    if (!installed && !setupFixture) throw new Error('Install netKonnect to enable automatic detailed collection.');
  }, onProgress:progress=> {
    if (window && !window.isDestroyed()) window.webContents.send('nk:setup-progress', progress);
  }, ensureCompanion, readSettings:settings, configure:()=>configureCapture(true),
  startHelper:async()=> {
    const taskName = 'netKonnect Detailed Capture ' + await currentUserId();
    await new Promise((resolve,reject)=>execFile('schtasks.exe',['/Run','/TN',taskName],{windowsHide:true},
      (error,_out,err)=>error?reject(new Error(err.trim() || 'Windows could not start the capture helper.')):resolve()));
  },
  enableStartup:async()=> {
    if (!installed) throw new Error('Install netKonnect to set up automatic detailed collection.');
    setCompanionStartup(app, process.execPath, true);
  }, readSnapshot:()=>callCompanion(directory,'snapshot'), checkpoint:()=>callCompanion(directory,'checkpoint'),
  ...(setupFixture || {}) });
function trayImage() {
  return nativeImage.createFromPath(join(root,'desktop','tray.png'));
}
async function start() {
  if (installedQA && (!installed || smokeTest || !process.env.NETKONNECT_QA_DIRECTORY)) throw new Error('Installed verification requires the Program Files app, its real profile, and a QA output directory.');
  await verifyBundle(root);
  if(app.isPackaged) {
    const drive=localRoot.slice(0,3);
    const command=`if(([IO.DriveInfo]::new('${drive}')).DriveType -ne [IO.DriveType]::Fixed){exit 1}`;
    await new Promise((resolve,reject)=>execFile('powershell.exe',['-NoProfile','-NonInteractive','-Command',command],{windowsHide:true,timeout:10000},error=>error?reject(new Error('netKonnect stores data only on a fixed local disk.')):resolve()));
  }
  await mkdir(directory,{recursive:true,mode:0o700});
  configureOfflineSession(session.defaultSession);
  // A session with no proxy and no resolver cannot reach Chromium's services.
  await session.defaultSession.setProxy({ mode:'direct' });
  app.on('web-contents-created', (_event, contents) => {
    contents.setWindowOpenHandler(() => ({ action:'deny' }));
    contents.on('will-navigate', (event, url) => { if (!isLocalAsset(url)) event.preventDefault(); });
    contents.on('will-attach-webview', event => event.preventDefault());
  });
  Menu.setApplicationMenu(null);
  if (collectorMode) {
    const { startCompanion } = await import('./companion.mjs');
    collector = await startCompanion({directory,root,version:app.getVersion(),packaged:app.isPackaged, getFileIcon:(path,options)=>app.getFileIcon(path,options), onQuit:()=>app.quit(), onSmokeStop:smokeTest ? ()=>app.quit() : null});
    tray = new Tray(trayImage()); tray.setToolTip('netKonnect companion · observing locally');
    const open = () => launch([]);
    tray.on('double-click',open);
    tray.setContextMenu(Menu.buildFromTemplate([
      {label:'netKonnect · stays on your computer',enabled:false},
      {label:'Open observatory',click:open},
      {label:'Collection continues when the window closes',enabled:false},
      {type:'separator'},
      {label:'Quit companion (stop collecting)',click:()=>app.quit()}
    ]));
    app.on('before-quit', event => {
      if (exiting) return; event.preventDefault(); exiting=true;
      collector.stop().finally(()=> { tray?.destroy(); app.quit(); });
    });
    return;
  }
  await ensureCompanion();
  const types = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png' };
  protocol.handle('netkonnect', async request => {
    if (!isLocalAsset(request.url)) return new Response('Denied',{status:403});
    const u=new URL(request.url); let name;
    const iconMatch=/^\/app-icons\/([a-f0-9]{64})\.png$/.exec(u.pathname);
    if(iconMatch) {
      try {
        const {png}=await callCompanion(directory,'app-icon',{id:iconMatch[1]});
        return png?new Response(Buffer.from(png,'base64'),{headers:{'Content-Type':'image/png','Cache-Control':'private, max-age=31536000, immutable','X-Content-Type-Options':'nosniff'}}):new Response('Icon unavailable',{status:404});
      }catch{return new Response('Icon unavailable',{status:404});}
    }
    try { name=decodeURIComponent(u.pathname === '/' ? '/index.html' : u.pathname); } catch { return new Response('Bad path',{status:400}); }
    const path=resolve(root,'public','.'+name), publicRoot=resolve(root,'public');
    if (!path.startsWith(publicRoot + '\\') || !types[extname(path)]) return new Response('Not found',{status:404});
    try { return new Response(await readFile(path),{headers:{'Content-Type':types[extname(path)],'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'",'X-Content-Type-Options':'nosniff','Cache-Control':'no-store'}}); }
    catch { return new Response('Not found',{status:404}); }
  });
  const handle=(channel,fn)=>ipcMain.handle(channel, (event,...args)=> {
    if (!window || window.isDestroyed() || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || !isLocalAsset(event.senderFrame.url)) throw new Error('Untrusted desktop request.');
    return fn(...args);
  });
  handle('nk:snapshot',()=>callCompanion(directory,'snapshot'));
  handle('nk:analytics',options=>callCompanion(directory,'analytics',options));
  handle('nk:restart',()=>callCompanion(directory,'restart'));
  handle('nk:settings',settings);
  handle('nk:setup',easySetup);
  handle('nk:setup-status',async()=> {
    const config = await settings();
    const data = await (setupFixture ? setupFixture.readSnapshot() : callCompanion(directory,'snapshot')).catch(()=>null);
    const checks = setupChecks(config,data);
    return {...config,checks,complete:checks.every(check=>check.ready),progress:easySetup.getProgress()};
  });
  handle('nk:startup',async enabled=> {
    if (typeof enabled !== 'boolean' || !installed) throw new Error('Startup controls are available after installation.');
    if (!enabled && await captureInstalled()) await setCapture(false);
    setCompanionStartup(app, process.execPath, enabled); return settings();
  });
  handle('nk:capture',setCapture);
  handle('nk:enrichment',()=>callCompanion(directory,'enrichment-settings'));
  handle('nk:browser-extension',async params=>{
    const browser=params?.browser;
    if(!['chrome','edge'].includes(browser))throw new Error('Choose Chrome or Edge.');
    const label=browser==='chrome'?'Chrome':'Edge';
    const choice=await dialog.showSaveDialog({title:`Save ${label} extension`,defaultPath:`netKonnect-${label}-Service-Insight.zip`,filters:[{name:'Browser extension archive',extensions:['zip']}]});
    if(choice.canceled||!choice.filePath)return {saved:false};
    await writeFile(choice.filePath,await readFile(join(root,'browser',`netKonnect-${browser}-Service-Insight.zip`)));
    return {saved:true};
  });
  handle('nk:set-enrichment',params=>callCompanion(directory,'set-enrichment',params));
  handle('nk:enhanced-lookup',params=>callCompanion(directory,'enhanced-lookup',params));
  handle('nk:firefox-addon',async()=>{
    const choice=await dialog.showSaveDialog(window,{title:'Save Firefox Service Insight add-on',defaultPath:'netKonnect-Service-Insight.xpi',filters:[{name:'Firefox add-on',extensions:['xpi']}]});
    if(choice.canceled)return {saved:false};
    await writeFile(choice.filePath,await readFile(join(root,'browser','netKonnect-Service-Insight.xpi')));return {saved:true};
  });
  window=new BrowserWindow({ width:1460,height:980,minWidth:900,minHeight:650,backgroundColor:'#ffffff',title:'netKonnect',icon:nativeImage.createFromPath(join(root,'desktop','icon.png')),show:false,
    webPreferences:{preload:join(root,'desktop','preload.cjs'),contextIsolation:true,sandbox:true,nodeIntegration:false,webviewTag:false,spellcheck:false,devTools:!app.isPackaged} });
  if(process.argv.includes('--smoke-test')) window.webContents.on('console-message',event=> { if(event.level==='error'||event.level===3)console.error('RENDERER '+event.message); });
  window.once('ready-to-show',()=>window.show());
  await window.loadURL(APP_ORIGIN+'/index.html');
  window.show();
  if (installedQA) {
    await mkdir(testDirectory,{recursive:true});
    const result = await checkInstalledSetupUI(window, async name=>writeFile(join(testDirectory,name),(await window.webContents.capturePage()).toPNG()));
    await writeFile(join(testDirectory,'installed-acceptance.json'),JSON.stringify({version:app.getVersion(),verifiedAt:new Date().toISOString(),profile:localRoot,...result},null,2));
    console.log('INSTALLED_SETUP_VERIFIED '+JSON.stringify(result));
    app.quit();
  }
  if (process.argv.includes('--smoke-test')) {
    window.show();
    await new Promise(resolve=>setTimeout(resolve,1000));
    const deadline=Date.now()+30000;
    while(Date.now()<deadline && !(await callCompanion(directory,'snapshot')).snapshot) await new Promise(resolve=>setTimeout(resolve,500));
    const result = await window.webContents.executeJavaScript(`(async()=>({title:document.title,version:document.querySelector('[data-app-version]')?.textContent,bridge:!!window.netKonnect,snapshot:await window.netKonnect.snapshot(),cards:document.querySelectorAll('.metric').length}))()`);
    console.log('DESKTOP_SMOKE '+JSON.stringify({title:result.title,version:result.version,bridge:result.bridge,cards:result.cards,collectorPid:result.snapshot.service.pid,connections:result.snapshot.snapshot?.connections.length,error:result.snapshot.error,storageError:result.snapshot.service.storageError}));
    if (result.version !== `v${app.getVersion()}`) throw new Error('Dashboard version does not match the desktop release.');
    if (!result.bridge || result.cards!==4 || !result.snapshot.snapshot || result.snapshot.error || result.snapshot.service.storageError) throw new Error('Desktop data smoke check failed.');
    const remote = await window.webContents.executeJavaScript(`fetch('https://example.com').then(()=>false,()=>true)`);
    console.log('DESKTOP_REMOTE_BLOCKED '+remote);
    if(!remote)throw new Error('External networking was not blocked.');
    await mkdir(testDirectory,{recursive:true});
    await writeFile(join(testDirectory,'desktop-overview.png'),(await window.webContents.capturePage()).toPNG());
    if (setupFixture) await checkSetupUI(window, async name=>writeFile(join(testDirectory,name),(await window.webContents.capturePage()).toPNG()));
    await window.webContents.executeJavaScript(`document.querySelector('[data-action="settings"]').click()`);
    await new Promise(resolve=>setTimeout(resolve,700));
    const preferences=await window.webContents.executeJavaScript(`document.querySelectorAll('.drawer [data-companion-action]').length`);
    if(preferences!==3)throw new Error('Companion preferences did not render.');
    await writeFile(join(testDirectory,'desktop-preferences.png'),(await window.webContents.capturePage()).toPNG());
    await window.webContents.executeJavaScript(`document.querySelector('[data-page="activity"]').click()`);
    await new Promise(resolve=>setTimeout(resolve,2000));
    await writeFile(join(testDirectory,'desktop-analytics.png'),(await window.webContents.capturePage()).toPNG());
    const journal=await window.webContents.executeJavaScript(`document.querySelectorAll('.journal-day').length`);
    if(journal!==7)throw new Error('Persisted coverage journal did not render: '+await window.webContents.executeJavaScript(`document.querySelector('#main').innerText.slice(-3000)`));
    console.log('DESKTOP_VISUALS preferences='+preferences+' journalDays='+journal);
    await callCompanion(directory,'smoke-stop'); app.quit();
  }
}
