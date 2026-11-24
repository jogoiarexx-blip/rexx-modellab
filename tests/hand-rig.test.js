import test from 'node:test';
import assert from 'node:assert/strict';
import {photoProject} from '../src/automation.js';
import {compress} from '../src/raster.js';
import {autoRig,validateRig} from '../src/rig.js';
import {computeWeights,exportSkinnedGLB,poseProject} from '../src/skin.js';
import {mixamoAlias,FINGERS} from '../src/hand-rig.js';
const image=compress({width:100,height:100,data:new Uint8Array(40000).fill(255)});
const points=[[43,5],[57,5],[57,20],[92,20],[92,30],[64,30],[64,90],[52,90],[50,56],[48,90],[36,90],[36,30],[8,30],[8,20],[43,20]];
const project=()=>photoProject({image,points,height:1.8,depth:.25});
test('modo básico preservado; modo detalhado gera cinco cadeias em cada mão',()=>{
 const p=project(),basic=autoRig(p,'character'),rig=autoRig(p,'character',{hands:'detailed'});
 assert.equal(basic.bones.length,26);assert.equal(rig.bones.length,66);validateRig(rig);
 for(const s of ['left','right'])for(const f of FINGERS)for(let i=1;i<=4;i++){
  const b=rig.bones.find(b=>b.name===s+'Hand'+f+i);
  assert.equal(b.parent,i===1?s+'Hand':s+'Hand'+f+(i-1));
 }
 assert.equal(mixamoAlias('mixamorig:LeftHandIndex2'),'leftHandIndex2');
 assert.equal(mixamoAlias('mixamorig:RightHandPinky4'),'rightHandPinky4');
 assert.equal(mixamoAlias('Bone_001'),null);
});
test('dedos isolados da mão contrária e antebraço, pesos normalizados',()=>{
 const rig=autoRig(project(),'character',{hands:'detailed'});
 const point=n=>rig.bones.find(b=>b.name===n).position;
 const mid=point('leftHandMiddle3'),arm=point('leftLowerArm');
 const {joints,weights}=computeWeights([...mid,...arm],rig);
 for(let i=0;i<2;i++)assert.ok(Math.abs(weights.slice(i*4,i*4+4).reduce((a,b)=>a+b,0)-1)<1e-6);
 for(let i=0;i<4;i++)if(weights[i]>0)assert.match(rig.bones[joints[i]].name,/^leftHandMiddle/);
 for(let i=4;i<8;i++)if(weights[i]>0)assert.doesNotMatch(rig.bones[joints[i]].name,/Hand(Thumb|Index|Middle|Ring|Pinky)/);
});
test('exportação GLB com 66 ossos e pose de dedo não altera o UV',async()=>{
 const p=project(),rig=autoRig(p,'character',{hands:'detailed'});
 const a=poseProject(p,rig),b=poseProject(p,rig,{leftHandIndex1:[0,0,35]});
 assert.deepEqual(a.parts[0].geometry.uv,b.parts[0].geometry.uv);
 const {report}=await exportSkinnedGLB(p,rig);assert.equal(report.bones,66);assert.ok(report.maxRestError<1e-4);
});
