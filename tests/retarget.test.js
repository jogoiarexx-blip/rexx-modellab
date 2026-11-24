import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMotionFBX} from '../cli/fbx-motion.js';
import {retargetMotion,sourceBoneName} from '../src/retarget.js';
import {photoProject} from '../src/automation.js';
import {compress} from '../src/raster.js';
import {autoRig} from '../src/rig.js';
import {exportAnimationClips} from '../src/animation.js';
const image=compress({width:100,height:100,data:new Uint8Array(40000).fill(255)});
const points=[[43,5],[57,5],[57,20],[92,20],[92,30],[64,30],[64,90],[52,90],[50,56],[48,90],[36,90],[36,30],[8,30],[8,20],[43,20]];
const source=()=>photoProject({image,points,height:1.8,depth:.25});
const reverse={hips:'Hips',spine:'Spine',chest:'Spine2',neck:'Neck',head:'Head',headEnd:'HeadTop_End'};
for(const s of ['left','right'])for(const [a,b] of Object.entries({Shoulder:'Shoulder',UpperArm:'Arm',LowerArm:'ForeArm',Hand:'Hand',UpperLeg:'UpLeg',LowerLeg:'Leg',Foot:'Foot',Toes:'ToeBase',ToeEnd:'Toe_End'}))reverse[s+a]=s[0].toUpperCase()+s.slice(1)+b;
function fixture(rig){
 const nodes=rig.bones.filter(b=>reverse[b.name]).map(b=>{
  const parent=rig.bones.find(x=>x.name===b.parent);
  const t=b.position.map((v,i)=>v-(parent?.position[i]??0));
  const matrix=[1,0,0,0,0,1,0,0,0,0,1,0,...b.position,1];
  return {id:b.name,name:'mixamorig:'+reverse[b.name],parent:b.parent,translation:t,rotation:[0,0,0],pre:[0,0,0],post:[0,0,0],order:0,bind:matrix,tracks:b.name==='leftUpperLeg'?{rotation:{X:{times:[0,30],values:[0,30]}}}:{}};
 });
 return {name:'Running',duration:1,start:0,ticksPerSecond:30,nodes};
}
test('mapping Mixamo and unsupported FBX rejection',()=>{
 assert.equal(sourceBoneName('mixamorig:LeftForeArm'),'leftLowerArm');
 assert.equal(sourceBoneName('mixamorig:Spine2'),'chest');
 assert.equal(sourceBoneName('mixamorig:RightHandPinky2'),'rightHandPinky2');
 assert.equal(sourceBoneName('Bone_024'),null);
 assert.throws(()=>parseMotionFBX(Buffer.alloc(50)));
});
test('retarget preserves T rest and moves leg; custom clip exports',async()=>{
 const p=source(),rig=autoRig(p,'character'),{report,...clip}=retargetMotion(fixture(rig),rig,{fps:10});
 assert.equal(clip.frames.length,11);assert.equal(clip.frames.at(-1).time,1);
 assert.ok(report.alignedSegments>=12);assert.ok(report.bindCalibrated>=12);
 assert.ok(Math.abs(clip.frames[0].pose.leftUpperLeg[0])<1e-6);
 assert.ok(Math.abs(clip.frames.at(-1).pose.leftUpperLeg[0]-30)<1e-5);
 const {report:built}=await exportAnimationClips(p,rig,[clip]);assert.equal(built.animations[0].name,'Running');assert.equal(built.bones,26);
});
test('custom clips reject unknown joints or non-monotone times',async()=>{
 const p=source(),rig=autoRig(p,'character');
 await assert.rejects(exportAnimationClips(p,rig,[{name:'bad',loop:true,frames:[{time:0,pose:{}},{time:0,pose:{}}]}]));
 await assert.rejects(exportAnimationClips(p,rig,[{name:'bad',loop:true,frames:[{time:0,pose:{}},{time:1,pose:{unknown:[0,0,0]}}]}]));
});
