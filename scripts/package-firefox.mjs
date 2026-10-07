import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join,resolve} from 'node:path';

const root=fileURLToPath(new URL('../',import.meta.url));
const files=['manifest.json','background.js','popup.html','popup.js'];
function crc32(bytes) {let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
export async function packageExtension(directory=root,{write=true,browser='firefox'}={}) {
  const files=['manifest.json','background.js','popup.html','popup.js'];
  const local=[],central=[];let offset=0;
  for(const file of files) {
    const name=Buffer.from(file),data=await readFile(join(directory,'browser',browser,file)),crc=crc32(data);
    const header=Buffer.alloc(30);header.writeUInt32LE(0x04034b50);header.writeUInt16LE(20,4);header.writeUInt16LE(0x800,6);header.writeUInt16LE(33,12);
    header.writeUInt32LE(crc,14);header.writeUInt32LE(data.length,18);header.writeUInt32LE(data.length,22);header.writeUInt16LE(name.length,26);
    const entry=Buffer.concat([header,name,data]);local.push(entry);
    const index=Buffer.alloc(46);index.writeUInt32LE(0x02014b50);index.writeUInt16LE(20,4);index.writeUInt16LE(20,6);index.writeUInt16LE(0x800,8);index.writeUInt16LE(33,14);
    index.writeUInt32LE(crc,16);index.writeUInt32LE(data.length,20);index.writeUInt32LE(data.length,24);index.writeUInt16LE(name.length,28);index.writeUInt32LE(offset,42);
    central.push(Buffer.concat([index,name]));offset+=entry.length;
  }
  const index=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(index.length,12);end.writeUInt32LE(offset,16);
  const bytes=Buffer.concat([...local,index,end]);if(write)await writeFile(join(directory,'browser',browser==='firefox'?'netKonnect-Service-Insight.xpi':`netKonnect-${browser}-Service-Insight.zip`),bytes);return bytes;
}
export const packageFirefox=(directory,options)=>packageExtension(directory,options);
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){await packageFirefox();console.log('Firefox development add-on packaged (unsigned).');}
