import net from 'node:net';
import dgram from 'node:dgram';
import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import tls from 'node:tls';
import { syncBuiltinESMExports } from 'node:module';

export const APP_ORIGIN = 'netkonnect://app';
export function isLocalAsset(value) {
  try { const u = new URL(value); return u.protocol === 'netkonnect:' && u.hostname === 'app' && !u.port && !u.username && !u.password; }
  catch { return false; }
}
export function installNodeOfflineGuard() {
  const denied = () => { throw new Error('netKonnect offline policy: outbound networking is disabled.'); };
  const original = net.Socket.prototype.connect;
  net.Socket.prototype.connect = function (...args) {
    // Node normalizes pipe arguments internally. Permit only our local pipe family.
    const value = Array.isArray(args[0]) ? args[0][0] : args[0];
    const path = typeof value === 'string' ? value : value?.path;
    if (!path || !/^\\\\\.\\pipe\\netkonnect-[a-f0-9-]+$/i.test(path)) return denied();
    return original.apply(this, args);
  };
  net.Server.prototype.listen = new Proxy(net.Server.prototype.listen, { apply(fn, self, args) {
    const path = typeof args[0] === 'string' ? args[0] : args[0]?.path;
    if (!path || !/^\\\\\.\\pipe\\netkonnect-[a-f0-9-]+$/i.test(path)) return denied();
    return Reflect.apply(fn, self, args);
  } });
  for (const module of [http, https]) { module.request = denied; module.get = denied; }
  tls.connect = denied; dgram.createSocket = denied; globalThis.fetch = denied;
  for (const key of Object.keys(dns)) if (/^(lookup|resolve|reverse)/.test(key) && typeof dns[key] === 'function') dns[key] = denied;
  for (const key of Object.keys(dns.promises)) if (/^(lookup|resolve|reverse)/.test(key)) dns.promises[key] = denied;
  syncBuiltinESMExports();
}
export function configureOfflineSession(session) {
  session.webRequest.onBeforeRequest((details, callback) => callback({ cancel: !isLocalAsset(details.url) && !details.url.startsWith('blob:netkonnect://app/') && !details.url.startsWith('data:image/') }));
  session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.setPermissionCheckHandler(() => false);
  session.setDevicePermissionHandler(() => false);
  session.on('will-download', (_event, item) => { if (!item.getURL().startsWith('blob:netkonnect://app/')) item.cancel(); });
}
