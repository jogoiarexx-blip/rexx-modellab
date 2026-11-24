// Auto Rig 0.10: esqueleto de repouso em coordenadas locais da malha.
import {addFingerBones} from './hand-rig.js';
import {buildScene,validate} from './model.js';
import {anatomy,spans} from './silhouette.js';
import {bounds} from './profile.js';
import {Vector3} from '../vendor/engine.mjs';
import {renderViews,VIEWS} from './render.js';
const lerp=(a,b,t)=>a+(b-a)*t;
const mid=s=>(s[0]+s[1])/2;
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
const dist=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const sides=['left','right'];
export function autoRig(project,id,{joints={},hands='basic'}={}){
  if(!['basic','detailed'].includes(hands))throw Error('Modo de mãos inválido.');
  validate(project,{empty:false});
  const part=project.parts.find(p=>p.id===id);
  if(!part||!(part.profile?.form==='humanoid'||part.shape==='mesh'))throw Error('Selecione um perfil humanoide ou malha humana em pose T.');
  const scene=buildScene(project,{textures:false});
  try{
    const obj=scene.objects.get(id),g=obj.geometry;
    g.computeBoundingBox();
    const {min,max}=g.boundingBox,w=max.x-min.x,h=max.y-min.y,d=max.z-min.z;
    if(h<=0||w/h<.43||w/h>1.65||d<=0)throw Error('Proporções incompatíveis com personagem humanoide em pose T.');
    const points=part.profile?.points,info=points?anatomy(points):null,box=points?bounds(points):null;
    const warnings=[];
    if(!info)warnings.push('Articulações estimadas por proporções; revise a pose T manualmente.');
    if(!part.profile?.side&&!part.sideCalibrated)warnings.push('Profundidade das articulações estimada sem foto lateral.');
    const center=info?(info.center-box.left)/box.width:.5;
    const armRow=info?(info.armTop+info.armBottom)/2:.25;
    const neckRow=info?clamp(info.armTop-.025,.12,.23):.17;
    const chest=info?info.chestWidth/box.width:.27;
    const atRow=r=>points?spans(points,box.top+r*box.height):[];
    function legX(r,s){
      const row=atRow(r);
      return row.length===2?(mid(row[s==='left'?1:0])-box.left)/box.width:center+(s==='left'?1:-1)*chest*.24;
    }
    function armY(x){
      if(!points)return armRow;
      const columns=spans(points.map(([a,b])=>[b,a]),box.left+x*box.width);
      const col=columns.find(([a,b])=>a<=box.top+armRow*box.height&&b>=box.top+armRow*box.height);
      return col?(mid(col)-box.top)/box.height:armRow;
    }
    // Estima Z pelo envelope local de vértices vizinhos. Não usa cor ou sombras como profundidade.
    const pos=g.attributes.position;
    function depthAt(x,y){
      let lo=Infinity,hi=-Infinity,best=Infinity,nearest=0;
      for(let i=0;i<pos.count;i++){
        const dx=(pos.getX(i)-x)/w,dy=(pos.getY(i)-y)/h,q=dx*dx+dy*dy;
        if(q<best){best=q;nearest=pos.getZ(i);}
        if(q<.0016){lo=Math.min(lo,pos.getZ(i));hi=Math.max(hi,pos.getZ(i));}
      }
      return lo<=hi?(lo+hi)/2:nearest;
    }
    const bones=[];
    function add(name,parent,x,row,zOffset=0){
      const px=lerp(min.x,max.x,x),py=lerp(max.y,min.y,row);
      const position=[px,py,clamp(depthAt(px,py)+d*zOffset,min.z,max.z)];
      bones.push({name,parent,position});
    }
    add('hips',null,center,.49);
    add('spine','hips',center,.40);
    add('chest','spine',center,.30);
    add('neck','chest',center,neckRow);
    add('head','neck',center,.095);
    add('headEnd','head',center,.015);
    for(const s of sides){
      const sign=s==='left'?1:-1,edge=s==='left'?.985:.015;
      const shoulder=center+sign*chest*.48,reach=Math.abs(edge-shoulder);
      const handLength=hands==='detailed'?clamp(.092*h/w,reach*.16,reach*.27):reach*.14;
      const wrist=edge-sign*handLength,elbow=hands==='detailed'?lerp(shoulder,wrist,.52):lerp(shoulder,edge,.45);
      add(s+'Shoulder','chest',center+sign*chest*.25,armRow);
      add(s+'UpperArm',s+'Shoulder',shoulder,armY(shoulder));
      add(s+'LowerArm',s+'UpperArm',elbow,armY(elbow));
      add(s+'Hand',s+'LowerArm',wrist,armY(wrist));
      add(s+'HandEnd',s+'Hand',edge,armY(edge));
      add(s+'UpperLeg','hips',legX(.60,s),.51);
      add(s+'LowerLeg',s+'UpperLeg',legX(.75,s),.75);
      add(s+'Foot',s+'LowerLeg',legX(.93,s),.93);
      add(s+'Toes',s+'Foot',legX(.965,s),.965,.18);
      add(s+'ToeEnd',s+'Toes',legX(.99,s),.99,.30);
    }
    if(hands==='detailed')warnings.push('Dedos estimados em pose T, palma para baixo; revise as articulações e a geometria de cada dedo.');
    const finalBones=hands==='detailed'?addFingerBones(bones):bones;
    const rig={schemaVersion:'1.0',type:'modellab-humanoid-rig',partId:id,space:'mesh-local-meters',pose:'T',bones:finalBones,warnings};
    return adjustRig(rig,joints);
  }finally{scene.dispose();}
}
export function validateRig(rig){
  if(!rig||rig.schemaVersion!=='1.0'||rig.type!=='modellab-humanoid-rig'||rig.space!=='mesh-local-meters'||typeof rig.partId!=='string'||!Array.isArray(rig.bones)||rig.bones.length<2||rig.bones.length>128)throw Error('Rig inválido.');
  const names=new Map();
  for(const b of rig.bones){
    if(!b||typeof b.name!=='string'||!/^[a-zA-Z0-9_]{1,64}$/.test(b.name)||names.has(b.name)||!Array.isArray(b.position)||b.position.length!==3||!b.position.every(v=>Number.isFinite(v)&&Math.abs(v)<=1e6))throw Error('Osso inválido ou duplicado.');
    if(b.parent!==null&&!names.has(b.parent))throw Error('Pai ausente ou ordem inválida: '+b.name);
    if(b.parent!==null&&dist(b.position,names.get(b.parent).position)<1e-6)throw Error('Osso sem comprimento: '+b.name);
    names.set(b.name,b);
  }
  if(rig.bones.filter(b=>b.parent===null).length!==1)throw Error('Rig deve ter uma raiz.');
  return rig;
}
export function adjustRig(source,joints={}){
  if(!joints||typeof joints!=='object'||Array.isArray(joints))throw Error('Ajustes devem ser um mapa de articulações.');
  const rig=structuredClone(source);
  for(const [name,position] of Object.entries(joints)){
    const b=rig.bones.find(b=>b.name===name);if(!b)throw Error('Articulação desconhecida: '+name);
    b.position=structuredClone(position);
  }
  validateRig(rig);
  const map=new Map(rig.bones.map(b=>[b.name,b]));
  for(const b of rig.bones)b.localPosition=b.parent===null?[...b.position]:b.position.map((v,i)=>v-map.get(b.parent).position[i]);
  return rig;
}
export function previewRig(project,rig,{size=512,views=['front','left','iso']}={}){
  validateRig(rig);
  const result=renderViews(project,{size,views}),scene=buildScene(project,{textures:false});
  try{
    const obj=scene.objects.get(rig.partId);if(!obj?.isMesh)throw Error('Malha do rig não encontrada.');
    const world=rig.bones.map(b=>({name:b.name,parent:b.parent,point:new Vector3(...b.position).applyMatrix4(obj.matrixWorld)}));
    for(const [view,image] of Object.entries(result.images)){
      const [yaw,pitch]=VIEWS[view],cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch);
      const {scale,cx,cy:offset}=image.projection;
      const screen=new Map(world.map(({name,point:{x,y,z}})=>[name,[size/2+(x*cy-z*sy-cx)*scale,size/2-(y*cp-(x*sy+z*cy)*sp-offset)*scale]]));
      function dot(x,y,r,color){
        for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){
          if(dx*dx+dy*dy>r*r)continue;
          const a=Math.round(x)+dx,b=Math.round(y)+dy;
          if(a>=0&&a<size&&b>=0&&b<size)image.data.set(color,(b*size+a)*4);
        }
      }
      for(const b of world)if(b.parent!==null){
        const a=screen.get(b.parent),c=screen.get(b.name),steps=Math.min(size*4,Math.ceil(dist(a,c)));
        for(let i=0;i<=steps;i++){const t=steps?i/steps:0;dot(lerp(a[0],c[0],t),lerp(a[1],c[1],t),1,[40,220,240,255]);}
      }
      for(const [x,y] of screen.values())dot(x,y,3,[255,191,55,255]);
    }
    result.report.rig={partId:rig.partId,bones:rig.bones.length,warnings:rig.warnings??[]};
    return result;
  }finally{scene.dispose();}
}
