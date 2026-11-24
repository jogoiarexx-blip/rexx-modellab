import test from 'node:test';
import assert from 'node:assert/strict';
import {photoProject} from '../src/automation.js';
import {compress} from '../src/raster.js';
import {refineCharacter} from '../src/refine.js';
import {trainClothing} from '../src/clothing-training.js';
import {autoRig} from '../src/rig.js';
import {exportAnimatedGLB} from '../src/animation.js';
const points=[[43,5],[57,5],[57,20],[92,20],[92,30],[64,30],[64,90],[52,90],[50,56],[48,90],[36,90],[36,30],[8,30],[8,20],[43,20]];
const make=()=>photoProject({image:compress({width:100,height:100,data:new Uint8Array(40000).fill(220)}),points,height:1.8,depth:.25});
test('roupa mantém UV, índices, cabeça, costuras e receita original',()=>{
 const src=make(),before=JSON.stringify(src),base=refineCharacter(src,'character').parts[0].geometry;
 const r=trainClothing(src,'character',{style:'suit',strength:1,tint:'#303040'}),g=r.project.parts[0].geometry;
 assert.equal(JSON.stringify(src),before);assert.deepEqual(g.uv,base.uv);assert.deepEqual(g.indices,base.indices);
 assert.ok(r.report.affectedVertices>0);assert.ok(r.report.maxDisplacementMeters>0&&r.report.maxDisplacementMeters<.04);
 const n=g.positions.length/6;
 for(let i=0;i<n;i++){
  const a=i*3,b=(n+i)*3;
  assert.equal(g.positions[a],base.positions[a]);assert.equal(g.positions[a+1],base.positions[a+1]);
  if(g.uv[i*2+1]<.08||Math.abs(base.positions[a+2]-base.positions[b+2])<=1e-7){assert.equal(g.positions[a+2],base.positions[a+2]);assert.equal(g.positions[b+2],base.positions[b+2]);}
 }
 assert.throws(()=>trainClothing(src,'character',{style:'invalid'}));
 const zero=trainClothing(src,'character',{strength:0});
 assert.deepEqual(zero.project.parts[0].geometry.positions,base.positions);
});
test('roupa procedural exporta com o rig e animações',async()=>{
 const src=make(),rig=autoRig(src,'character');
 const {project}=trainClothing(src,'character',{style:'armor'});
 const {report}=await exportAnimatedGLB(project,rig,['idle','walk']);
 assert.equal(report.animations.length,2);assert.equal(report.bones,26);
});
