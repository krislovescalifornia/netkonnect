import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFileSync,spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import net from 'node:net';

test('Windows native host compiles, forwards only fixed IPC, and handles fragmented UTF-8 frames and responses',{skip:process.platform!=='win32',timeout:30000},async()=>{
  const directory=await mkdtemp(join(tmpdir(),'netkonnect-browser-test-')),bridge=join(directory,'browser-bridge');await mkdir(bridge);
  const compiler=join(process.env.SystemRoot,'Microsoft.NET','Framework64','v4.0.30319','csc.exe');
  const executable=join(bridge,'host.exe'),reference=join(process.env.SystemRoot,'Microsoft.NET','Framework64','v4.0.30319','System.Web.Extensions.dll');
  execFileSync(compiler,['/nologo','/target:exe',`/reference:${reference}`,`/out:${executable}`,resolve('lib/BrowserHost.cs')],{windowsHide:true,encoding:'utf8'});
  execFileSync(compiler,['/nologo','/target:library',`/out:${join(directory,'name.dll')}`,resolve('lib/NameTrace.cs')],{windowsHide:true,encoding:'utf8'});
  assert.match(execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',resolve('test/browser-bridge.ps1'),'-Directory',directory],{windowsHide:true,encoding:'utf8'}),/BROWSER_BRIDGE_VERIFIED/);
  const statuses=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',resolve('test/name-evidence.ps1')],{windowsHide:true,encoding:'utf8'}).trim().split(/\r?\n/).map(line=>JSON.parse(line));
  assert.ok(statuses.some(r=>r.source==='windows-dns-etw'&&typeof r.available==='boolean'));assert.ok(statuses.some(r=>r.source==='wfp-audit'&&typeof r.available==='boolean'));
  const pipe='\\\\.\\pipe\\netkonnect-'+randomBytes(16).toString('hex'),token=randomBytes(32).toString('hex');
  await writeFile(join(directory,'companion.json'),JSON.stringify({pipe,token}));
  let calls=0;const server=net.createServer(socket=>{let input='';socket.on('data',bytes=>{input+=bytes.toString('utf8');if(!input.includes('\n'))return;
    const request=JSON.parse(input);assert.equal(request.method,'browser-evidence');assert.equal(request.token,token);assert.equal(request.params.events[0].security.certificateIssuer,'Example · CA');assert.equal(request.params.source,['firefox','chrome','edge'][calls]);calls++;
    const response=Buffer.from(JSON.stringify({result:{accepted:1,enabled:true,message:'Local · only'}})+'\n');socket.write(response.subarray(0,9));setTimeout(()=>socket.end(response.subarray(9)),20);
  });});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(pipe,resolve);});
  try {
    const child=spawn(executable,[join(bridge,'manifest.json'),'service-insight@netkonnect.local'],{windowsHide:true,stdio:['pipe','pipe','pipe']});
    const output=[];child.stdout.on('data',bytes=>output.push(bytes));const ended=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>resolve(code));});
    const payload=Buffer.from(JSON.stringify({version:1,events:[{security:{certificateIssuer:'Example · CA'}}]})),header=Buffer.alloc(4);header.writeUInt32LE(payload.length);
    child.stdin.write(header.subarray(0,2));child.stdin.write(Buffer.concat([header.subarray(2),payload.subarray(0,15)]));child.stdin.end(payload.subarray(15));
    assert.equal(await ended,0);const frame=Buffer.concat(output),length=frame.readUInt32LE(0);assert.equal(length,frame.length-4);assert.equal(JSON.parse(frame.subarray(4).toString('utf8')).message,'Local · only');assert.equal(calls,1);
    const ids=JSON.parse(await readFile(resolve('browser/identities.json'),'utf8'));
    for(const browser of ['chrome','edge']){
      const chromium=spawn(executable,[`chrome-extension://${ids[browser].id}/`,'--parent-window=0'],{windowsHide:true,stdio:['pipe','pipe','pipe']});
      const chunks=[];chromium.stdout.on('data',bytes=>chunks.push(bytes));const done=new Promise((resolve,reject)=>{chromium.once('error',reject);chromium.once('exit',resolve);});
      const spoofed=Buffer.from(JSON.stringify({version:1,source:'firefox',events:[{security:{certificateIssuer:'Example · CA'}}]}));const size=Buffer.alloc(4);size.writeUInt32LE(spoofed.length);chromium.stdin.end(Buffer.concat([size,spoofed]));
      assert.equal(await done,0);const response=Buffer.concat(chunks);assert.equal(JSON.parse(response.subarray(4).toString('utf8')).accepted,1);
    }
    assert.equal(calls,3);
    const wrong=spawn(executable,['manifest.json','other-addon@example.test'],{windowsHide:true});const wrongEnded=new Promise(resolve=>wrong.once('exit',resolve));wrong.stdin.end();assert.equal(await wrongEnded,1);assert.equal(calls,3);
    for(const args of [[`chrome-extension://${'a'.repeat(32)}/`,'--parent-window=0'],[`chrome-extension://${ids.chrome.id}/`,'--arbitrary-option=1']]){
      const bad=spawn(executable,args,{windowsHide:true});const done=new Promise(resolve=>bad.once('exit',resolve));bad.stdin.end();assert.equal(await done,1);
    }
    const oversized=spawn(executable,['manifest.json','service-insight@netkonnect.local'],{windowsHide:true});const oversizedEnded=new Promise(resolve=>oversized.once('exit',resolve));const large=Buffer.alloc(4);large.writeUInt32LE(65537);oversized.stdin.end(large);assert.equal(await oversizedEnded,1);assert.equal(calls,3);
  } finally {await new Promise(resolve=>server.close(resolve));await rm(directory,{recursive:true,force:true});}
});
