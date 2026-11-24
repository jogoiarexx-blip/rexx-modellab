// Refinamento opcional de volume por região. Exporta uma cópia mesh editável.
import {faceOptions,facialOffset} from './face-training.js';
import {Float32BufferAttribute} from '../vendor/engine.mjs';
import {characterGeometry,characterJPEG} from './character.js';
import {anatomicalDepth,currentDepthEnvelope,validateAnatomyOptions} from './anatomy-training.js';
import {buildScene,validate,serializeProject} from './model.js';
import {anatomy} from './silhouette.js';
import {bounds} from './profile.js';
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
const smooth=x=>{x=clamp(x,0,1);return x*x*(3-2*x);};
export function refineCharacter(source,id,options={}){
  const project=structuredClone(validate(source)),part=project.parts.find(p=>p.id===id);
  if(part?.profile?.form!=='humanoid'||part.shape!=='profile')throw Error('Escolha um perfil humanoide.');
  const {anatomyStyle,anatomyStrength=.6,face,reproject=false,...regional}=options;
  if(typeof reproject!=='boolean')throw Error('reproject deve ser booleano.');
  const facial=faceOptions(face,part.profile.points);
  validateAnatomyOptions(anatomyStyle,anatomyStrength);
  const factors={head:1,torso:1,arms:1,legs:1,feet:1,...regional};
  for(const [k,v] of Object.entries(factors))if(!['head','torso','arms','legs','feet'].includes(k)||!Number.isFinite(v)||v<.65||v>1.4)throw Error('Fator regional inválido: '+k);
  const scene=buildScene(project,{textures:false});
  let faceGeometry,projectionGeometry;
  try{
    const obj=scene.objects.get(id);
    if(facial?.strength>0){
      const ref=project.references.find(r=>r.id===part.profile.reference);
      faceGeometry=characterGeometry(part.profile.points,part.size,part.profile.side,ref,part.profile.detail,facial.box);
    }
    const g=faceGeometry??obj.geometry,p=g.attributes.position,uv=g.attributes.uv;
    const info=anatomy(part.profile.points),box=bounds(part.profile.points),chest=(info?.chestWidth??box.width*.31)/box.width;
    const armTop=info?.armTop??.18,armBottom=info?.armBottom??.34;
    const positions=[],texcoords=[];
    const center=((info?.center??(box.left+box.width*.5))-box.left)/box.width-.5;
    const depthEnvelope=anatomyStyle?currentDepthEnvelope(p,part.size[1],part.size[0],center*part.size[0]):null;
    // Pares frente/costas compartilham XY; o centro local de profundidade é preservado.
    const half=p.count/2;
    if(!Number.isInteger(half))throw Error('Topologia de personagem não reconhecida.');
    for(let i=0;i<p.count;i++){
      const x=p.getX(i),y=p.getY(i),z=p.getZ(i),other=(i+half)%p.count;
      const mid=(z+p.getZ(other))*.5,row=.5-y/part.size[1],lateral=Math.abs(x/part.size[0]);
      const head=1-smooth((row-armTop+.055)/.09),legs=smooth((row-.52)/.13),feet=smooth((row-.89)/.08);
      const arms=smooth((lateral-chest*.40)/(chest*.35))*smooth((row-armTop+.045)/.045)*(1-smooth((row-armBottom)/.06));
      let factor=factors.torso+(factors.head-factors.torso)*head;
      factor+=(factors.legs-factor)*legs;
      factor+=(factors.feet-factor)*feet;
      factor+=(factors.arms-factor)*arms;
      if(anatomyStyle)factor*=anatomicalDepth({row,x:(x/part.size[0]-center)/Math.max(.001,chest*.5),arms,front:i<half,style:anatomyStyle,strength:anatomyStrength,currentDepth:depthEnvelope,sideCalibrated:!!part.profile.side});
      const dz=i<half?facialOffset(x/part.size[0]+.5,row,Math.abs(z-p.getZ(other)),part.size[1],facial,!!part.profile.side):0;
      positions.push(x,y,mid+(z-mid)*factor+dz);
      texcoords.push(uv.getX(i),uv.getY(i));
    }
    let matId=id.slice(0,75)+'-refined';
    for(let i=2;project.materials.some(m=>m.id===matId);i++)matId=id.slice(0,75)+'-refined-'+i;
    const material=project.materials.find(m=>m.id===part.material);
    let baseColorImage=obj.material.modelLabImage;
    if(reproject&&part.profile.side){
      const refs=new Map(project.references.map(r=>[r.id,r])),side=part.profile.side,back=part.profile.back;
      projectionGeometry=g.clone();projectionGeometry.setAttribute('position',new Float32BufferAttribute(positions,3));projectionGeometry.computeVertexNormals();
      baseColorImage=characterJPEG(refs.get(part.profile.reference),part.profile.points,back?{...back,ref:refs.get(back.reference)}:undefined,{geometry:projectionGeometry,size:part.size,detail:part.profile.detail,side:{...side,ref:refs.get(side.reference)}},{fresh:true});
    }
    project.materials.push({...material,id:matId,name:'Textura refinada',baseColorImage});
    part.origin=part.profile.back?'two-view-humanoid':'single-view-humanoid';
    part.sideCalibrated=!!part.profile.side;
    delete part.profile;
    part.shape='mesh';part.size=[1,1,1];part.material=matId;
    part.geometry={positions,uv:texcoords,indices:Array.from(g.index.array)};
    validate(project,{empty:false});serializeProject(project,false);return project;
  }finally{projectionGeometry?.dispose();faceGeometry?.dispose();scene.dispose();}
}
