// Local-only browser worker: no network uploads, no Node-specific FBX parser.
import {validate,serializeProject,MAX_BYTES} from './model.js';
import {photoProject} from './automation.js';
import {prepareCharacter} from './character-pipeline.js';
import {createCreature} from './creature-training.js';
import {renderViews} from './render.js';
import {poseProject} from './skin.js';
import {samplePose} from './animation.js';
import {exportLOD} from './lod-training.js';
let prepared=null;
const render=(p,view)=>renderViews(p,{size:384,views:[view]}).images[view];
self.onmessage=async({data:m})=>{
 try{
  if(m.action==='prepare'||m.action==='photo'){
   const source=m.action==='photo'?photoProject(m.photo):validate(m.source,{empty:false});
   if(new TextEncoder().encode(JSON.stringify(source)).length>MAX_BYTES)throw Error('Projeto acima de 24 MiB.');
   prepared=prepareCharacter(source,m.options);
   if(m.action==='photo')self.postMessage({type:'source',source});
   const image=render(prepared.project,m.view);
   self.postMessage({type:'preview',image,report:prepared.report,bones:prepared.rig.bones.length,clips:prepared.clips.map(c=>c.name)});
  }else if(m.action==='creature'){
   const result=createCreature(m.options);prepared={project:result.project,rig:null,clips:[],report:result.report};
   self.postMessage({type:'preview',image:render(prepared.project,m.view),report:prepared.report,bones:0,clips:[]});
  }else if(m.action==='pose'){
   if(!prepared)throw Error('Gere uma prévia primeiro.');
   let p=prepared.project;
   if(m.clip!=='rest'){
    if(!prepared.rig)throw Error('Criatura estática.');
    p=poseProject(p,prepared.rig,m.clip==='grip'?prepared.grip:samplePose(m.clip,m.time));
   }
   self.postMessage({type:'preview',image:render(p,m.view)});
  }else if(m.action==='export'){
   if(!prepared)throw Error('Gere uma prévia primeiro.');
   const entries=[{file:'character.modellab.json',data:serializeProject(prepared.project)}],levels=[];
   if(prepared.rig){
    entries.push({file:'character.rig.json',data:JSON.stringify(prepared.rig,null,2)},{file:'clips.json',data:JSON.stringify(prepared.clips,null,2)});
    if(prepared.grip)entries.push({file:'grip.pose.json',data:JSON.stringify(prepared.grip,null,2)});
   }
   for(const level of m.levels){
    self.postMessage({type:'progress',message:'Exportando '+level.toUpperCase()+'…'});
    const result=await exportLOD(prepared.project,level,{rig:prepared.rig??undefined,clips:prepared.clips});
    entries.push({file:level+'.glb',data:new Uint8Array(result.buffer)});
    levels.push({file:level+'.glb',...result.report});
   }
   const manifest={schema:'rexx-browser-package-1',bones:prepared.rig?.bones.length??0,levels,allBudgetsMet:levels.every(l=>l.budgetMet),report:prepared.report};
   entries.push({file:'manifest.json',data:JSON.stringify(manifest,null,2)});
   self.postMessage({type:'export',entries,manifest},entries.filter(e=>e.data instanceof Uint8Array).map(e=>e.data.buffer));
  }else throw Error('Ação desconhecida.');
 }catch(e){self.postMessage({type:'error',message:String(e.message??e)});}
};
