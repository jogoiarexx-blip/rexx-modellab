import test from 'node:test';
import assert from 'node:assert/strict';
import {photoProject} from '../src/automation.js';
import {compress} from '../src/raster.js';
import {prepareCharacter,buildCharacterPackage,characterPackageEntries} from '../src/character-pipeline.js';
const image=compress({width:100,height:100,data:new Uint8Array(40000).fill(255)});
const points=[[43,5],[57,5],[57,20],[92,20],[92,30],[64,30],[64,90],[52,90],[50,56],[48,90],[36,90],[36,30],[8,30],[8,20],[43,20]];
const source=()=>photoProject({image,points,height:1.8,depth:.25});
test('integrated profile, clothing, face and detailed hands preserve source',()=>{
 const p=source(),before=JSON.stringify(p);
 const r=prepareCharacter(p,{clothing:{style:'field'},handMesh:{segments:8},animations:['idle','run'],levels:['lod2']});
 assert.equal(JSON.stringify(p),before);assert.equal(r.project.parts[0].shape,'mesh');
 assert.equal(r.rig.bones.length,66);assert.equal(r.report.stages.find(s=>s.stage==='hands').report.digits,10);
 assert.equal(r.clips.length,2);assert.equal(Object.keys(r.grip).length,30);
 assert.throws(()=>prepareCharacter(p,{hands:'basic',handMesh:{}}));
});
test('complete mobile package contains measured animated GLB and manifest',async()=>{
 const r=await buildCharacterPackage(source(),{hands:'basic',refine:{face:null},animations:['run'],levels:['lod2']});
 assert.equal(r.files.length,1);assert.equal(r.manifest.bones,26);
 assert.deepEqual(r.manifest.levels[0].clips,['run']);
 assert.equal(r.manifest.levels[0].bytes,r.files[0].buffer.byteLength);
 const entries=characterPackageEntries(r);
 assert.equal(entries.at(-1).file,'manifest.json');
 assert.ok(entries.some(e=>e.file==='character.rig.json'));
 assert.ok(entries.some(e=>e.file==='lod2.glb'));
 assert.ok(!entries.some(e=>e.file==='grip.pose.json'));
});
