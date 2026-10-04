import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { appName, appIdentity, brandBadge, brands } from '../public/brands.js';
import { buildRoutes, serviceIdentity } from '../public/routes.js';
import { createAppServer } from '../lib/http.mjs';

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

test('all bundled brand assets are served as SVGs and arbitrary paths remain inaccessible', async t => {
  const server = createAppServer({getSnapshot:()=>({snapshot:null})});
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}`;
  for (const logo of new Set(Object.values(brands).map(([,logo])=>logo))) {
    const response = await fetch(`${url}/icons/${logo}.svg`);
    assert.equal(response.status,200,logo);
    assert.match(response.headers.get('content-type'),/^image\/svg\+xml/);
    const svg = await response.text();
    assert.match(svg,/<svg/);
    assert.doesNotMatch(svg,/<script|<foreignObject|(?:href|src)=["']https?:/i);
  }
  assert.equal((await fetch(`${url}/brands.js`)).status,200);
  assert.equal((await fetch(`${url}/speed.js`)).status,200);
  assert.equal((await fetch(`${url}/icons/LICENSE`)).status,404);
  assert.equal((await fetch(`${url}/icons/not-a-brand.svg`)).status,404);
  assert.equal((await fetch(`${url}/package.json`)).status,404);
});
