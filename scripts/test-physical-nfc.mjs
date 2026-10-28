// Test doubles exist only in this Node test runner; none is reachable in the app.
import {build} from 'esbuild';
import {mkdir,rm} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const memory=new Map();
let failStorage=false;
globalThis.localStorage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>{if(failStorage)throw new DOMException('Full','QuotaExceededError');memory.set(k,v)},removeItem:k=>memory.delete(k)};
globalThis.window={localStorage:globalThis.localStorage};
globalThis.failNfcTestStorage=value=>{failStorage=value};
const folder=resolve('.physical-nfc-test');
await mkdir(folder,{recursive:true});
try{
 await build({entryPoints:['tests/physical-nfc.test.ts'],outfile:resolve(folder,'suite.mjs'),bundle:true,platform:'node',format:'esm',packages:'external'});
 await import(pathToFileURL(resolve(folder,'suite.mjs')).href);
}finally{await rm(folder,{recursive:true,force:true})}
