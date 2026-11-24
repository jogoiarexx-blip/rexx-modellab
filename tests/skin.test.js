import test from 'node:test';
import assert from 'node:assert/strict';
import {photoProject} from '../src/automation.js';
import {compress} from '../src/raster.js';
import {autoRig} from '../src/rig.js';
import {computeWeights,poseProject,exportSkinnedGLB,verifySkinnedGLB,hasSkin} from '../src/skin.js';
import {buildScene} from '../src/model.js';
const image=compress({width:100,height:100,data:new Uint8Array(40000).fill(255)});
const points=[[43,5],[57,5],[57,20],[92,20],[92,30],[64,30],[64,90],[52,90],[50,56],[48,90],[36,90],[36,30],[8,30],[8,20],[43,20]];
test('pesos normalizados, sem influência do braço oposto',()=>{
 const p=photoProject({image,points,height:1.8,depth:.25}),rig=autoRig(p,'character');
 const hand=rig.bones.find(b=>b.name==='leftHand').position;
 const {joints,weights}=computeWeights([...hand,...hand],rig);
 assert.deepEqual([...weights.slice(0,4)],[...weights.slice(4,8)]);
 assert.ok(Math.abs(weights.slice(0,4).reduce((a,b)=>a+b,0)-1)<1e-6);
 for(let i=0;i<4;i++)if(weights[i])assert.ok(rig.bones[joints[i]].name.startsWith('left'));
});
test('pose mantém UV, repouso e move braço',()=>{
 const p=photoProject({image,points,height:1.8,depth:.25}),rig=autoRig(p,'character');
 const rest=poseProject(p,rig),posed=poseProject(p,rig,{leftUpperArm:[0,0,-45]});
 const scene=buildScene(p,{textures:false});
 try{
 const src=scene.objects.get('character').geometry.attributes.position.array;
 assert.ok(rest.parts[0].geometry.positions.every((v,i)=>Math.abs(v-src[i])<1e-6));
 }finally{scene.dispose();}
 assert.deepEqual(rest.parts[0].geometry.uv,posed.parts[0].geometry.uv);
 assert.ok(posed.parts[0].geometry.positions.some((v,i)=>Math.abs(v-rest.parts[0].geometry.positions[i])>.05));
 assert.equal(p.parts[0].shape,'profile');
});
test('GLB com skin e textura reimporta no Three.js',async()=>{
 const p=photoProject({image,points,height:1.8,depth:.25}),rig=autoRig(p,'character');
 const {buffer,report}=await exportSkinnedGLB(p,rig);
 assert.ok(hasSkin(buffer));assert.equal(report.bones,26);assert.ok(report.maxRestError<1e-4);
 assert.equal((await verifySkinnedGLB(buffer)).profile,'skinned-pbr');
});
