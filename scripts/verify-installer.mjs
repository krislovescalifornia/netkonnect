import { open } from 'node:fs/promises';
import { crc32 } from 'node:zlib';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Match NSIS 3 loadHeaders, including its 512-byte header alignment and
// exclusion of the first PE sector. A SHA-256 of a broken build is not enough.
// https://github.com/kichik/nsis/blob/v304/Source/exehead/fileform.c
const signature=Buffer.from('efbeadde4e756c6c736f6674496e7374','hex');
export async function verifyInstaller(path) {
  const file=await open(path,'r');
  try {
    const {size}=await file.stat(),sector=Buffer.alloc(512);
    let header=-1,flags=0,length=0;
    for(let offset=512;offset+28<=size;offset+=512){
      const {bytesRead}=await file.read(sector,0,512,offset);
      if(bytesRead<28)break;
      if(!sector.subarray(4,20).equals(signature))continue;
      flags=sector.readUInt32LE(0);
      if(flags&~15)continue;
      header=offset;length=sector.readUInt32LE(24);break;
    }
    if(header<0)throw new Error('NSIS installer header is missing.');
    if((flags&4)&&!(flags&8))throw new Error('NSIS installer integrity checking is disabled.');
    if(length<32||header+length>size)throw new Error('NSIS installer is truncated or has an invalid data length.');
    const crcOffset=header+length-4,buffer=Buffer.alloc(1024*1024);
    let actual=0;
    for(let offset=512;offset<crcOffset;){
      const {bytesRead}=await file.read(buffer,0,Math.min(buffer.length,crcOffset-offset),offset);
      if(!bytesRead)throw new Error('NSIS installer ended while checking integrity.');
      actual=crc32(buffer.subarray(0,bytesRead),actual);offset+=bytesRead;
    }
    const saved=Buffer.alloc(4);
    if((await file.read(saved,0,4,crcOffset)).bytesRead!==4)throw new Error('NSIS installer checksum is missing.');
    const expected=saved.readUInt32LE(0);
    if(actual!==expected)throw new Error(`NSIS installer integrity check failed: stored ${expected.toString(16)}, calculated ${actual.toString(16)}. Rebuild; do not bypass CRC checking.`);
    return {size,header,crc:actual.toString(16).padStart(8,'0')};
  }finally{await file.close();}
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(!process.argv[2])throw new Error('Usage: node scripts/verify-installer.mjs <installer.exe>');
  console.log('INSTALLER_INTEGRITY_VERIFIED '+JSON.stringify(await verifyInstaller(process.argv[2])));
}
