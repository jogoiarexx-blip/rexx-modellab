import test from 'node:test';
import assert from 'node:assert/strict';
import {photoProject} from '../src/automation.js';
import {compress} from '../src/raster.js';
import {refineCharacter} from '../src/refine.js';
import {autoRig} from '../src/rig.js';
import {buildHandMesh,gripPose,FINGER_REFERENCE} from '../src/hand-mesh.js';
import {computeWeights,poseProject,exportSkinnedGLB} from '../src/skin.js';
const image=compress({width:100,height:100,data:new Uint8Array(40000).fill(255)});
const points=[[43,5],[57,5],[57,20],[92,20],[92,30],[64,30],[64,90],[52,90],[50,56],[48,90],[36,90],[36,30],[8,30],[8,20],[43,20]];
const source=()=>refineCharacter(photoProject({image,points,height:1.8,depth:.25}),'character');
test('reference measured chains and grip pose symmetry',()=>{
 const p=source(),rig=autoRig(p,'character',{hands:'detailed'}),pose=gripPose(rig,.8);
 assert.equal(Object.keys(pose).length,30);
 assert.equal(pose.leftHandIndex1[2],-pose.rightHandIndex1[2]);
 assert.ok(FINGER_REFERENCE.Pinky[0]<FINGER_REFERENCE.Middle[0]);
 assert.throws(()=>gripPose(autoRig(p,'character')));
 assert.throws(()=>gripPose(rig,2));
});
test('ten digit tubes have closed indexed geometry and original source is preserved',()=>{
 const p=source(),rig=autoRig(p,'character',{hands:'detailed'}),snapshot=JSON.stringify(p);
 const {project,report}=buildHandMesh(p,rig,{segments:8});
 const g=project.parts[0].geometry;
 assert.equal(JSON.stringify(p),snapshot);assert.equal(report.digits,10);
 assert.equal(g.uv.length,g.positions.length/3*2);
 for(const hand of report.details)for(const d of hand.digits){
  const edges=new Map();
  for(let i=0;i<g.indices.length;i+=3){
   const tri=g.indices.slice(i,i+3);
   if(tri.some(j=>j<d.first||j>=d.first+d.vertices))continue;
   for(let k=0;k<3;k++){const key=[tri[k],tri[(k+1)%3]].sort((a,b)=>a-b).join('/');edges.set(key,(edges.get(key)??0)+1);}
  }
  assert.ok(edges.size>0&&[...edges.values()].every(n=>n===2));
 }
 assert.throws(()=>buildHandMesh(p,autoRig(p,'character')));
});
test('grip deforms the mesh and preserves UV; GLB skin retains 66 joints',async()=>{
 const p=source(),rig=autoRig(p,'character',{hands:'detailed'}),{project}=buildHandMesh(p,rig,{segments:8});
 const rest=poseProject(project,rig),pose=poseProject(project,rig,gripPose(rig,.75));
 assert.deepEqual(rest.parts[0].geometry.uv,pose.parts[0].geometry.uv);
 assert.ok(pose.parts[0].geometry.positions.some((v,i)=>Math.abs(v-rest.parts[0].geometry.positions[i])>.003));
 const {report}=await exportSkinnedGLB(project,rig);assert.equal(report.bones,66);assert.ok(report.maxRestError<1e-4);
});
