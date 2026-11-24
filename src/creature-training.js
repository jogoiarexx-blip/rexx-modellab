// TRAIN-11: criaturas paramétricas estáticas, com eixos Y para cima e +Z para frente.
import {defaults,makePart,validate,serializeProject} from './model.js';
import {pixels} from './raster.js';
const presets={
 dog:{height:.65,length:1.05,width:.36,leg:.55,neck:.24,head:.29,muzzle:.24,tail:.65,ear:.17,horn:0,wing:0,color:'#a67d54',accent:'#513a2c'},
 wolf:{height:.85,length:1.35,width:.39,leg:.57,neck:.32,head:.31,muzzle:.30,tail:.78,ear:.22,horn:0,wing:0,color:'#777d82',accent:'#41484e'},
 horse:{height:1.55,length:1.75,width:.37,leg:.63,neck:.57,head:.32,muzzle:.31,tail:.76,ear:.13,horn:0,wing:0,color:'#80543b',accent:'#342820'},
 beast:{height:1.35,length:1.85,width:.64,leg:.47,neck:.24,head:.38,muzzle:.27,tail:.83,ear:.08,horn:.32,wing:0,color:'#656852',accent:'#353b32'},
 dragon:{height:1.8,length:2.4,width:.58,leg:.42,neck:.68,head:.36,muzzle:.35,tail:1.5,ear:0,horn:.32,wing:1.55,color:'#55715c',accent:'#30483b'}
};
export const creatureSpecies=()=>Object.keys(presets);
const finite=(v,a,b)=>typeof v==='number'&&Number.isFinite(v)&&v>=a&&v<=b;
const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),scale=(a,s)=>a.map(v=>v*s),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=a=>{const l=Math.hypot(...a);if(l<1e-8)throw Error('Segmento nulo.');return scale(a,1/l);};
function tube(path,radii,sides){
 const positions=[],uv=[],indices=[];
 // Tubos fechados, seção elíptica e costura UV. Eixo X estável para trajetórias no plano YZ.
 for(let i=0;i<path.length;i++){
  const tangent=unit(sub(path[Math.min(i+1,path.length-1)],path[Math.max(0,i-1)]));
  const normal=unit(cross(Math.abs(tangent[0])>.95?[0,1,0]:[1,0,0],tangent));
  const binormal=cross(tangent,normal);
  for(let j=0;j<=sides;j++){
   const t=j/sides*Math.PI*2,point=add(path[i],add(scale(normal,Math.cos(t)*radii[i][0]),scale(binormal,Math.sin(t)*radii[i][1])));
   positions.push(...point);uv.push(j/sides,i/(path.length-1));
  }
 }
 for(let i=0;i<path.length-1;i++)for(let j=0;j<sides;j++){
  const a=i*(sides+1)+j,b=a+sides+1;indices.push(a,a+1,b,b,a+1,b+1);
 }
 for(const end of [0,path.length-1]){
  const c=positions.length/3;positions.push(...path[end]);uv.push(.5,.5);
  for(let j=0;j<sides;j++){const a=end*(sides+1)+j;indices.push(c,...(end===0?[a+1,a]:[a,a+1]));}
 }
 return {positions,uv,indices};
}
function wingMesh(vertices,thickness){
 const positions=[],uv=[],indices=[],n=vertices.length;
 // Fan around a central membrane point; two faces and closed perimeter.
 const center=vertices.reduce((s,p)=>add(s,scale(p,1/n)),[0,0,0]);
 const normal=unit(cross(sub(vertices[1],vertices[0]),sub(vertices[2],vertices[0])));
 for(const sign of [1,-1]){
  for(const p of [...vertices,center]){positions.push(...add(p,scale(normal,sign*thickness)));uv.push(.5+Math.atan2(p[1]-center[1],Math.abs(p[0]-center[0])+1e-6)/Math.PI,.5+Math.atan2(p[2]-center[2],Math.abs(p[0]-center[0])+1e-6)/Math.PI);}
 }
 const m=n+1;
 for(let i=0;i<n;i++){const j=(i+1)%n;indices.push(n,i,j,m+n,m+j,m+i,i,m+i,j,j,m+i,m+j);}
 return {positions,uv,indices};
}
function calibrate(reference,height){
 if(!reference||typeof reference!=='object'||!['left','right'].includes(reference.facing))throw Error('Referência exige facing left ou right.');
 const image=pixels(reference.image),{withers,rump,muzzle,groundY}=reference.landmarks??{};
 for(const p of [withers,rump,muzzle])if(!Array.isArray(p)||p.length!==2||!finite(p[0],0,image.width-1)||!finite(p[1],0,image.height-1))throw Error('Marque cernelha, garupa e focinho em pixels.');
 if(!finite(groundY,0,image.height-1)||groundY-withers[1]<10)throw Error('Linha do chão inválida.');
 const direction=reference.facing==='right'?1:-1,den=groundY-withers[1];
 const length=(withers[0]-rump[0])*direction/den*height,headReach=(muzzle[0]-withers[0])*direction/den*height,headY=(groundY-muzzle[1])/den*height;
 if(!finite(length,height*.35,height*2.2)||!finite(headReach,height*.1,height*1.8)||!finite(headY,height*.35,height*2.5))throw Error('Landmarks incompatíveis com quadrúpede lateral.');
 return {ref:{id:'side-guide',name:'Guia lateral',image:reference.image,width:image.width,height:image.height},length,headReach,headY};
}
export function createCreature(options={}){
 if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(k=>!['species','name','height','proportions','quality','color','accent','reference'].includes(k)))throw Error('Receita de criatura inválida.');
 const species=options.species??'wolf',p=presets[species];
 if(!Object.hasOwn(presets,species))throw Error('Espécie desconhecida.');
 const h=options.height??p.height,q=options.quality??'mobile',f={length:1,width:1,legs:1,neck:1,head:1,tail:1,wings:1,...options.proportions};
 if(!finite(h,.1,20)||!['mobile','balanced'].includes(q))throw Error('Altura ou qualidade inválida.');
 for(const [k,v] of Object.entries(f))if(!['length','width','legs','neck','head','tail','wings'].includes(k)||!finite(v,.6,1.5))throw Error('Proporção inválida: '+k);
 const guide=options.reference?calibrate(options.reference,h):null;
 const len=(guide?.length??p.length/p.height*h)*f.length,w=h*p.width*f.width,leg=Math.min(h*.78,h*p.leg*f.legs),neck=h*p.neck*f.neck,head=h*p.head*f.head,tail=h*p.tail*f.tail;
 const project={...defaults(),name:options.name??('Criatura '+species),materials:[{id:'body',name:'Corpo',color:options.color??p.color,roughness:.83,metalness:0},{id:'accent',name:'Detalhes',color:options.accent??p.accent,roughness:.88,metalness:0},{id:'claw',name:'Garras e chifres',color:'#b7a58b',roughness:.72,metalness:0},{id:'eye',name:'Olhos',color:'#17191b',roughness:.25,metalness:0}],parts:[]};
 if(guide)project.references=[guide.ref];
 const root=makePart('creature','Criatura','group','body');project.parts.push(root);
 function piece(id,shape,position,size,material='body',rotation=[0,0,0]){
  const part={...makePart(id,id,shape,material),parent:'creature',position,size,rotation};project.parts.push(part);return part;
 }
 function mesh(id,g,material='body'){const part=piece(id,'mesh',[0,0,0],[1,1,1],material);part.geometry=g;return part;}
 const sides=q==='mobile'?8:14;
 const front=len*.42,rear=-len*.42,bodyY=(h+leg)*.5,bodyH=h-leg;
 piece('torso','sphere',[0,bodyY,0],[w,bodyH,len]);
 piece('chest','sphere',[0,bodyY,front*.78],[w*1.04,bodyH*.99,len*.38]);
 piece('rump','sphere',[0,bodyY,rear*.84],[w*1.02,bodyH*.95,len*.39]);
 const headY=guide?guide.headY+head*.12:h+neck*.50,headZ=guide?front+guide.headReach-head*.4:front+neck*.65;
 mesh('neck',tube([[0,bodyY,front*.8],[0,(bodyY+headY)/2,front+neck*.16],[0,headY,headZ]],[[w*.38,w*.40],[head*.45,head*.48],[head*.35,head*.37]],sides));
 piece('head','sphere',[0,headY,headZ],[head*.95,head*.90,head*1.18]);
 const muzzle=h*p.muzzle*f.head;
 piece('muzzle','sphere',[0,headY-head*.18,headZ+head*.42],[head*.65,head*.54,muzzle],'body');
 piece('nose','sphere',[0,headY-head*.12,headZ+head*.42+muzzle*.42],[head*.40,head*.28,head*.19],'accent');
 for(const s of [-1,1]){
  const k=s<0?'right':'left';
  piece(k+'-eye','sphere',[s*head*.39,headY+head*.15,headZ+head*.20],[head*.15,head*.15,head*.15],'eye');
  if(p.ear)mesh(k+'-ear',tube([[s*head*.28,headY+head*.28,headZ-head*.14],[s*head*.36,headY+h*p.ear*.7+head*.30,headZ-head*.24]],[[head*.20,head*.11],[head*.025,head*.025]],sides),'accent');
  if(p.horn)mesh(k+'-horn',tube([[s*head*.32,headY+head*.3,headZ-head*.15],[s*head*.42,headY+h*p.horn*.55,headZ-head*.36],[s*head*.47,headY+h*p.horn,headZ-head*.55]],[[head*.15,head*.14],[head*.08,head*.08],[head*.012,head*.012]],sides),'claw');
  for(const [limb,z] of [['front',front*.81],['rear',rear*.81]]){
   const x=s*w*.35,thick=w*(species==='horse'?.20:.28),hind=limb==='rear';
   const path=[[x,bodyY,z],[x,leg*.70,z+(hind?len*.10:len*.015)],[x,leg*.33,z-(hind?len*.075:len*.025)],[x,leg*.10,z]];
   mesh(k+'-'+limb+'-leg',tube(path,[[thick,thick],[thick*.7,thick*.72],[thick*.48,thick*.48],[thick*.44,thick*.44]],sides));
   piece(k+'-'+limb+'-paw','sphere',[x,leg*.09,z+thick*.48],[thick*1.48,leg*.18,thick*1.9],'accent');
   if(species==='dragon'||species==='beast')for(let i=-1;i<=1;i++)piece(k+'-'+limb+'-claw-'+(i+1),'sphere',[x+i*thick*.4,leg*.055,z+thick*1.18],[thick*.28,leg*.11,thick*.65],'claw');
  }
  if(p.wing){
   const span=h*p.wing*f.wings,root=[s*w*.40,h*.90,front*.55],elbow=[s*span*.48,h*1.45,front*.24],tip=[s*span,h*1.30,-len*.05],edge=[s*span*.68,h*.83,-len*.43],base=[s*w*.40,h*.72,rear*.65];
   mesh(k+'-wing',wingMesh([root,elbow,tip,edge,base],h*.009),'accent');
   mesh(k+'-wing-bone',tube([root,elbow,tip],[[w*.12,w*.12],[w*.085,w*.085],[w*.024,w*.024]],sides));
   mesh(k+'-wing-rib',tube([elbow,edge],[[w*.07,w*.07],[w*.02,w*.02]],sides));
  }
 }
 mesh('tail',tube([[0,bodyY,rear],[0,bodyY+h*.12,rear-tail*.26],[0,bodyY+h*.18,rear-tail*.56],[0,bodyY+h*.07,rear-tail*.82],[0,bodyY-h*.08,rear-tail]],[[w*.23,w*.23],[w*.18,w*.18],[w*.13,w*.13],[w*.07,w*.07],[w*.015,w*.015]],sides),'accent');
 if(species==='dragon')for(let i=0;i<6;i++){const z=front-i*len*.15;mesh('spine-'+i,tube([[0,h*.95,z],[0,h*(1.08+i*.005),z-len*.07]],[[w*.11,w*.08],[w*.012,w*.012]],sides),'claw');}
 validate(project,{empty:false});serializeProject(project,false);
 return {project,report:{ok:true,species,quality:q,parts:project.parts.length-1,withersHeightMeters:h,torsoLengthMeters:len,calibratedFromSide:!!guide,warning:'Modelo paramétrico estático, peças sobrepostas, não é reconstrução fotográfica de malha única. Rig e animações não humanoides ficam para outra etapa.'}};
}
