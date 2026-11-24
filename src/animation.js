// Biblioteca procedural de movimentos in-place para o rig ModelLab.
import {Euler,Quaternion,MathUtils} from '../vendor/engine.mjs';
import {validateRig} from './rig.js';
import {exportSkinnedGLB,verifySkinnedGLB,unpackGLB,packGLB,previewPose} from './skin.js';
const base={leftUpperArm:[0,0,-78],rightUpperArm:[0,0,78],leftLowerArm:[0,-8,0],rightLowerArm:[0,8,0]};
const pose=(extra={})=>({...structuredClone(base),...extra});
const f=(time,extra)=>({time,pose:pose(extra)});
const cycle=(duration,amplitude,knee,bend)=>Array.from({length:9},(_,i)=>{
  const t=i/8,a=i===8?0:Math.sin(t*Math.PI*2),b=-a;
  return f(t*duration,{leftUpperArm:[-amplitude*a,0,-72],rightUpperArm:[-amplitude*b,0,72],leftLowerArm:[0,-bend,0],rightLowerArm:[0,bend,0],leftUpperLeg:[amplitude*a,0,0],rightUpperLeg:[amplitude*b,0,0],leftLowerLeg:[knee*Math.max(0,-a),0,0],rightLowerLeg:[knee*Math.max(0,-b),0,0],chest:[0,a*5,0]});
});
const library={
 idle:{loop:true,frames:[f(0),f(.75,{chest:[2,0,0],head:[-2,0,0],leftUpperArm:[0,0,-75],rightUpperArm:[0,0,75]}),f(1.5)]},
 walk:{loop:true,frames:cycle(1.1,30,48,18)},
 run:{loop:true,frames:cycle(.72,52,75,70)},
 jump:{loop:false,frames:[f(0),f(.18,{leftUpperLeg:[-30,0,0],rightUpperLeg:[-30,0,0],leftLowerLeg:[60,0,0],rightLowerLeg:[60,0,0],chest:[16,0,0]}),f(.38,{leftUpperArm:[-30,0,-35],rightUpperArm:[-30,0,35],leftUpperLeg:[-20,0,0],rightUpperLeg:[-20,0,0],leftLowerLeg:[35,0,0],rightLowerLeg:[35,0,0]}),f(.65,{leftUpperLeg:[-20,0,0],rightUpperLeg:[-20,0,0],leftLowerLeg:[40,0,0],rightLowerLeg:[40,0,0]}),f(.85)]},
 crouch:{loop:true,frames:[f(0,{leftUpperLeg:[-45,0,0],rightUpperLeg:[-45,0,0],leftLowerLeg:[90,0,0],rightLowerLeg:[90,0,0],chest:[22,0,0]}),f(1,{leftUpperLeg:[-45,0,0],rightUpperLeg:[-45,0,0],leftLowerLeg:[90,0,0],rightLowerLeg:[90,0,0],chest:[22,0,0]})]},
 attack:{loop:false,frames:[f(0),f(.18,{chest:[0,-25,0],rightUpperArm:[0,0,35],rightLowerArm:[0,65,0]}),f(.35,{chest:[0,28,0],rightUpperArm:[0,65,25],rightLowerArm:[0,12,0]}),f(.7)]},
 hit:{loop:false,frames:[f(0),f(.12,{chest:[-20,12,0],head:[-15,0,0],leftUpperArm:[0,0,-55],rightUpperArm:[0,0,55]}),f(.5)]},
 death:{loop:false,frames:[f(0),f(.35,{hips:[-25,0,0],leftLowerLeg:[35,0,0],rightLowerLeg:[35,0,0]}),f(.95,{hips:[-90,0,0],leftUpperArm:[0,0,-45],rightUpperArm:[0,0,45],leftLowerLeg:[15,0,0],rightLowerLeg:[15,0,0]})]},
 aim:{loop:true,frames:[f(0,{leftUpperArm:[0,-72,-12],rightUpperArm:[0,72,12],leftLowerArm:[0,-12,0],rightLowerArm:[0,12,0]}),f(1,{leftUpperArm:[0,-72,-12],rightUpperArm:[0,72,12],leftLowerArm:[0,-12,0],rightLowerArm:[0,12,0]})]}
};
export const animationNames=()=>Object.keys(library);
export function getClip(name){
  if(!Object.hasOwn(library,name))throw Error('Animação desconhecida: '+name);
  return {name,...structuredClone(library[name])};
}
const quat=r=>new Quaternion().setFromEuler(new Euler(...r.map(MathUtils.degToRad)));
export function samplePose(name,time){
  const c=getClip(name),d=c.frames.at(-1).time;
  if(!Number.isFinite(time))throw Error('Tempo inválido.');
  time=c.loop?((time%d)+d)%d:Math.min(d,Math.max(0,time));
  const hi=c.frames.findIndex(f=>f.time>=time);
  if(hi<=0)return structuredClone(c.frames[0].pose);
  const a=c.frames[hi-1],b=c.frames[hi],t=(time-a.time)/(b.time-a.time);
  const result={};
  for(const key of new Set([...Object.keys(a.pose),...Object.keys(b.pose)])){
    const q=quat(a.pose[key]??[0,0,0]).slerp(quat(b.pose[key]??[0,0,0]),t);
    const e=new Euler().setFromQuaternion(q);
    result[key]=[e.x,e.y,e.z].map(MathUtils.radToDeg);
  }
  return result;
}
export function blendPoses(a,b,t){
  if(!Number.isFinite(t)||t<0||t>1)throw Error('Mistura deve estar entre 0 e 1.');
  const result={};
  for(const key of new Set([...Object.keys(a),...Object.keys(b)])){
    const q=quat(a[key]??[0,0,0]).slerp(quat(b[key]??[0,0,0]),t),e=new Euler().setFromQuaternion(q);
    result[key]=[e.x,e.y,e.z].map(MathUtils.radToDeg);
  }
  return result;
}
export function previewAnimation(project,rig,name,time,options){return previewPose(project,rig,samplePose(name,time),options);}
export async function exportAnimatedGLB(project,rig,names=animationNames()){
  return exportAnimationClips(project,rig,names.map(getClip));
}
export async function exportAnimationClips(project,rig,clips){
  validateRig(rig);
  if(!Array.isArray(clips)||!clips.length||clips.length>32||new Set(clips.map(c=>c.name)).size!==clips.length)throw Error('Lista de animações inválida.');
  const names=new Set(rig.bones.map(b=>b.name));
  for(const c of clips){if(typeof c.name!=='string'||!c.name.trim()||c.name.length>120||typeof c.loop!=='boolean'||!Array.isArray(c.frames)||c.frames.length<2||c.frames.length>3601||c.frames[0].time!==0)throw Error('Clipe inválido.');
    for(let i=0;i<c.frames.length;i++){const f=c.frames[i];if(!Number.isFinite(f.time)||f.time>60||(i&&f.time<=c.frames[i-1].time)||!f.pose||typeof f.pose!=='object')throw Error('Quadro inválido.');
      for(const [k,v] of Object.entries(f.pose))if(!names.has(k)||!Array.isArray(v)||v.length!==3||!v.every(x=>Number.isFinite(x)&&Math.abs(x)<=360))throw Error('Rotação de clipe inválida: '+k);
    }
  }
  const base=await exportSkinnedGLB(project,rig),{json:j,bin}=unpackGLB(base.buffer);
  const boneIds=new Map(rig.bones.map((b,i)=>[b.name,j.skins[0].joints[i]]));
  const chunks=[bin];let length=bin.length;
  function append(values,type){
    const pad=(4-length%4)%4;if(pad){chunks.push(new Uint8Array(pad));length+=pad;}
    const bytes=new Uint8Array(values.length*4),dv=new DataView(bytes.buffer);
    values.forEach((v,i)=>dv.setFloat32(i*4,v,true));
    const view=j.bufferViews.push({buffer:0,byteOffset:length,byteLength:bytes.length})-1;chunks.push(bytes);length+=bytes.length;
    const acc={bufferView:view,componentType:5126,count:values.length/(type==='SCALAR'?1:4),type};
    if(type==='SCALAR'){acc.min=[values[0]];acc.max=[values.at(-1)];}
    return j.accessors.push(acc)-1;
  }
  j.animations=clips.map(c=>{
    const input=append(c.frames.map(f=>f.time),'SCALAR'),samplers=[],channels=[];
    // Todos os ossos recebem uma trilha: evita herdar a pose da animação anterior.
    for(const [name,node] of boneIds){
      let previous=null;const values=[];
      for(const frame of c.frames){
        const q=quat(frame.pose[name]??[0,0,0]).toArray();
        if(previous&&q.reduce((sum,v,i)=>sum+v*previous[i],0)<0)for(let i=0;i<4;i++)q[i]*=-1;
        values.push(...q);previous=q;
      }
      const output=append(values,'VEC4'),sampler=samplers.push({input,output,interpolation:'LINEAR'})-1;
      channels.push({sampler,target:{node,path:'rotation'}});
    }
    return {name:c.name,samplers,channels,extras:{loop:c.loop,inPlace:true}};
  });
  j.buffers[0].byteLength=length;
  const merged=new Uint8Array(length);let offset=0;for(const c of chunks){merged.set(c,offset);offset+=c.length;}
  const buffer=packGLB(j,merged),report=await verifySkinnedGLB(buffer);
  return {buffer,report:{...report,clips:clips.map(c=>({name:c.name,loop:c.loop,duration:c.frames.at(-1).time})),weightStats:base.report.weightStats,warnings:base.report.warnings}};
}
