import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { brands } from '../public/brands.js';

const publicRoot = new URL('../public/', import.meta.url);
const assets = new Map([['/', 'index.html'], ['/index.html', 'index.html'], ['/app.js', 'app.js'], ['/map.js', 'map.js'], ['/routes.js', 'routes.js'], ['/demo.js', 'demo.js'], ['/style.css', 'style.css'], ['/transport.css', 'transport.css']]);
assets.set('/brands.js', 'brands.js');
for (const [, logo] of Object.values(brands)) assets.set(`/icons/${logo}.svg`, `icons/${logo}.svg`);
const types = { html: 'text/html', js: 'text/javascript', css: 'text/css', svg:'image/svg+xml' };

export function createAppServer({ getSnapshot, requestRestart }) {
  return http.createServer(async (req, res) => {
    const hosts = [`127.0.0.1:${req.socket.localPort}`, `localhost:${req.socket.localPort}`];
    const origins = hosts.map(host => `http://${host}`);
    if (!hosts.includes(req.headers.host)) { res.writeHead(403).end('Local access only'); return; }
    if (req.headers.origin && !origins.includes(req.headers.origin)) { res.writeHead(403).end('Origin denied'); return; }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'");
    res.setHeader('Cache-Control', 'no-store');
    const path = new URL(req.url, `http://${req.headers.host}`).pathname;
    const json = (code, value) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
    if (path === '/api/restart' && req.method === 'POST') {
      const service = getSnapshot().service;
      // A website on another origin cannot read the per-instance token or issue
      // this custom-header request. Require Origin even on local requests.
      if (!origins.includes(req.headers.origin) || req.headers['sec-fetch-site'] === 'cross-site') { json(403, { error: 'Restart must be requested from the netKonnect dashboard.' }); return; }
      if (req.headers['x-netkonnect-instance'] !== service.instanceId) { json(409, { error: 'The service has changed. Refresh the dashboard and try again.' }); return; }
      if (service.restarting) { json(409, { error: 'The service is already restarting.' }); return; }
      try {
        const restart = await requestRestart();
        let committed = false;
        const commit = () => { if (!committed) { committed = true; restart(); } };
        res.once('finish', commit);
        res.once('close', commit);
        if (res.destroyed) { commit(); return; }
        json(202, { restarting: true });
      } catch (error) { json(500, { error: error.message || 'Could not restart the service. Try again.' }); }
      return;
    }
    if (req.method !== 'GET') { res.writeHead(405, { Allow: path === '/api/restart' ? 'POST' : 'GET' }).end('Method not allowed'); return; }
    if (path === '/api/snapshot') { json(200, getSnapshot()); return; }
    const asset = assets.get(path);
    if (!asset) { res.writeHead(404).end('Not found'); return; }
    try {
      const data = await readFile(new URL(asset, publicRoot));
      res.writeHead(200, { 'Content-Type': `${types[asset.split('.').pop()]}; charset=utf-8`, 'Cache-Control': 'no-cache' });
      res.end(data);
    } catch { res.writeHead(500).end('Asset unavailable'); }
  });
}
