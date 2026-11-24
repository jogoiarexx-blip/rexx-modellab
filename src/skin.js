// Skinning linear de até quatro ossos por vértice; sem alterar UV ou topologia.
import {fingerSegment,fingerGroup,handRegion} from './hand-rig.js';
import * as T from '../vendor/engine.mjs';
import {buildScene,validate,serializeProject,MAX_BYTES,imageMap} from './model.js';
import {validateRig,adjustRig} from './rig.js';
import {exportGLB} from './format.js';
import {jpegURI} from './raster.js';
import {renderViews} from './render.js';
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
const sideOf=n=>n.startsWith('left')?'left':n.startsWith('right')?'right':null;
const limbOf=n=>/Shoulder|Arm|Hand/.test(n)?'arm':/Leg|Foot|Toes|ToeEnd/.test(n)?'leg':'core';
const primary={hips:'spine',spine:'chest',chest:'neck',neck:'head',head:'headEnd'};
for(const s of ['left','right'])for(const [a,b] of [['Shoulder','UpperArm'],['UpperArm','LowerArm'],['LowerArm','Hand'],['Hand','HandEnd'],['UpperLeg','LowerLeg'],['LowerLeg','Foot'],['Foot','Toes'],['Toes','ToeEnd']])primary[s+a]=s+b;
function segmentDistance(p,a,b,full=false){
  const delta=b.map((x,i)=>x-a[i]),q=p.map((x,i)=>x-a[i]),axis=full?[1,1,1]:[1,1,.35];
  const t=clamp(delta.reduce((s,v,i)=>s+v*q[i]*axis[i],0)/Math.max(1e-15,delta.reduce((s,v,i)=>s+v*v*axis[i],0)),0,1);
  return q.reduce((s,v,i)=>s+(v-t*delta[i])**2*axis[i],0);
}
export function computeWeights(positions,rig){
  validateRig(rig);
  if(!ArrayBuffer.isView(positions)&&!Array.isArray(positions))throw Error('Posições inválidas.');
  if(!positions.length||positions.length%3||positions.length>1800000||!positions.every(Number.isFinite))throw Error('Posições inválidas.');
  const map=new Map(rig.bones.map((b,i)=>[b.name,{...b,index:i}]));
  const segments=rig.bones.flatMap((b,i)=>{
    const child=map.get(primary[b.name]??fingerSegment(b.name));return child?[{a:b.position,b:child.position,index:i,name:b.name,side:sideOf(b.name),limb:limbOf(b.name),finger:fingerGroup(b.name)}]:[];
  });
  if(!segments.length)throw Error('Esqueleto humanoide sem segmentos reconhecidos.');
  const hips=map.get('hips'),head=map.get('headEnd'),lu=map.get('leftUpperArm'),ru=map.get('rightUpperArm');
  if(!hips||!head||!lu||!ru)throw Error('Rig humanoide incompleto.');
  const center=hips.position[0],shoulder=Math.min(Math.abs(lu.position[0]-center),Math.abs(ru.position[0]-center));
  const height=Math.max(.01,Math.abs(head.position[1]-hips.position[1])*2),epsilon=(height*.012)**2;
  const joints=new Uint16Array(positions.length/3*4),weights=new Float32Array(joints.length);
  const detailed=segments.some(s=>s.finger);
  let mixed=0,maxInfluences=0;
  for(let i=0;i<positions.length;i+=3){
    const p=[positions[i],positions[i+1],positions[i+2]],x=p[0]-center,side=x>=0?'left':'right';
    const armFar=Math.abs(x)>shoulder+height*.075;
    const legFar=p[1]<hips.position[1]-height*.09;
    const inHand=detailed&&handRegion(p,map.get(side+'Hand'),map.get(side+'HandEnd'));
    let candidates=segments.filter(s=>{
      if(s.side&&s.side!==side)return false;
      if(s.finger&&!inHand)return false;
      if(inHand)return s.name===side+'Hand'||!!s.finger;
      if(armFar)return s.limb==='arm';
      if(legFar)return s.limb==='leg';
      return true;
    });
    if(!candidates.length)candidates=segments;
    let scored=candidates.map(s=>({...s,d:segmentDistance(p,s.a,s.b,inHand)})).sort((a,b)=>a.d-b.d||a.index-b.index);
    if(inHand){
      const closest=scored.find(s=>s.finger);
      if(closest)scored=scored.filter(s=>!s.finger||s.finger===closest.finger);
      const hand=map.get(side+'Hand'),end=map.get(side+'HandEnd');
      const L=Math.hypot(...end.position.map((v,k)=>v-hand.position[k]));
      // Beyond the palm, prioritize the local digit instead of the long hand segment.
      const dir=end.position.map((v,k)=>v-hand.position[k]);
      const progress=p.reduce((sum,v,k)=>sum+(v-hand.position[k])*dir[k],0)/(L*L);
      if(progress>.60&&closest)scored=scored.filter(s=>s.finger);
    }
    const near=scored[0].d;
    const chosen=scored.filter(s=>s.d<=near+(height*(inHand?.025:.11))**2).slice(0,4);
    const raw=chosen.map(s=>1/(s.d+(inHand?epsilon*.04:epsilon))**2),sum=raw.reduce((a,b)=>a+b,0),offset=i/3*4;
    for(let k=0;k<chosen.length;k++){joints[offset+k]=chosen[k].index;weights[offset+k]=raw[k]/sum;}
    if(chosen.length>1)mixed++;maxInfluences=Math.max(maxInfluences,chosen.length);
  }
  return {joints,weights,report:{vertices:positions.length/3,mixedVertices:mixed,maxInfluences}};
}
export function unpackGLB(buffer){
  const v=new DataView(buffer);
  if(buffer.byteLength<28||v.getUint32(0,true)!==0x46546c67||v.getUint32(4,true)!==2||v.getUint32(8,true)!==buffer.byteLength)throw Error('GLB inválido.');
  const len=v.getUint32(12,true),next=20+len;
  if(len%4||next+8>buffer.byteLength||v.getUint32(16,true)!==0x4e4f534a||v.getUint32(next+4,true)!==0x004e4942||next+8+v.getUint32(next,true)!==buffer.byteLength)throw Error('Blocos GLB inválidos.');
  return {json:JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,20,len))),bin:new Uint8Array(buffer,next+8)};
}
export function hasSkin(buffer){return !!unpackGLB(buffer).json.skins?.length;}
export function packGLB(json,bin){
  const data=new TextEncoder().encode(JSON.stringify(json)),n=(data.length+3)&~3,b=(bin.length+3)&~3;
  const out=new Uint8Array(28+n+b),v=new DataView(out.buffer);
  v.setUint32(0,0x46546c67,true);v.setUint32(4,2,true);v.setUint32(8,out.length,true);
  v.setUint32(12,n,true);v.setUint32(16,0x4e4f534a,true);out.fill(32,20,20+n);out.set(data,20);
  v.setUint32(20+n,b,true);v.setUint32(24+n,0x004e4942,true);out.set(bin,28+n);
  if(out.length>MAX_BYTES)throw Error('GLB com rig excede 24 MiB.');
  return out.buffer;
}
export function accessor(j,bin,id,type,component,components){
  const a=j.accessors?.[id],b=j.bufferViews?.[a?.bufferView],bytes=component===5123?2:4;
  if(!a||!b||a.type!==type||a.componentType!==component||a.sparse||!Number.isInteger(a.count)||a.count<1||a.count>600000||b.buffer!==0)throw Error('Accessor de skin inválido.');
  const start=(b.byteOffset??0)+(a.byteOffset??0),stride=b.byteStride??components*bytes,end=start+(a.count-1)*stride+components*bytes;
  if(!Number.isInteger(start)||start<0||stride<components*bytes||end>bin.length||end>(b.byteOffset??0)+b.byteLength)throw Error('Accessor fora do buffer.');
  const dv=new DataView(bin.buffer,bin.byteOffset,bin.byteLength),out=component===5123?new Uint16Array(a.count*components):new Float32Array(a.count*components);
  for(let i=0;i<a.count;i++)for(let k=0;k<components;k++)out[i*components+k]=component===5123?dv.getUint16(start+i*stride+k*bytes,true):dv.getFloat32(start+i*stride+k*bytes,true);
  return out;
}
export async function exportSkinnedGLB(project,rig){
  validate(project,{empty:false});rig=adjustRig(rig);
  const base=await exportGLB(project),{json:j,bin}=unpackGLB(base.buffer);
  const node=j.nodes.find(n=>n.extras?.partId===rig.partId);
  if(!node||node.mesh==null)throw Error('Peça do rig não encontrada no GLB.');
  if(j.nodes.filter(n=>n.mesh===node.mesh).length!==1)throw Error('Malha compartilhada não suportada para skinning.');
  const chunks=[bin];let length=bin.length;
  function append(array,type,component,target){
    const pad=(4-length%4)%4;if(pad){chunks.push(new Uint8Array(pad));length+=pad;}
    const bytes=new Uint8Array(array.length*array.BYTES_PER_ELEMENT),dv=new DataView(bytes.buffer);
    for(let i=0;i<array.length;i++)if(component===5123)dv.setUint16(i*2,array[i],true);else dv.setFloat32(i*4,array[i],true);
    const view=j.bufferViews.push({buffer:0,byteOffset:length,byteLength:bytes.length,...(target?{target}:{})})-1;
    chunks.push(bytes);length+=bytes.length;
    return j.accessors.push({bufferView:view,componentType:component,count:array.length/(type==='MAT4'?16:4),type})-1;
  }
  const stats=[];
  for(const p of j.meshes[node.mesh].primitives){
    const positions=accessor(j,bin,p.attributes.POSITION,'VEC3',5126,3),{joints,weights,report}=computeWeights(positions,rig);
    p.attributes.JOINTS_0=append(joints,'VEC4',5123,34962);p.attributes.WEIGHTS_0=append(weights,'VEC4',5126,34962);stats.push(report);
  }
  const ids=new Map(),inverse=[];
  for(const bone of rig.bones){
    const i=j.nodes.push({name:bone.name,translation:bone.localPosition})-1;ids.set(bone.name,i);
    const parent=bone.parent===null?node:j.nodes[ids.get(bone.parent)];(parent.children??=[]).push(i);
    inverse.push(1,0,0,0,0,1,0,0,0,0,1,0,-bone.position[0],-bone.position[1],-bone.position[2],1);
  }
  j.skins=[{name:'ModelLab humanoid',joints:rig.bones.map(b=>ids.get(b.name)),skeleton:ids.get(rig.bones.find(b=>b.parent===null).name),inverseBindMatrices:append(new Float32Array(inverse),'MAT4',5126)}];
  node.skin=0;
  j.buffers[0].byteLength=length;
  const merged=new Uint8Array(length);let offset=0;for(const c of chunks){merged.set(c,offset);offset+=c.length;}
  const buffer=packGLB(j,merged),report=await verifySkinnedGLB(buffer);
  return {buffer,report:{...report,weightStats:stats,warnings:rig.warnings??[]}};
}
export async function verifySkinnedGLB(buffer){
  if(buffer.byteLength>MAX_BYTES)throw Error('GLB acima do limite.');
  const {json:j,bin}=unpackGLB(buffer);
  if(j.skins?.length!==1||j.buffers?.length!==1||j.buffers[0].uri||j.buffers[0].byteLength>bin.length||j.images?.some(i=>i.uri||i.mimeType!=='image/jpeg')||j.extensionsRequired?.length)throw Error('Perfil skinning incompatível.');
  const skin=j.skins[0],count=skin.joints?.length;
  if(!count||count>128||new Set(skin.joints).size!==count||skin.joints.some(i=>!j.nodes?.[i]))throw Error('Juntas inválidas.');
  const matrices=accessor(j,bin,skin.inverseBindMatrices,'MAT4',5126,16);
  if(matrices.length!==count*16||!matrices.every(Number.isFinite))throw Error('Matrizes de bind inválidas.');
  let vertices=0,maxInfluences=0,meshCount=0;
  for(const n of j.nodes??[])if(n.skin!=null){
    if(n.skin!==0||!j.meshes?.[n.mesh])throw Error('Skin sem malha.');
    meshCount++;
    for(const p of j.meshes[n.mesh].primitives){
      const pos=accessor(j,bin,p.attributes.POSITION,'VEC3',5126,3);
      const ids=accessor(j,bin,p.attributes.JOINTS_0,'VEC4',5123,4),ws=accessor(j,bin,p.attributes.WEIGHTS_0,'VEC4',5126,4);
      if(ids.length!==ws.length||ids.length!==pos.length/3*4||!pos.every(Number.isFinite))throw Error('Atributos de skin divergentes.');
      for(let i=0;i<ws.length;i+=4){
        let sum=0,influences=0;
        for(let k=0;k<4;k++){const v=ws[i+k];if(!Number.isFinite(v)||v<0||v>1||ids[i+k]>=count)throw Error('Peso ou índice de osso inválido.');sum+=v;if(v>0)influences++;}
        if(Math.abs(sum-1)>1e-5)throw Error('Pesos não normalizados.');maxInfluences=Math.max(maxInfluences,influences);
      }
      vertices+=pos.length/3;
    }
  }
  if(!meshCount||!vertices)throw Error('GLB sem skin.');
  const clips=j.animations??[];
  if(clips.length>64)throw Error('Limite de animações excedido.');
  const clipNames=new Set();
  for(const clip of clips){
    if(typeof clip.name!=='string'||clipNames.has(clip.name)||!clip.channels?.length||!clip.samplers?.length)throw Error('Animação inválida.');
    clipNames.add(clip.name);const targets=new Set();
    for(const ch of clip.channels){
      if(ch.target?.path!=='rotation'||!skin.joints.includes(ch.target.node)||targets.has(ch.target.node))throw Error('Canal de animação inválido.');
      targets.add(ch.target.node);
      const s=clip.samplers[ch.sampler];
      if(!s||s.interpolation!=='LINEAR')throw Error('Sampler de animação inválido.');
      const t=accessor(j,bin,s.input,'SCALAR',5126,1),q=accessor(j,bin,s.output,'VEC4',5126,4);
      if(t.length*4!==q.length||t[0]<0||!t.every((x,i)=>Number.isFinite(x)&&(!i||x>t[i-1])))throw Error('Tempos de animação inválidos.');
      for(let i=0;i<q.length;i+=4)if(Math.abs(Math.hypot(...q.subarray(i,i+4))-1)>1e-4||!q.subarray(i,i+4).every(Number.isFinite))throw Error('Quaternion inválido.');
    }
  }
  const loaded=await new T.GLTFLoader().register(parser=>({name:'ModelLabJPEG',async loadTexture(i){const im=j.images[j.textures[i].source],data=await parser.getDependency('bufferView',im.bufferView);return imageMap(jpegURI(new Uint8Array(data)));}})).parseAsync(buffer,'');
  try{
    loaded.scene.updateMatrixWorld(true);let found=0,maxRestError=0;
    loaded.scene.traverse(o=>{
      if(!o.isSkinnedMesh)return;found++;o.skeleton.update();
      if(o.skeleton.bones.length!==count)throw Error('Rig alterado na reimportação.');
      const p=o.geometry.attributes.position;
      for(let i=0;i<p.count;i++){
        const original=new T.Vector3().fromBufferAttribute(p,i),v=original.clone();
        o.applyBoneTransform(i,v);maxRestError=Math.max(maxRestError,v.distanceTo(original));
      }
    });
    if(!found||maxRestError>1e-4)throw Error('Pose de repouso divergente: '+maxRestError);
    if(loaded.animations.length!==clips.length||loaded.animations.some(c=>!Number.isFinite(c.duration)||c.duration<=0||!c.tracks.length))throw Error('Animações divergentes na reimportação.');
    return {ok:true,format:'glTF 2.0 / GLB',profile:'skinned-pbr',reimported:true,bones:count,skinnedMeshes:found,vertices,maxInfluences,maxRestError,animations:loaded.animations.map(c=>({name:c.name,duration:c.duration,tracks:c.tracks.length})),bytes:buffer.byteLength};
  }finally{loaded.scene.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.map?.dispose();o.material.dispose();}if(o.isSkinnedMesh)o.skeleton.dispose();});}
}
export function poseProject(source,rig,rotations={}){
  const project=structuredClone(validate(source));rig=adjustRig(rig);
  if(!rotations||typeof rotations!=='object'||Array.isArray(rotations))throw Error('Pose inválida.');
  for(const [name,r] of Object.entries(rotations))if(!rig.bones.some(b=>b.name===name)||!Array.isArray(r)||r.length!==3||!r.every(x=>Number.isFinite(x)&&Math.abs(x)<=360))throw Error('Rotação inválida: '+name);
  const scene=buildScene(project,{textures:false});
  try{
    const obj=scene.objects.get(rig.partId),part=project.parts.find(p=>p.id===rig.partId);
    if(!obj?.isMesh)throw Error('Malha do rig ausente.');
    const g=obj.geometry,pos=g.attributes.position,uv=g.attributes.uv,positions=[];
    for(let i=0;i<pos.count;i++)positions.push(pos.getX(i),pos.getY(i),pos.getZ(i));
    const {joints,weights}=computeWeights(positions,rig),global=new Map(),transforms=[];
    for(const b of rig.bones){
      const e=new T.Euler(...(rotations[b.name]??[0,0,0]).map(T.MathUtils.degToRad));
      const local=new T.Matrix4().compose(new T.Vector3(...b.localPosition),new T.Quaternion().setFromEuler(e),new T.Vector3(1,1,1));
      const world=b.parent===null?local:global.get(b.parent).clone().multiply(local);
      global.set(b.name,world);transforms.push(world.clone().multiply(new T.Matrix4().makeTranslation(...b.position.map(x=>-x))));
    }
    const out=[],v=new T.Vector3(),sum=new T.Vector3();
    for(let i=0;i<pos.count;i++){
      sum.set(0,0,0);
      for(let k=0;k<4;k++){const w=weights[i*4+k];if(w){v.fromBufferAttribute(pos,i).applyMatrix4(transforms[joints[i*4+k]]);sum.addScaledVector(v,w);}}
      out.push(sum.x,sum.y,sum.z);
    }
    let id='pose-material',counter=1;while(project.materials.some(m=>m.id===id))id='pose-material-'+counter++;
    const mat=project.materials.find(m=>m.id===part.material);
    project.materials.push({...mat,id,name:'Material da pose',...(obj.material.modelLabImage?{baseColorImage:obj.material.modelLabImage}:{})});
    part.shape='mesh';part.size=[1,1,1];part.material=id;delete part.profile;
    part.geometry={positions:out,...(uv?{uv:Array.from({length:uv.count*2},(_,i)=>i%2?uv.getY(i>>1):uv.getX(i>>1))}:{}),...(g.index?{indices:Array.from(g.index.array)}:{})};
    validate(project,{empty:false});serializeProject(project,false);return project;
  }finally{scene.dispose();}
}
export function previewPose(project,rig,rotations,options){return renderViews(poseProject(project,rig,rotations),options);}
