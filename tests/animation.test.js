import test from 'node:test';
import assert from 'node:assert/strict';
import {animationNames,getClip,samplePose,blendPoses,exportAnimatedGLB} from '../src/animation.js';
import {photoProject} from '../src/automation.js';
import {compress} from '../src/raster.js';
import {autoRig} from '../src/rig.js';
import {verifySkinnedGLB,unpackGLB} from '../src/skin.js';
test('biblioteca, ciclos e interpolação',()=>{
 assert.equal(animationNames().length,9);
 for(const name of animationNames()){
  const clip=getClip(name),duration=clip.frames.at(-1).time;
  assert.ok(duration>0);assert.ok(Object.values(samplePose(name,duration*.34)).flat().every(Number.isFinite));
  if(clip.loop)assert.deepEqual(samplePose(name,0),samplePose(name,duration));
 }
 assert.ok(Object.values(blendPoses(samplePose('idle',0),samplePose('run',.2),.5)).flat().every(Number.isFinite));
});
test('exporta nove clips de animação no GLB e reimporta',async()=>{
 const image=compress({width:100,height:100,data:new Uint8Array(40000).fill(255)});
 const points=[[43,5],[57,5],[57,20],[92,20],[92,30],[64,30],[64,90],[52,90],[50,56],[48,90],[36,90],[36,30],[8,30],[8,20],[43,20]];
 const p=photoProject({image,points,height:1.8,depth:.25}),rig=autoRig(p,'character');
 const {buffer,report}=await exportAnimatedGLB(p,rig);
 assert.equal(report.animations.length,9);assert.equal(report.bones,26);
 const {json}=unpackGLB(buffer);
 assert.ok(json.animations.every(a=>a.channels.length===26));
 assert.equal((await verifySkinnedGLB(buffer)).animations.length,9);
});
