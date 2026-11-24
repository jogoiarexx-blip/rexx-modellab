import test from 'node:test';
import assert from 'node:assert/strict';
import decode from '../vendor/jpeg/decoder.mjs';
import encode from '../vendor/jpeg/encoder.mjs';
import {compress,pixels} from '../src/raster.js';
test('native browser-compatible JPEG modules roundtrip without CommonJS',()=>{
 const data=new Uint8Array(16*16*4).fill(255);
 const b=encode({width:16,height:16,data},90).data;
 const a=decode(b,{useTArray:true});assert.equal(a.width,16);assert.equal(a.height,16);
 assert.equal(pixels(compress({width:16,height:16,data})).data.length,1024);
});
