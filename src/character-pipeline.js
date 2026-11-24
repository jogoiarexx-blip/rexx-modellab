// REXX-TRAIN-10 — reproducible character production from an editable photo profile.
import {validate,serializeProject} from './model.js';
import {auditViews} from './view-audit.js';
import {refineCharacter} from './refine.js';
import {trainClothing} from './clothing-training.js';
import {autoRig} from './rig.js';
import {buildHandMesh,gripPose} from './hand-mesh.js';
import {getClip,animationNames} from './animation.js';
import {retargetMotion} from './retarget.js';
import {exportLOD,LOD_PROFILES} from './lod-training.js';

function config(options={}){
 if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(k=>!['id','refine','clothing','hands','handMesh','joints','animations','levels','maxBytes','retarget'].includes(k)))throw Error('Opções de personagem inválidas.');
 const {id='character',refine={},clothing=null,hands='detailed',handMesh=hands==='detailed'?{}:false,joints={},animations=['idle','walk','run','jump','attack','hit','death'],levels=['lod0','lod1','lod2'],maxBytes,retarget={}}=options;
 const isObject=x=>x&&typeof x==='object'&&!Array.isArray(x);
 if(typeof id!=='string'||!isObject(refine)||!(clothing===null||isObject(clothing))||!['basic','detailed'].includes(hands)||!(handMesh===false||isObject(handMesh))||!isObject(joints)||!isObject(retarget))throw Error('Configuração de personagem inválida.');
 if(hands==='basic'&&handMesh!==false)throw Error('Geometria de dedos exige hands detailed.');
 if(!Array.isArray(animations)||new Set(animations).size!==animations.length||animations.some(n=>!animationNames().includes(n)))throw Error('Animações inválidas.');
 if(!Array.isArray(levels)||!levels.length||new Set(levels).size!==levels.length||levels.some(n=>!LOD_PROFILES.some(p=>p.id===n)))throw Error('Níveis LOD inválidos.');
 if(maxBytes!==undefined&&(!Number.isSafeInteger(maxBytes)||maxBytes<1024||maxBytes>24*1024*1024))throw Error('Limite de bytes inválido.');
 if(Object.keys(retarget).some(k=>!['fps','name','loop','yaw'].includes(k)))throw Error('Opções retarget inválidas.');
 if(handMesh!==false&&Object.keys(handMesh).some(k=>!['segments','thickness'].includes(k)))throw Error('Opções de mãos inválidas.');
 if(clothing&&Object.hasOwn(clothing,'refine'))throw Error('Use refine no nível principal, não dentro de clothing.');
 return {id,refine:{anatomyStyle:'neutral',anatomyStrength:.6,face:{strength:.5},reproject:true,...refine},clothing,hands,handMesh,joints,animations,levels,maxBytes,retarget};
}
export function prepareCharacter(source,options={},motion){
 const o=config(options);validate(source,{empty:false});
 const part=source.parts.find(p=>p.id===o.id);
 if(part?.shape!=='profile'||part.profile?.form!=='humanoid')throw Error('Use o projeto fotográfico humanoide original em pose T.');
 if(source.parts.filter(p=>p.shape!=='group').length!==1)throw Error('O fluxo integrado aceita um personagem por projeto.');
 const views=auditViews(source,o.id),stages=[];
 const refined=o.clothing?trainClothing(source,o.id,{...o.clothing,refine:o.refine}):{project:refineCharacter(source,o.id,o.refine),report:null};
 let project=refined.project;
 stages.push({stage:'refine',ok:true,clothing:refined.report});
 // Use source silhouette for anatomical XY landmarks; refined positions preserve XY.
 const rig=autoRig(source,o.id,{hands:o.hands,joints:o.joints});
 stages.push({stage:'rig',ok:true,bones:rig.bones.length,warnings:rig.warnings});
 if(o.handMesh!==false){
  const h=buildHandMesh(project,rig,o.handMesh);project=h.project;
  stages.push({stage:'hands',ok:true,report:h.report});
 }
 const clips=o.animations.map(getClip);
 if(motion){
  const {report,...clip}=retargetMotion(motion,rig,o.retarget);
  if(clips.some(c=>c.name===clip.name))throw Error('Nome de clipe importado duplicado.');
  clips.push(clip);stages.push({stage:'retarget',ok:true,report});
 }
 const grip=o.hands==='detailed'?gripPose(rig,.8):null;
 validate(project,{empty:false});serializeProject(project,false);
 return {project,rig,clips,grip,report:{views,stages},options:o};
}
export async function buildCharacterPackage(source,options={},motion){
 const prepared=prepareCharacter(source,options,motion),files=[],levels=[];
 for(const id of prepared.options.levels){
  const result=await exportLOD(prepared.project,id,{rig:prepared.rig,clips:prepared.clips,maxBytes:prepared.options.maxBytes});
  const file=id+'.glb';files.push({file,buffer:result.buffer});
  levels.push({file,...result.report});
 }
 const manifest={schema:'rexx-character-package-1',partId:prepared.rig.partId,bones:prepared.rig.bones.length,clips:prepared.clips.map(c=>({name:c.name,duration:c.frames.at(-1).time,loop:c.loop})),...prepared.report,levels,allBudgetsMet:levels.every(l=>l.budgetMet),warnings:['Reconstrução procedural; revisão visual e da deformação necessária.','As metas de orçamento podem não ser atingidas.','Pesos recalculados por LOD; o mesmo esqueleto e clipes são utilizados.','Carregue apenas o LOD necessário.']};
 return {...prepared,files,manifest};
}
export function characterPackageEntries(result){
 const json=x=>JSON.stringify(x,null,2)+'\n';
 return [
  {file:'character.modellab.json',data:serializeProject(result.project)},
  {file:'character.rig.json',data:json(result.rig)},
  ...(result.grip?[{file:'grip.pose.json',data:json(result.grip)}]:[]),
  {file:'clips.json',data:json(result.clips)},
  ...result.files.map(f=>({file:f.file,data:new Uint8Array(f.buffer)})),
  {file:'manifest.json',data:json(result.manifest)}
 ];
}
