// REXX-TRAIN-09: standalone LOD files, with measured budgets and shared rig.
import {validate,MAX_BYTES,buildScene} from './model.js';
import {editTextures} from './texture.js';
import {optimizeGeometry} from './mesh-optimization.js';
import {exportGLB} from './format.js';
import {exportSkinnedGLB} from './skin.js';
import {exportAnimationClips} from './animation.js';
import {validateRig} from './rig.js';
import {inspectReferenceGLB,REFERENCE_CORPUS} from './reference-training.js';
export const LOD_PROFILES=Object.freeze([
 Object.freeze({id:'lod0',preset:'cinematic',ratio:1,triangles:300000,maxSide:2048,quality:94,maxBytes:24*1024*1024}),
 Object.freeze({id:'lod1',preset:'balanced',ratio:.60,triangles:30000,maxSide:1024,quality:86,maxBytes:16*1024*1024}),
 Object.freeze({id:'lod2',preset:'mobile',ratio:.30,triangles:12000,maxSide:512,quality:78,maxBytes:8*1024*1024})
]);
export function referenceBudgetPlan(){
 return REFERENCE_CORPUS.map(m=>({id:m.id,originalTriangles:m.triangles,targets:LOD_PROFILES.map(p=>({id:p.id,triangles:Math.max(1,Math.min(p.triangles,Math.floor(m.triangles*p.ratio)))}))}));
}
function countTriangles(g){return (g.index?.count??g.attributes.position.count)/3;}
function bakeUntextured(project){
 const scene=buildScene(project,{textures:false});
 try{
  for(const part of project.parts){
   if(part.shape==='group'||part.shape==='mesh')continue;
   const obj=scene.objects.get(part.id),g=obj.geometry;
   if(obj.material.modelLabImage)throw Error('Perfil texturizado não convertido.');
   part.geometry={positions:Array.from(g.attributes.position.array),...(g.attributes.uv?{uv:Array.from(g.attributes.uv.array)}:{}),...(g.attributes.normal?{normals:Array.from(g.attributes.normal.array)}:{}),...(g.index?{indices:Array.from(g.index.array)}:{})};
   part.shape='mesh';part.size=[1,1,1];delete part.profile;
  }
 }finally{scene.dispose();}
}
export function prepareLOD(source,profile,{rig,maxBytes}={}){
 validate(source,{empty:false});if(rig)validateRig(rig);
 const p=LOD_PROFILES.find(x=>x.id===profile);
 if(!p)throw Error('LOD desconhecido.');
 if(maxBytes!==undefined&&(!Number.isSafeInteger(maxBytes)||maxBytes<1024||maxBytes>MAX_BYTES))throw Error('Limite de bytes inválido.');
 const {project,report:textures}=editTextures(source,{preset:p.preset,maxSide:p.maxSide,quality:p.quality});
 bakeUntextured(project);
 const meshes=project.parts.filter(x=>x.shape==='mesh'),triangles=part=>(part.geometry.indices?.length??part.geometry.positions.length/3)/3;
 const total=meshes.reduce((s,x)=>s+triangles(x),0);
 const desired=Math.max(1,Math.min(p.triangles,Math.floor(total*p.ratio)));
 const parts=[];
 for(const part of meshes){
  const before=triangles(part),targetTriangles=Math.max(1,Math.floor(desired*before/Math.max(1,total)));
  const protectedPoints=rig?.partId===part.id?rig.bones.map(b=>b.position.map((v,k)=>v/part.size[k])):[];
  const out=optimizeGeometry(part.geometry,{targetTriangles,protectedPoints,maxRounds:p.ratio===1?0:14,maxEdge:.06,uvTolerance:.05});
  part.geometry=out.geometry;parts.push({id:part.id,...out.report});
 }
 validate(project,{empty:false});
 return {project,report:{profile:p.id,targetTriangles:desired,targetBytes:Math.min(maxBytes??p.maxBytes,p.maxBytes),textures,parts}};
}
export function measureLOD(buffer,prepared){
 const a=inspectReferenceGLB(buffer,{preset:LOD_PROFILES.find(p=>p.id===prepared.profile).preset});
 const textureRGBABytes=a.images.reduce((s,i)=>s+(i.width&&i.height?i.width*i.height*4:0),0);
 const estimatedMipRGBABytes=Math.ceil(textureRGBABytes*4/3);
 const indexAndVertexEstimate=a.vertices*(32+(a.skins?24:0))+a.triangles*3*4;
 const reasons=[];
 if(a.bytes>prepared.targetBytes)reasons.push('bytes');
 if(a.triangles>prepared.targetTriangles)reasons.push('triangles');
 if(a.unknownImageSizes)reasons.push('unknownTextureDimensions');
 if(a.invalidWeights)reasons.push('invalidSkinWeights');
 return {...prepared,bytes:a.bytes,triangles:a.triangles,vertices:a.vertices,bones:a.bones,clips:a.clips,textureBytes:a.textureBytes,maxTexture:a.maxTexture,textureRGBABytes,estimatedMipRGBABytes,indexAndVertexEstimate,budgetMet:reasons.length===0,unmet:reasons};
}
export async function exportLOD(source,profile,{rig,clips,maxBytes}={}){
 if(clips?.length&&!rig)throw Error('Animações exigem rig.');
 const prepared=prepareLOD(source,profile,{rig,maxBytes});
 const built=clips?.length?await exportAnimationClips(prepared.project,rig,clips):rig?await exportSkinnedGLB(prepared.project,rig):await exportGLB(prepared.project);
 return {buffer:built.buffer,report:measureLOD(built.buffer,prepared.report)};
}
