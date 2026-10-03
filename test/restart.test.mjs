import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once, EventEmitter } from 'node:events';
import { createAppServer } from '../lib/http.mjs';
import { prepareRestart } from '../lib/restart.mjs';

async function fixture(t, requestRestart) {
  const service = { instanceId: 'test-instance', restarting: false };
  const server = createAppServer({ getSnapshot: () => ({ snapshot: null, service }), requestRestart });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const port = server.address().port;
  const request = (path, method = 'GET', headers = {}) => new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path, method, headers }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject); req.end();
  });
  return { service, request, headers: { Origin: `http://127.0.0.1:${port}`, 'X-NetKonnect-Instance': service.instanceId } };
}

test('restart requires a same-origin POST and the current service instance', async t => {
  let restarts = 0;
  const { request, headers } = await fixture(t, async () => () => restarts++);
  assert.equal((await request('/api/snapshot')).status, 200);
  assert.equal((await request('/api/restart')).status, 404);
  assert.equal((await request('/api/restart', 'POST')).status, 403);
  assert.equal((await request('/api/restart', 'POST', { ...headers, Origin: 'https://unrelated.example' })).status, 403);
  assert.equal((await request('/api/restart', 'POST', { ...headers, 'Sec-Fetch-Site': 'cross-site' })).status, 403);
  assert.equal((await request('/api/restart', 'POST', { ...headers, 'X-NetKonnect-Instance': 'old-instance' })).status, 409);
  assert.equal((await request('/api/restart', 'POST', { ...headers, Host: 'unrelated.example' })).status, 403);
  assert.equal((await request('/api/snapshot', 'POST', headers)).status, 405);
  assert.equal(restarts, 0);
  const response = await request('/api/restart', 'POST', headers);
  assert.equal(response.status, 202);
  assert.deepEqual(JSON.parse(response.body), { restarting: true });
  assert.equal(restarts, 1);
});

test('restart preparation failures keep the service reachable and duplicate requests are rejected', async t => {
  const { service, request, headers } = await fixture(t, async () => { throw new Error('Helper unavailable'); });
  const failure = await request('/api/restart', 'POST', headers);
  assert.equal(failure.status, 500);
  assert.equal(JSON.parse(failure.body).error, 'Helper unavailable');
  assert.equal((await request('/api/snapshot')).status, 200);
  service.restarting = true;
  assert.equal((await request('/api/restart', 'POST', headers)).status, 409);
});

test('restart helper inherits the runtime and port, and commits only after readiness', async () => {
  const helper = new EventEmitter();
  let options, command, args, sent = false, detached = false;
  helper.kill = () => {};
  helper.connected = true;
  helper.send = (message, callback) => { assert.deepEqual(message, { type: 'restart' }); sent = true; callback(); };
  helper.disconnect = () => { helper.connected = false; };
  helper.unref = () => { detached = true; };
  const handoff = await prepareRestart({ port: 4321, trafficPid: 123, launch: (...parameters) => {
    [command, args, options] = parameters;
    queueMicrotask(() => helper.emit('message', { type: 'ready' }));
    return helper;
  } });
  assert.equal(command, process.execPath);
  assert.deepEqual(args.slice(1), [String(process.pid), '123', '4321']);
  assert.equal(options.windowsHide, true);
  assert.equal(options.detached, true);
  assert.equal(sent, false);
  await handoff();
  assert.equal(sent, true);
  assert.equal(detached, true);
  assert.equal(helper.connected, false);
});

test('a failed helper cannot commit a restart', async () => {
  const helper = new EventEmitter();
  let killed = false;
  helper.kill = () => { killed = true; };
  await assert.rejects(prepareRestart({ port: 4321, launch: () => {
    queueMicrotask(() => helper.emit('error', new Error('Spawn failed')));
    return helper;
  } }), /Spawn failed/);
  assert.equal(killed, true);
});
