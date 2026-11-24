import test from 'node:test';
import assert from 'node:assert/strict';
import {createCreature,creatureSpecies} from '../src/creature-training.js';
import {buildScene,metrics} from '../src/model.js';
import {exportGLB} from '../src/format.js';
import {compress} from '../src/raster.js';
test('cinco criaturas válidas, patas e caudas, orçamento geométrico',()=>{
 for(const species of creatureSpecies()){
  const {project,report}=createCreature({species});
  assert.equal(report.species,species);assert.equal(project.parts.filter(p=>p.id.endsWith('-leg')).length,4);
  assert.ok(project.parts.some(p=>p.id==='tail'));
  assert.equal(project.parts.some(p=>p.id==='left-wing'),species==='dragon');
  const s=buildScene(project);try{const m=metrics(s.root);assert.ok(m.triangles>0&&m.triangles<30000);assert.ok(m.dimensions.every(v=>v>0));}finally{s.dispose();}
 }
});
test('calibração lateral e validação de proporções',()=>{
 const image=compress({width:200,height:100,data:new Uint8Array(80000).fill(255)});
 const r=createCreature({species:'dog',height:.8,reference:{image,facing:'right',landmarks:{withers:[110,35],rump:[45,40],muzzle:[160,27],groundY:85}}});
 assert.equal(r.report.calibratedFromSide,true);assert.equal(r.report.torsoLengthMeters,1.04);
 assert.equal(r.project.references[0].width,200);
 assert.throws(()=>createCreature({species:'dog',proportions:{tail:9}}));
});
test('exportação GLB de lobo e dragão',async()=>{
 for(const species of ['wolf','dragon']){
  const {project}=createCreature({species});const {report}=await exportGLB(project);assert.ok(report.ok);assert.ok(report.bytes<2*1024*1024);
 }
});
