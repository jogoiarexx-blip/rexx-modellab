// REXX-TRAIN-07 — world-space direction alignment for translation-only ModelLab rest rig.
import {Quaternion,Euler,Vector3,Matrix4,MathUtils} from '../vendor/engine.mjs';
import {validateRig} from './rig.js';
import {mixamoAlias} from './hand-rig.js';
const aliases={Hips:'hips',Spine:'spine',Spine2:'chest',Neck:'neck',Head:'head',HeadTop_End:'headEnd'};
for(const side of ['Left','Right'])for(const [a,b] of Object.entries({Shoulder:'Shoulder',Arm:'UpperArm',ForeArm:'LowerArm',Hand:'Hand',UpLeg:'UpperLeg',Leg:'LowerLeg',Foot:'Foot',ToeBase:'Toes',Toe_End:'ToeEnd'}))aliases[side+a]=side.toLowerCase()+b;
export function sourceBoneName(name){
 return mixamoAlias(name)??aliases[String(name).replace(/^mixamorig[:_]/,'')]??null;
}
const orders=['ZYX','YZX','XZY','ZXY','YXZ','XYZ'];
const qEuler=(a,order=0)=>{
 if(!orders[order])throw Error('Ordem Euler FBX não suportada.');
 return new Quaternion().setFromEuler(new Euler(...a.map(MathUtils.degToRad),orders[order]));
};
const v3=a=>new Vector3(...a);
function sample(c,t,fallback){
 if(!c)return fallback;
 const {times,values}=c;
 if(t<=times[0])return values[0];if(t>=times.at(-1))return values.at(-1);
 let lo=0,hi=times.length-1;
 while(hi-lo>1){const m=(lo+hi)>>1;if(times[m]<=t)lo=m;else hi=m;}
 return values[lo]+(values[hi]-values[lo])*(t-times[lo])/(times[hi]-times[lo]);
}
const vecAt=(n,k,t)=>n[k].map((v,i)=>sample(n.tracks?.[k]?.['XYZ'[i]],t,v));
function direction(a,b){const d=b.clone().sub(a);return d.lengthSq()>1e-12?d.normalize():null;}
function rotationFromBind(m){return new Quaternion().setFromRotationMatrix(new Matrix4().fromArray(m).extractRotation(new Matrix4().fromArray(m))).normalize();}
const bindPos=m=>new Vector3(m[12],m[13],m[14]);
export function retargetMotion(motion,rig,{fps=30,name,loop=true,yaw=0}={}){
 validateRig(rig);
 if(!Number.isInteger(fps)||fps<10||fps>60||!Number.isFinite(yaw)||Math.abs(yaw)>180||typeof loop!=='boolean')throw Error('Opções de retarget inválidas.');
 if(!motion||!Array.isArray(motion.nodes)||!Number.isFinite(motion.duration)||motion.duration<=0||motion.duration>60)throw Error('Motion inválido.');
 const src=new Map(motion.nodes.map(n=>[n.id,n])),mapped=new Map();
 for(const n of motion.nodes){const alias=sourceBoneName(n.name);if(alias){if(mapped.has(alias))throw Error('Nome de osso ambíguo: '+alias);mapped.set(alias,n);}}
 if(!['hips','spine','chest','leftUpperArm','rightUpperArm','leftUpperLeg','rightUpperLeg'].every(n=>mapped.has(n)))throw Error('Rig Mixamo incompleto.');
 const target=new Map(rig.bones.map(b=>[b.name,b])),basis=qEuler([0,yaw,0]);
 const primary={hips:'spine',spine:'chest',chest:'neck',neck:'head',head:'headEnd'};
 for(const side of ['left','right'])for(const [a,b] of Object.entries({Shoulder:'UpperArm',UpperArm:'LowerArm',LowerArm:'Hand',UpperLeg:'LowerLeg',LowerLeg:'Foot',Foot:'Toes',Toes:'ToeEnd',Hand:'HandMiddle1'}))primary[side+a]=side+b;
 for(const b of rig.bones)if(/Hand(?:Thumb|Index|Middle|Ring|Pinky)[1-3]$/.test(b.name))primary[b.name]=b.name.slice(0,-1)+(Number(b.name.at(-1))+1);
 const aligned=rig.bones.filter(b=>mapped.has(b.name)&&mapped.has(primary[b.name])&&target.has(primary[b.name]));
 if(aligned.length<12)throw Error('Poucos segmentos mapeados.');
 const rest=new Map();
 for(const b of aligned){
  const n=mapped.get(b.name),c=mapped.get(primary[b.name]),t=target.get(primary[b.name]);
  if(!n.bind||!c.bind)continue;
  const a=direction(v3(b.position),v3(t.position)),d=direction(bindPos(n.bind),bindPos(c.bind));
  if(a&&d)rest.set(b.name,{a,d,q:rotationFromBind(n.bind)});
 }
 function worldAt(t){
  const cache=new Map(),visiting=new Set();
  function get(n){
   if(cache.has(n.id))return cache.get(n.id);
   if(visiting.has(n.id))throw Error('Ciclo FBX.');visiting.add(n.id);
   const parent=src.get(n.parent),p=parent?get(parent):{q:new Quaternion(),p:new Vector3()};
   const local=qEuler(n.pre??[0,0,0]).multiply(qEuler(vecAt(n,'rotation',t),n.order)).multiply(qEuler(n.post??[0,0,0]).invert());
   const q=p.q.clone().multiply(local).normalize(),pos=v3(vecAt(n,'translation',t)).applyQuaternion(p.q).add(p.p);
   const value={q,p:pos};cache.set(n.id,value);visiting.delete(n.id);return value;
  }
  for(const n of motion.nodes)get(n);return cache;
 }
 const count=Math.ceil(motion.duration*fps),frames=[];
 for(let i=0;i<=count;i++){
  const time=i===count?motion.duration:i/fps,t=motion.start+time*motion.ticksPerSecond,world=worldAt(t),global=new Map(),pose={};
  for(const b of rig.bones){
   const parent=global.get(b.parent)??new Quaternion(),n=mapped.get(b.name),child=mapped.get(primary[b.name]),dst=target.get(primary[b.name]);
   let q=parent.clone();
   if(n&&child&&dst){
    const cur=world.get(n.id),a=direction(v3(b.position),v3(dst.position)),d=direction(cur.p,world.get(child.id).p);
    if(a&&d){
     const ref=rest.get(b.name);
     if(ref){
      const delta=cur.q.clone().multiply(ref.q.clone().invert()),base=new Quaternion().setFromUnitVectors(a,ref.d.clone().applyQuaternion(basis));
      q=basis.clone().multiply(delta).multiply(basis.clone().invert()).multiply(base).normalize();
      // Align the resulting direction even if translations or bind orientation differ.
      const aim=a.clone().applyQuaternion(q),desired=d.clone().applyQuaternion(basis);
      q.premultiply(new Quaternion().setFromUnitVectors(aim,desired)).normalize();
     }else q.setFromUnitVectors(a,d.applyQuaternion(basis));
    }
   }
   global.set(b.name,q);
   const local=parent.clone().invert().multiply(q).normalize(),e=new Euler().setFromQuaternion(local);
   pose[b.name]=[e.x,e.y,e.z].map(MathUtils.radToDeg);
  }
  frames.push({time,pose});
 }
 return {name:name??motion.name,loop,frames,report:{source:motion.name,duration:motion.duration,frames:frames.length,mappedBones:rig.bones.filter(b=>mapped.has(b.name)).length,alignedSegments:aligned.length,bindCalibrated:rest.size,unmappedBones:rig.bones.filter(b=>!mapped.has(b.name)).map(b=>b.name),warnings:['Rotação em espaço global, alinhamento de segmentos; torção sem referência é aproximada.','Root motion e translações de animação não são exportados; comprimentos do rig destino são preservados.','Revisão visual e calibração de eixos são necessárias.']}};
}
