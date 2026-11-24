// TRAIN-08: detalhes de vestuário na superfície de um humanoide em T.
// Usa a mesma topologia frente/costas, UV e escala do refinamento anatômico.
import {validate,serializeProject} from './model.js';
import {refineCharacter} from './refine.js';
import {bounds} from './profile.js';
import {anatomy} from './silhouette.js';
import {pixels,compress} from './raster.js';
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
const bell=(x,c,w)=>Math.exp(-(((x-c)/w)**2));
const range=(x,a,b,w=.025)=>smooth((x-a)/w)*smooth((b-x)/w);
const presets=Object.freeze({
 suit:{folds:.45,lapels:1,pockets:.7,belt:.35,cuffs:.8,plates:0},
 field:{folds:.85,lapels:.35,pockets:1,belt:.9,cuffs:1,plates:0},
 armor:{folds:.25,lapels:0,pockets:.1,belt:1,cuffs:.85,plates:1}
});
function parseOptions(options){
 if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(k=>!['style','strength','tint','tintStrength','features','refine'].includes(k)))throw Error('Opções de roupa inválidas.');
 const {style='suit',strength=.65,tint,tintStrength=.4,features={},refine={}}=options;
 if(!Object.hasOwn(presets,style)||![strength,tintStrength].every(v=>Number.isFinite(v)&&v>=0&&v<=1))throw Error('Estilo ou intensidade inválido.');
 if(tint!==undefined&&(typeof tint!=='string'||!/^#[0-9a-f]{6}$/i.test(tint)))throw Error('Cor inválida.');
 if(!features||typeof features!=='object'||Array.isArray(features))throw Error('Features inválidas.');
 const f={...presets[style],...features};
 for(const [k,v] of Object.entries(f))if(!Object.hasOwn(presets[style],k)||!Number.isFinite(v)||v<0||v>1.5)throw Error('Detalhe inválido: '+k);
 return {style,strength,tint:tint?[1,3,5].map(i=>parseInt(tint.slice(i,i+2),16)):null,tintStrength,features:f,refine};
}
function signals(u,v,front,body,f){
 const x=(u-body.center)/body.halfChest,a=Math.abs(x),arm=range(v,body.armTop-.035,body.armBottom+.045,.03)*smooth((a-.85)/.45);
 const trunk=range(v,body.armTop-.015,.565,.04)*(1-smooth((a-.83)/.4));
 const legs=range(v,.53,.95,.04)*(1-smooth((a-1.25)/.3));
 const clothes=clamp(trunk+arm+legs);
 // Broad details remain visible even with the modest tessellation of a photo mesh.
 const lapel=front?bell(a,.22+(v-body.armTop)*2.2,.15)*range(v,body.armTop,.43,.035)*trunk:0;
 const seam=front?bell(x,0,.075)*range(v,.34,.54,.035)*trunk:bell(x,0,.09)*trunk;
 const pocket=front?bell(v,.43,.018)*bell(a,.65,.26)*trunk:0;
 const belt=bell(v,.535,.019)*(1-smooth((a-.88)/.3));
 const cuff=bell(a,body.edge*.84,.25)*arm+bell(v,.92,.018)*legs;
 const fold=(.5+.5*Math.sin(v*95+a*8))*trunk*.55+(.5+.5*Math.sin(v*83+a*10))*legs*.65+(.5+.5*Math.sin(a*10))*arm*.5;
 const plate=bell(v,.30,.055)*bell(a,.48,.34)*trunk+bell(v,.77,.04)*legs;
 const relief=clamp(.30*f.lapels*lapel+.18*seam+.25*f.pockets*pocket+.30*f.belt*belt+.24*f.cuffs*cuff+.15*f.folds*fold+.38*f.plates*plate,0,.85)*clothes;
 const line=clamp(.55*f.lapels*lapel+.3*seam+.55*f.pockets*pocket+.45*f.belt*belt+.5*f.cuffs*cuff+.3*f.plates*plate)*clothes;
 return {relief,line,clothes};
}
export function trainClothing(source,id='character',options={}){
 validate(source,{empty:false});const opts=parseOptions(options),part=source.parts.find(p=>p.id===id);
 if(part?.shape!=='profile'||part.profile?.form!=='humanoid')throw Error('Use a receita original de perfil humanoide em T; não uma malha já consolidada.');
 const box=bounds(part.profile.points),info=anatomy(part.profile.points);
 const body={center:((info?.center??box.left+box.width/2)-box.left)/box.width,halfChest:(info?.chestWidth??box.width*.31)/box.width*.5,armTop:info?.armTop??.18,armBottom:info?.armBottom??.34};
 body.edge=Math.max(body.center,1-body.center)/body.halfChest;
 const project=refineCharacter(source,id,opts.refine),target=project.parts.find(p=>p.id===id),g=target.geometry;
 const p=g.positions,u=g.uv,n=p.length/6;
 if(!Number.isInteger(n)||u.length!==n*4)throw Error('Topologia incompatível.');
 let affected=0,maxDisplacement=0;
 for(let i=0;i<n;i++){
  const a=i*3,b=(i+n)*3;
  if(Math.abs(p[a]-p[b])+Math.abs(p[a+1]-p[b+1])>1e-6)throw Error('Pares da superfície incompatíveis.');
  const gap=Math.abs(p[a+2]-p[b+2]);if(gap<=1e-7)continue;
  const x=u[i*2]*2,y=u[i*2+1];
  const max=Math.min(part.size[1]*.022,gap*.22)*opts.strength;
  const front=signals(x,y,true,body,opts.features).relief*max,rear=signals(x,y,false,body,opts.features).relief*max;
  p[a+2]+=front;p[b+2]-=rear;if(front+rear>1e-8)affected+=2;
  maxDisplacement=Math.max(maxDisplacement,front,rear);
 }
 delete g.normals;
 const material=project.materials.find(m=>m.id===target.material);
 const original=pixels(material.baseColorImage),data=new Uint8Array(original.data);
 const half=original.width/2;
 if(!Number.isInteger(half))throw Error('Atlas de personagem inválido.');
 if(opts.strength>0)for(let y=0;y<original.height;y++)for(let x=0;x<original.width;x++){
  const front=x<half,s=signals(((x%half)+.5)/half,(y+.5)/original.height,front,body,opts.features),i=(y*original.width+x)*4;
  const shade=1-opts.strength*s.line*.19+opts.strength*s.relief*.10;
  const alpha=opts.tint?opts.tintStrength*s.clothes*opts.strength:0;
  for(let c=0;c<3;c++)data[i+c]=Math.round(clamp((data[i+c]*(1-alpha)+(opts.tint?.[c]??0)*alpha)*shade,0,255));
 }
 if(opts.strength>0)material.baseColorImage=compress({...original,data},94);
 validate(project,{empty:false});serializeProject(project,false);
 return {project,report:{ok:true,style:opts.style,affectedVertices:affected,maxDisplacementMeters:maxDisplacement,vertices:p.length/3,triangles:g.indices.length/3,uvPreserved:true,sideCalibrated:!!part.profile.side,warning:'Relevo procedural sobre a superfície, sem roupas separadas, física de tecido ou detecção de costuras reais.'}};
}
