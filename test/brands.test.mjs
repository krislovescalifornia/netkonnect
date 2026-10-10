import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { appName, appIdentity, brandBadge, brands } from '../public/brands.js';
import { buildRoutes, serviceIdentity } from '../public/routes.js';
import { createAppServer } from '../lib/http.mjs';
import { BRAND_ART, ILLUSTRATION_ASSETS } from '../public/artwork/manifest.js';
import { requiredAssets } from '../desktop/bundle.mjs';
import { readFile, readdir } from 'node:fs/promises';

const connection = { app:'code', pid:42, scope:'Internet', protocol:'TCP', state:'Established', remoteAddress:'1.2.3.4', remotePort:443, domainCandidates:['github.com'] };

test('process aliases display brand names while filters and route keys keep the process identity', () => {
  assert.equal(appName('FIREFOX.exe'),'Firefox');
  assert.equal(appName('claude'),'Claude');
  assert.equal(appIdentity('claude').logo,'claude');
  assert.equal(appName('msedge'),'Microsoft Edge');
  assert.equal(appName('unknownWorker.exe'),'UnknownWorker');
  const routes = buildRoutes([connection],{app:'code',query:'Visual Studio Code'});
  assert.equal(routes.length,1);
  assert.equal(routes[0].app,'code');
  assert.equal(routes[0].key,'code|github');
  assert.equal(buildRoutes([connection],{app:'Visual Studio Code'}).length,0);
});

test('service logos require consistent hostname evidence and preserve unknown and ambiguous destinations', () => {
  const claude = serviceIdentity({...connection,domainCandidates:['api.claude.ai.']});
  assert.equal(claude.label,'Claude');
  assert.equal(claude.logo,'claude');
  assert.equal(serviceIdentity({...connection,domainCandidates:['foo.spotify.com','bar.scdn.co']}).logo,'spotify');
  const ambiguous = serviceIdentity({...connection,domainCandidates:['claude.ai','unrelated.example']});
  assert.equal(ambiguous.label,'1.2.3.4');
  assert.equal(ambiguous.logo,undefined);
  assert.equal(serviceIdentity({...connection,domainCandidates:['notclaude.ai']}).logo,null);
  assert.equal(serviceIdentity({...connection,domainCandidates:[]}).label,'1.2.3.4');
});

test('unknown application badges escape process text and never turn names into image paths', () => {
  const badge = brandBadge(appIdentity('<script>'));
  assert.match(badge,/&lt;/);
  assert.doesNotMatch(badge,/<script|<img/);
});

test('every known badge uses measured watercolor art included in the offline bundle', async () => {
  const logos = new Set(Object.values(brands).map(([,logo])=>logo));
  assert.deepEqual(new Set(Object.keys(BRAND_ART)),logos);
  for (const [key,[,logo]] of Object.entries(brands)) {
    const path = `artwork/brands/${logo}.png`;
    assert.match(brandBadge(appIdentity(key)),new RegExp(path.replaceAll('.','\\.')));
    assert.doesNotMatch(brandBadge(appIdentity(key)),/\/icons\//);
    assert.ok(ILLUSTRATION_ASSETS.includes(path));
    assert.ok(requiredAssets.includes('public/'+path));
    const art = BRAND_ART[logo], png = await readFile(new URL('../public/'+path,import.meta.url));
    assert.equal(png[25],6,'RGBA with genuine transparency');
    assert.deepEqual([png.readUInt32BE(16),png.readUInt32BE(20)],art.size);
    const [x,y,w,h]=art.frames[0];
    assert.ok(x>=0&&y>=0&&w>0&&h>0&&x+w<=art.size[0]&&y+h<=art.size[1]);
  }
  assert.doesNotMatch(brandBadge({label:'Unknown',logo:'../private'}),/<image|<img/);
  assert.doesNotMatch(brandBadge({label:'Unknown',logo:'__proto__'}),/<image|<img/);
});

test('watercolor PNGs and original SVG references load locally while arbitrary paths stay private', async t => {
  const server = createAppServer({getSnapshot:()=>({snapshot:null})});
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}`;
  const originalLogos=(await readdir(new URL('../public/icons/',import.meta.url))).filter(name=>name.endsWith('.svg')).map(name=>name.slice(0,-4));
  for (const logo of originalLogos) {
    const response = await fetch(`${url}/icons/${logo}.svg`);
    assert.equal(response.status,200,logo);
    assert.match(response.headers.get('content-type'),/^image\/svg\+xml/);
    const svg = await response.text();
    assert.match(svg,/<svg/);
    assert.doesNotMatch(svg,/<script|<foreignObject|(?:href|src)=["']https?:/i);
  }
  for (const logo of new Set(Object.values(brands).map(([,logo])=>logo))) {
    const watercolor = await fetch(`${url}/artwork/brands/${logo}.png`);
    assert.equal(watercolor.status,200,logo);
    assert.match(watercolor.headers.get('content-type'),/^image\/png/);
    await watercolor.arrayBuffer();
  }
  assert.equal((await fetch(`${url}/brands.js`)).status,200);
  assert.equal((await fetch(`${url}/speed.js`)).status,200);
  assert.equal((await fetch(`${url}/icons/LICENSE`)).status,404);
  assert.equal((await fetch(`${url}/icons/not-a-brand.svg`)).status,404);
  assert.equal((await fetch(`${url}/package.json`)).status,404);
  assert.equal((await fetch(`${url}/artwork/brands/generation-prompts.json`)).status,404);
  assert.equal((await fetch(`${url}/artwork/brands/not-a-brand.png`)).status,404);
});
