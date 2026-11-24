import test from 'node:test';
import assert from 'node:assert/strict';
import {anatomicalSection,rearTone} from '../src/human-volume.js';
import {characterGeometry} from '../src/character.js';
import {photoProject} from '../src/automation.js';
import {prepareCharacter} from '../src/character-pipeline.js';
import {compress} from '../src/raster.js';
import {renderViews} from '../src/render.js';
import {exportAnimatedGLB} from '../src/animation.js';
const outline=[[59,7],[76,7],[78,24],[87,29],[119,31],[119,40],[85,39],[80,68],[84,101],[85,134],[73,134],[67,79],[60,134],[47,134],[51,96],[53,69],[49,39],[14,40],[14,31],[48,29],[59,24]];
test('volumes anterior e posterior distintos e limitados',()=>{
 const at=(row,x)=>anatomicalSection({row,x,arm:0,legX:0,curve:1});
 assert.ok(at(.29,.51).back>at(.29,0).back);
 assert.ok(at(.45,0).back<at(.29,.51).back);
 assert.ok(at(.82,.5).back>at(.74,.5).back);
 assert.notEqual(at(.29,.51).front,at(.29,.51).back);
 for(let row=0;row<=1;row+=.01)for(let x=-3;x<=3;x+=.2){
  const s=at(row,x);assert.ok(Object.values(s).every(Number.isFinite));assert.ok(s.front>=.58&&s.back<=1.55);
 }
 assert.ok(rearTone({row:.35,across:.5,armWeight:0,leg:0,head:0})<1);
});
test('malha mantém contorno sem simetria frontal/traseira forçada',()=>{
 const g=characterGeometry(outline,[1.45,1.75,.27]),p=g.attributes.position,n=p.count/2;
 let asym=0;
 for(let i=0;i<n;i++){
  assert.equal(p.getX(i),p.getX(i+n));assert.equal(p.getY(i),p.getY(i+n));
  if(Math.abs(p.getZ(i)+p.getZ(i+n))>.004)asym++;
 }
 assert.ok(asym>n*.03);g.dispose();
});
test('foto cria dez dedos, prévias e GLB animado',async()=>{
 const image=compress({width:136,height:146,data:new Uint8Array(136*146*4).fill(180)});
 const p=photoProject({image,points:outline,height:1.75,depth:.27});
 const r=prepareCharacter(p,{animations:['idle'],levels:['lod0']});
 assert.equal(r.rig.bones.length,66);assert.equal(r.report.stages.find(s=>s.stage==='hands').report.digits,10);
 assert.equal(r.report.stages[0].volumeModel,'anatomical-front-back-v2');
 const views=renderViews(r.project,{size:128,views:['front','back','left','iso']});
 assert.equal(Object.keys(views.images).length,4);
 const {report}=await exportAnimatedGLB(r.project,r.rig,['idle']);assert.equal(report.bones,66);
});
