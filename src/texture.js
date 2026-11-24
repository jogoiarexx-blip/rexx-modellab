// Ferramentas de textura 0.13, sem dependências novas. UVs na convenção do ModelLab.
import {buildScene,validate,serializeProject} from './model.js';
import {pixels,compress,jpegBytes} from './raster.js';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const TEXTURE_PRESETS=Object.freeze({mobile:{maxSide:512,quality:78},balanced:{maxSide:1024,quality:86},cinematic:{maxSide:2048,quality:94}});
function settings(options={}){
 const base=TEXTURE_PRESETS[options.preset??'balanced'];
 if(!base)throw Error('Preset de textura desconhecido.');
 const maxSide=options.maxSide??base.maxSide,quality=options.quality??base.quality;
 if(!Number.isInteger(maxSide)||maxSide<64||maxSide>2048||!Number.isInteger(quality)||quality<40||quality>100)throw Error('Resolução ou qualidade inválida.');
 return {maxSide,quality};
}
function raster(width,height){return {width,height,data:new Uint8Array(width*height*4)};}
function resize(im,maxSide){
 const ratio=Math.min(1,maxSide/Math.max(im.width,im.height));
 if(ratio===1)return {width:im.width,height:im.height,data:new Uint8Array(im.data)};
 const w=Math.max(1,Math.round(im.width*ratio)),h=Math.max(1,Math.round(im.height*ratio)),out=raster(w,h);
 // Média de área: reduz aliasing quando a textura diminui.
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const x0=Math.floor(x*im.width/w),x1=Math.ceil((x+1)*im.width/w),y0=Math.floor(y*im.height/h),y1=Math.ceil((y+1)*im.height/h),sum=[0,0,0,0];let total=0;
  for(let sy=y0;sy<y1;sy++)for(let sx=x0;sx<x1;sx++){
   const weight=(Math.min((x+1)*im.width/w,sx+1)-Math.max(x*im.width/w,sx))*(Math.min((y+1)*im.height/h,sy+1)-Math.max(y*im.height/h,sy));
   for(let c=0;c<4;c++)sum[c]+=im.data[(sy*im.width+sx)*4+c]*weight;total+=weight;
  }
  for(let c=0;c<4;c++)out.data[(y*w+x)*4+c]=Math.round(sum[c]/total);
 }
 return out;
}
function color(hex){
 if(typeof hex!=='string'||!/^#[0-9a-f]{6}$/i.test(hex))throw Error('Cor inválida.');
 return [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
}
export function editImage(uri,{preset='balanced',maxSide,quality,brightness=0,contrast=1,sharpen=0,patches=[]}={}){
 const opts=settings({preset,maxSide,quality});
 if(!Number.isFinite(brightness)||Math.abs(brightness)>80||!Number.isFinite(contrast)||contrast<.5||contrast>2||!Number.isFinite(sharpen)||sharpen<0||sharpen>1||!Array.isArray(patches)||patches.length>128)throw Error('Ajustes de imagem inválidos.');
 const im=resize(pixels(uri),opts.maxSide),{width:w,height:h,data}=im,src=new Uint8Array(data);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)for(let c=0;c<3;c++){
  const k=(y*w+x)*4+c,v=src[k];
  const avg=(src[(y*w+Math.max(0,x-1))*4+c]+src[(y*w+Math.min(w-1,x+1))*4+c]+src[(Math.max(0,y-1)*w+x)*4+c]+src[(Math.min(h-1,y+1)*w+x)*4+c])/4;
  data[k]=clamp(Math.round((v+(v-avg)*sharpen-128)*contrast+128+brightness),0,255);
 }
 for(const patch of patches){
  const {rect,fill}=patch;
  if(!Array.isArray(rect)||rect.length!==4||!rect.every(v=>Number.isFinite(v)&&v>=0&&v<=1)||rect[0]>=rect[2]||rect[1]>=rect[3])throw Error('Retângulo UV inválido.');
  const rgb=color(fill);
  for(let y=Math.floor(rect[1]*h);y<Math.ceil(rect[3]*h);y++)for(let x=Math.floor(rect[0]*w);x<Math.ceil(rect[2]*w);x++)data.set([...rgb,255],(y*w+x)*4);
 }
 return compress(im,opts.quality);
}
export function proceduralTexture({pattern='fabric',size=256,base='#808080',accent='#606060',seed=1}={}){
 if(!['fabric','metal','stone','checker'].includes(pattern)||!Number.isInteger(size)||size<32||size>1024||!Number.isInteger(seed))throw Error('Material procedural inválido.');
 const a=color(base),b=color(accent),im=raster(size,size);
 let state=seed>>>0;
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  state=(Math.imul(state,1664525)+1013904223)>>>0;const noise=state/4294967296;
  const t=pattern==='checker'?((Math.floor(x/16)+Math.floor(y/16))%2):pattern==='fabric'?.35*(x%3===0)+.35*(y%3===0)+noise*.2:pattern==='metal'?.5+.25*Math.sin(y*.8)+noise*.2:.65*noise+.35*(.5+.5*Math.sin(x*.13+y*.17));
  const k=(y*size+x)*4;for(let c=0;c<3;c++)im.data[k+c]=Math.round(a[c]*(1-t)+b[c]*t);im.data[k+3]=255;
 }
 return compress(im,90);
}
function bake(project,part,obj){
 const g=obj.geometry,p=g.attributes.position,uv=g.attributes.uv,n=g.attributes.normal;
 const unpack=(a,d)=>Array.from({length:a.count*d},(_,i)=>d===2?(i%2?a.getY(i>>1):a.getX(i>>1)):[a.getX(Math.floor(i/3)),a.getY(Math.floor(i/3)),a.getZ(Math.floor(i/3))][i%3]);
 const original=project.materials.find(m=>m.id===part.material);let id=part.id.slice(0,70)+'-texture',i=1;
 while(project.materials.some(m=>m.id===id))id=part.id.slice(0,70)+'-texture-'+i++;
 const mat={...original,id,name:(original.name+' (textura)').slice(0,120)};
 if(obj.material.modelLabImage)mat.baseColorImage=obj.material.modelLabImage;
 project.materials.push(mat);part.material=id;
 if(part.profile?.form==='humanoid'){part.origin=part.profile.back?'two-view-humanoid':'single-view-humanoid';part.sideCalibrated=!!part.profile.side;}
 else if(part.shape==='profile')part.origin='single-view-extrusion';
 part.shape='mesh';part.size=[1,1,1];delete part.profile;
 part.geometry={positions:unpack(p,3),...(uv?{uv:unpack(uv,2)}:{}),...(n?{normals:unpack(n,3)}:{}),...(g.index?{indices:Array.from(g.index.array)}:{})};
 return mat;
}
export function auditUV(project){
 validate(project,{empty:false});const scene=buildScene(project,{textures:false});
 try{
  const parts=[];
  scene.root.traverse(o=>{
   if(!o.isMesh)return;
   const g=o.geometry,p=g.attributes.position,u=g.attributes.uv,idx=g.index?.array,count=idx?.length??p.count;
   let outside=0,degenerate=0,geometricDegenerate=0,min=Infinity,max=0;
   if(u){
    for(let i=0;i<u.count;i++)if(u.getX(i)<-1e-6||u.getX(i)>1+1e-6||u.getY(i)<-1e-6||u.getY(i)>1+1e-6)outside++;
    for(let i=0;i<count;i+=3){
     const a=idx?idx[i]:i,b=idx?idx[i+1]:i+1,c=idx?idx[i+2]:i+2;
     const area=Math.abs((u.getX(b)-u.getX(a))*(u.getY(c)-u.getY(a))-(u.getY(b)-u.getY(a))*(u.getX(c)-u.getX(a)))/2;
     const x=[p.getX(b)-p.getX(a),p.getY(b)-p.getY(a),p.getZ(b)-p.getZ(a)],y=[p.getX(c)-p.getX(a),p.getY(c)-p.getY(a),p.getZ(c)-p.getZ(a)];
     const surface=Math.hypot(x[1]*y[2]-x[2]*y[1],x[2]*y[0]-x[0]*y[2],x[0]*y[1]-x[1]*y[0])/2;
     if(surface<1e-12){geometricDegenerate++;continue;}
     if(area<1e-12){degenerate++;continue;}
     const density=area/surface;min=Math.min(min,density);max=Math.max(max,density);
    }
   }
   const uri=o.material.modelLabImage,im=uri?pixels(uri):null;
   parts.push({id:o.userData.partId,hasUV:!!u,outside,degenerateUV:degenerate,geometricDegenerate,areaDensityRatio:min<Infinity?max/min:null,texture:im?{width:im.width,height:im.height,bytes:jpegBytes(uri).length}:null});
  });return {ok:true,parts,note:'Razão de densidade UV indica variação de escala, não mede sobreposição nem qualidade anatômica.'};
 }finally{scene.dispose();}
}
export function editTextures(source,{preset='balanced',parts,adjustments={},atlas=false,maxSide,quality}={}){
 const opts=settings({preset,maxSide,quality}),project=structuredClone(validate(source,{empty:false}));
 if(parts!==undefined&&(!Array.isArray(parts)||!parts.length||new Set(parts).size!==parts.length||parts.some(id=>!project.parts.some(p=>p.id===id&&p.shape!=='group'))))throw Error('Seleção de peças inválida.');
 if(!adjustments||typeof adjustments!=='object'||Array.isArray(adjustments))throw Error('Ajustes inválidos.');
 if(typeof atlas!=='boolean')throw Error('Atlas inválido.');
 const scene=buildScene(project,{textures:false}),entries=[];
 try{
  for(const part of project.parts){
   if(part.shape==='group'||parts&&!parts.includes(part.id))continue;
   const obj=scene.objects.get(part.id),original=obj.material.modelLabImage,edit=adjustments[part.id]??{};
   if(!original&&!edit.procedural&&!edit.uv)continue;
   const mat=bake(project,part,obj);
   const sourceURI=edit.procedural?proceduralTexture(edit.procedural):original;
   if(sourceURI){
    if(!part.geometry.uv)throw Error('Textura exige UV: '+part.id);
    const next=editImage(sourceURI,{...opts,...edit.image});
    const explicit=edit.image&&Object.keys(edit.image).length>0;
    mat.baseColorImage=!explicit&&!edit.procedural&&jpegBytes(next).length>=jpegBytes(sourceURI).length&&Math.max(pixels(sourceURI).width,pixels(sourceURI).height)<=opts.maxSide?sourceURI:next;
   }
   if(edit.uv){
    const {scale=[1,1],offset=[0,0],flipU=false,flipV=false}=edit.uv;
    if(!part.geometry.uv||![scale,offset].every(a=>Array.isArray(a)&&a.length===2&&a.every(Number.isFinite))||scale.some(v=>v<=0||v>10)||offset.some(v=>Math.abs(v)>10)||typeof flipU!=='boolean'||typeof flipV!=='boolean')throw Error('Transformação UV inválida: '+part.id);
    const uv=part.geometry.uv;
    for(let i=0;i<uv.length;i+=2){uv[i]=(flipU?1-uv[i]:uv[i])*scale[0]+offset[0];uv[i+1]=(flipV?1-uv[i+1]:uv[i+1])*scale[1]+offset[1];}
   }
   if(mat.baseColorImage)entries.push({part,mat,before:original?jpegBytes(original).length:0});
  }
  if(atlas&&entries.length>1){
   if(entries.length>16)throw Error('Atlas aceita até 16 peças.');
   if(entries.some(e=>e.part.geometry.uv.some(v=>v< -1e-6||v>1+1e-6)))throw Error('Corrija UV fora de 0–1 antes do atlas.');
   const cols=Math.ceil(Math.sqrt(entries.length)),rows=Math.ceil(entries.length/cols),cell=Math.floor(opts.maxSide/Math.max(cols,rows)),pad=8;
   const im=raster(cols*cell,rows*cell);
   for(let i=0;i<im.data.length;i+=4)im.data[i+3]=255;
   for(const [i,e] of entries.entries()){
    const tile=resize(pixels(e.mat.baseColorImage),cell-pad*2),ox=(i%cols)*cell+pad,oy=Math.floor(i/cols)*cell+pad;
    for(let y=-pad;y<tile.height+pad;y++)for(let x=-pad;x<tile.width+pad;x++){
     const s=(clamp(y,0,tile.height-1)*tile.width+clamp(x,0,tile.width-1))*4;
     im.data.set(tile.data.subarray(s,s+4),((oy+y)*im.width+ox+x)*4);
    }
    const uv=e.part.geometry.uv;
    for(let k=0;k<uv.length;k+=2){uv[k]=(ox+.5+clamp(uv[k],0,1)*(tile.width-1))/im.width;uv[k+1]=(oy+.5+clamp(uv[k+1],0,1)*(tile.height-1))/im.height;}
   }
   const uri=compress(im,opts.quality);for(const e of entries)e.mat.baseColorImage=uri;
  }
  const used=new Set(project.parts.map(p=>p.material));project.materials=project.materials.filter(m=>used.has(m.id));
  validate(project,{empty:false});serializeProject(project,false);
  const total=uris=>[...new Set(uris)].reduce((s,u)=>s+jpegBytes(u).length,0);
  const after=total(entries.map(e=>e.mat.baseColorImage));
  const before=total(entries.map(e=>scene.objects.get(e.part.id).material.modelLabImage).filter(Boolean));
  return {project,report:{ok:true,editedParts:entries.length,atlas:atlas&&entries.length>1,textureBytesBefore:before,textureBytesAfter:after,textureSavingsBytes:before-after,preset,maxSide:opts.maxSide,quality:opts.quality}};
 }finally{scene.dispose();}
}
export function materialMaps(uri,{strength=2,roughness=.65,maxSide=1024}={}){
 if(!Number.isFinite(strength)||strength<0||strength>8||!Number.isFinite(roughness)||roughness<0||roughness>1)throw Error('Parâmetros de mapas inválidos.');
 settings({maxSide});const im=resize(pixels(uri),maxSide),{width:w,height:h}=im,normal=raster(w,h),rough=raster(w,h),orm=raster(w,h);
 const lum=(x,y)=>{const i=(clamp(y,0,h-1)*w+clamp(x,0,w-1))*4;return (.2126*im.data[i]+.7152*im.data[i+1]+.0722*im.data[i+2])/255;};
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const dx=(lum(x+1,y)-lum(x-1,y))*strength,dy=(lum(x,y+1)-lum(x,y-1))*strength,l=Math.hypot(dx,dy,1),i=(y*w+x)*4;
  normal.data.set([Math.round((-.5*dx/l+.5)*255),Math.round((.5*dy/l+.5)*255),Math.round((.5/l+.5)*255),255],i);
  const r=Math.round(clamp(roughness+(lum(x,y)-.5)*.2,0,1)*255);
  rough.data.set([r,r,r,255],i);orm.data.set([255,r,0,255],i);
 }
 return {normal,roughness:rough,orm};
}
