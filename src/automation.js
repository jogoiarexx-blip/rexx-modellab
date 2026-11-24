// API de automação 0.7: usa a mesma geometria e validação do editor.
import {defaults,makePart,validate,buildScene,metrics,below,serializeProject} from './model.js';
import {bounds,profileSize,validateContour} from './profile.js';
import {pixels} from './raster.js';
import {suggestContour,anatomy} from './silhouette.js';
import {suggestedDepth} from './character.js';

export function createProject(name='Sem título'){
  return validate({...defaults(),name});
}
export function photoProject({image,points,name='Personagem',height=1.8,depth,volume=1,detail=.16}){
  const raster=pixels(image),reference={id:'front',name:'Frente',image,width:raster.width,height:raster.height};
  const contour=points??suggestContour(raster);
  validateContour(contour,reference);
  if(!Number.isFinite(height)||height<=0||!Number.isFinite(volume)||volume<.5||volume>1.5)throw Error('Altura ou volume inválido.');
  const b=bounds(contour),width=height*b.width/b.height;
  const d=depth??suggestedDepth(contour,width,volume);
  const project=createProject(name);
  project.references=[reference];
  project.materials=[{id:'photo',name:'Textura fotográfica',color:'#ffffff',roughness:.85,metalness:0}];
  project.parts=[{...makePart('character',name,'profile','photo'),position:[0,height/2,0],size:[width,height,d],profile:{reference:'front',points:structuredClone(contour),form:'humanoid',volume,detail,calibration:{a:[b.left,b.top],b:[b.left,b.top+b.height],meters:height}}}];
  return validate(project,{empty:false});
}
function find(list,id){const item=list.find(x=>x.id===id);if(!item)throw Error('ID inexistente: '+id);return item;}
function patch(target,fields,allowed){
  if(!fields||typeof fields!=='object'||Array.isArray(fields))throw Error('Campos inválidos.');
  for(const [key,value] of Object.entries(fields)){
    if(!allowed.includes(key))throw Error('Campo não permitido: '+key);
    target[key]=structuredClone(value);
  }
}
export function applyOperations(source,operations){
  const p=structuredClone(validate(source));
  if(!Array.isArray(operations)||operations.length>1000)throw Error('Informe até 1000 operações.');
  for(const op of operations){
    if(!op||typeof op!=='object')throw Error('Operação inválida.');
    switch(op.type){
      case 'rename': p.name=op.name;break;
      case 'addMaterial': p.materials.push(structuredClone(op.material));break;
      case 'updateMaterial': patch(find(p.materials,op.id),op.fields,['name','color','roughness','metalness','baseColorImage']);break;
      case 'addPart': p.parts.push({...makePart(op.part.id,op.part.name,op.part.shape,op.part.material),...structuredClone(op.part)});break;
      case 'updatePart': patch(find(p.parts,op.id),op.fields,['name','parent','material','position','rotation','scale','size','geometry']);break;
      case 'removePart': {find(p.parts,op.id);const ids=below(p.parts,op.id);p.parts=p.parts.filter(x=>!ids.has(x.id));break;}
      case 'addReference': (p.references??=[]).push(structuredClone(op.reference));break;
      case 'adjustProfile': {
        const n=find(p.parts,op.id);if(n.shape!=='profile')throw Error('Peça não é um perfil.');
        const oldHeight=n.size[1],oldVolume=n.profile.volume??1;
        patch(n.profile,op.fields??{},['points','form','volume','detail','back','side','calibration','reference']);
        const ref=find(p.references??[],n.profile.reference),b=bounds(n.profile.points);
        const height=op.height;
        if(height!==undefined){
          if(!Number.isFinite(height)||height<=0)throw Error('Altura inválida.');
          n.profile.calibration={a:[b.left,b.top],b:[b.left,b.top+b.height],meters:height};
        }
        const dimensions=profileSize(n.profile,ref,n.size[0],n.size[2]);
        const newDepth=op.depth??(n.profile.form==='humanoid'&&(op.fields?.volume!==undefined||op.fields?.points!==undefined||height!==undefined)?suggestedDepth(n.profile.points,dimensions[0],n.profile.volume??oldVolume):n.size[2]);
        n.size=profileSize(n.profile,ref,dimensions[0],newDepth);
        if(op.keepFloor===true)n.position[1]+=(n.size[1]-oldHeight)*n.scale[1]/2;
        break;
      }
      default: throw Error('Operação desconhecida: '+op.type);
    }
    validate(p);
  }
  serializeProject(p,false);
  return p;
}
export function inspectProject(project){
  validate(project);
  const scene=buildScene(project,{textures:false});
  try{
    return {ok:true,name:project.name,...metrics(scene.root),materials:project.materials.length,parts:project.parts.map(n=>({id:n.id,name:n.name,shape:n.shape,size:n.size,position:n.position,profile:n.profile?{form:n.profile.form,points:n.profile.points.length,humanoidRecognized:!!anatomy(n.profile.points),hasBack:!!n.profile.back,hasSide:!!n.profile.side}:undefined})),warnings:project.parts.filter(n=>n.profile?.form==='humanoid'&&(!n.profile.back||!n.profile.side)).map(n=>n.id+': costas ou lateral estimadas.')};
  }finally{scene.dispose();}
}
