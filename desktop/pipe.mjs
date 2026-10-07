import net from 'node:net';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile, writeFile, rename, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import {StringDecoder} from 'node:string_decoder';

export const MAX_FRAME = 24 * 1024 * 1024;
export const pipeName = () => `\\\\.\\pipe\\netkonnect-${randomBytes(16).toString('hex')}`;
const equal = (a, b) => typeof a === 'string' && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
export async function writeEndpoint(directory, endpoint) {
  const file = join(directory, 'companion.json');
  await writeFile(file + '.tmp', JSON.stringify(endpoint), { mode: 0o600 });
  await rename(file + '.tmp', file);
  await chmod(file, 0o600);
}
export async function readEndpoint(directory) {
  const data = JSON.parse(await readFile(join(directory, 'companion.json'), 'utf8'));
  if (!/^\\\\\.\\pipe\\netkonnect-[a-f0-9]+$/i.test(data.pipe) || !/^[a-f0-9]{64}$/.test(data.token)) throw new Error('Invalid local companion endpoint.');
  return data;
}
export function servePipe(endpoint, dispatch) {
  const sockets = new Set();
  const server = net.createServer(socket => {
    sockets.add(socket); socket.on('error', () => {}); socket.once('close', () => sockets.delete(socket));
    socket.setTimeout(25000, () => socket.destroy());
    let input = '', bytes = 0, handled = false;const decoder=new StringDecoder('utf8');
    socket.on('data', async chunk => {
      if (handled) return;
      bytes += chunk.length; if (bytes > 128 * 1024) { socket.destroy(); return; }
      input += decoder.write(chunk);
      const end = input.indexOf('\n'); if (end < 0) return; handled = true;
      try {
        const request = JSON.parse(input.slice(0, end));
        if (!equal(request.token, endpoint.token)) throw new Error('Local companion access denied.');
        const result = await dispatch(request.method, request.params);
        const output = JSON.stringify({ result });
        if (Buffer.byteLength(output) > MAX_FRAME) throw new Error('Result exceeds the local IPC limit. Narrow the date range.');
        socket.end(output + '\n');
      } catch (error) { socket.end(JSON.stringify({ error: error.message }) + '\n'); }
    });
  });
  server.maxConnections = 32;
  return { server, close: () => new Promise(resolve => { for (const socket of sockets) socket.destroy(); server.close(resolve); }) };
}
export async function callCompanion(directory, method, params = {}) {
  const endpoint = await readEndpoint(directory);
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(endpoint.pipe); let input = '', bytes = 0;const decoder=new StringDecoder('utf8');
    socket.setTimeout(20000, () => socket.destroy(new Error('The tray companion did not respond.')));
    socket.on('error', reject);
    socket.once('connect', () => socket.write(JSON.stringify({ token: endpoint.token, method, params }) + '\n'));
    socket.on('data', chunk => {
      bytes += chunk.length; if (bytes > MAX_FRAME) { socket.destroy(new Error('Local result is too large.')); return; }
      input += decoder.write(chunk);
      if (!input.includes('\n')) return;
      try { const data = JSON.parse(input.slice(0, input.indexOf('\n'))); socket.destroy(); data.error ? reject(new Error(data.error)) : resolve(data.result); }
      catch (error) { socket.destroy(); reject(error); }
    });
    socket.once('end', () => { if (!input.includes('\n')) reject(new Error('The tray companion closed the request.')); });
  });
}
