import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32 } from 'node:zlib';
import { verifyInstaller } from '../scripts/verify-installer.mjs';

async function fixture(t){
  const directory=await mkdtemp(join(tmpdir(),'nk-installer-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  const path=join(directory,'setup.exe'),bytes=Buffer.alloc(2*1024*1024+57,0x61),header=1024;
  bytes.writeUInt32LE(0,header);
  Buffer.from('efbeadde4e756c6c736f6674496e7374','hex').copy(bytes,header+4);
  bytes.writeUInt32LE(128,header+20);bytes.writeUInt32LE(bytes.length-header,header+24);
  bytes.writeUInt32LE(crc32(bytes.subarray(512,-4)),bytes.length-4);
  return {path,bytes};
}
test('installer gate follows NSIS CRC boundaries across chunks and ignores appended signing data',async t=>{
  const {path,bytes}=await fixture(t);bytes[40]^=1;
  await writeFile(path,bytes);const result=await verifyInstaller(path);assert.equal(result.header,1024);
  await writeFile(path,Buffer.concat([bytes,Buffer.from('appended signing data')]));
  assert.equal((await verifyInstaller(path)).crc,result.crc);
});
test('installer gate rejects changed stub, payload, checksum and truncated download',async t=>{
  const {path,bytes}=await fixture(t);
  for(const offset of [600,1500000,bytes.length-1]){
    const changed=Buffer.from(bytes);changed[offset]^=1;await writeFile(path,changed);
    await assert.rejects(verifyInstaller(path),/integrity check failed/);
  }
  await writeFile(path,bytes.subarray(0,-1));await assert.rejects(verifyInstaller(path),/truncated/);
});
test('installer gate rejects absent headers and disabled integrity checking',async t=>{
  const {path,bytes}=await fixture(t);
  bytes.writeUInt32LE(4,1024);await writeFile(path,bytes);await assert.rejects(verifyInstaller(path),/disabled/);
  await writeFile(path,Buffer.alloc(2048));await assert.rejects(verifyInstaller(path),/header is missing/);
});
