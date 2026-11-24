// REXX-TRAIN-06 — conservative indexed mesh cleanup and edge collapse.
// Never weld equal positions with distinct UV/normals. Skinning must be generated AFTER this stage.
import {validate,serializeProject} from './model.js';
import {validateRig} from './rig.js';
import {trainingPreset} from './reference-training.js';
export const REFERENCE_WELD_STATS=Object.freeze([
 {id:'corsair',vertices:20641,positions:4526,fullAttributes:20628},
 {id:'denim',vertices:194071,positions:147921,fullAttributes:194071},
 {id:'harbinger',vertices:21981,positions:5026,fullAttributes:21971},
 {id:'rustbound',vertices:1434,positions:430,fullAttributes:1434}
].map(Object.freeze));
const sub=(a,b)=>a.map((x,i)=>x-b[i]),dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm=a=>Math.hypot(...a),edgeKey=(a,b)=>a<b?a+':'+b:b+':'+a;
const oriented=(a,b,c)=>a<=b&&a<=c?a+':'+b+':'+c:b<=c?b+':'+c+':'+a:c+':'+a+':'+b;
function bbox(p){
 const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
 for(const q of p)for(let k=0;k<3;k++){lo[k]=Math.min(lo[k],q[k]);hi[k]=Math.max(hi[k],q[k]);}
 return Math.max(norm(sub(hi,lo)),1e-9);
}
function compact(p,uv,normals,faces){
 const remap=new Map(),positions=[],tex=[],ns=[],indices=[];
 for(const f of faces)for(const i of f){
  if(!remap.has(i)){remap.set(i,positions.length/3);positions.push(...p[i]);if(uv)tex.push(...uv[i]);if(normals)ns.push(...normals[i]);}
  indices.push(remap.get(i));
 }
 return {positions,indices,...(uv?{uv:tex}:{}),...(normals?{normals:ns}:{})};
}
export function optimizeGeometry(g,{targetTriangles,ratio=.65,maxRounds=8,maxEdge=.045,normalCos=.94,uvTolerance=.035,protectedPoints=[],protectRadius=.035}={}){
 if(!g||!Array.isArray(g.positions)||g.positions.length<9||g.positions.length%3||!g.positions.every(Number.isFinite))throw Error('Posições inválidas.');
 const count=g.positions.length/3,src=g.indices??Array.from({length:count},(_,i)=>i);
 if(!Array.isArray(src)||src.length%3||!src.length||!src.every(i=>Number.isInteger(i)&&i>=0&&i<count))throw Error('Índices inválidos.');
 for(const [key,size] of [['uv',2],['normals',3]])if(g[key]!==undefined&&(!Array.isArray(g[key])||g[key].length!==count*size||!g[key].every(Number.isFinite)))throw Error('Atributo inválido: '+key);
 if(!Number.isFinite(ratio)||ratio<=0||ratio>1||!Number.isInteger(maxRounds)||maxRounds<0||maxRounds>20||!Number.isFinite(maxEdge)||maxEdge<=0||maxEdge>.15||!Number.isFinite(normalCos)||normalCos<.5||normalCos>1||!Number.isFinite(uvTolerance)||uvTolerance<0||uvTolerance>.25||!Number.isFinite(protectRadius)||protectRadius<0||protectRadius>.25||!Array.isArray(protectedPoints)||protectedPoints.some(q=>!Array.isArray(q)||q.length!==3||!q.every(Number.isFinite)))throw Error('Opções de otimização inválidas.');
 const target=targetTriangles??Math.max(1,Math.floor(src.length/3*ratio));
 if(!Number.isInteger(target)||target<1)throw Error('Meta de triângulos inválida.');
 const p=[],uv=g.uv?[]:null,ns=g.normals?[]:null,keys=new Map(),remap=[];
 for(let i=0;i<count;i++){
  const q=g.positions.slice(i*3,i*3+3),t=g.uv?.slice(i*2,i*2+2),n=g.normals?.slice(i*3,i*3+3);
  const key=[...q,...(t??[]),...(n??[])].join(',');
  if(!keys.has(key)){keys.set(key,p.length);p.push(q);if(uv)uv.push(t);if(ns)ns.push(n);}
  remap.push(keys.get(key));
 }
 const diagonal=bbox(p),areaMin=diagonal**2*1e-12;
 const normal=f=>cross(sub(p[f[1]],p[f[0]]),sub(p[f[2]],p[f[0]]));
 const uvArea=f=>{const a=sub(uv[f[1]],uv[f[0]]),b=sub(uv[f[2]],uv[f[0]]);return a[0]*b[1]-a[1]*b[0];};
 let faces=[],degenerate=0,duplicate=0,seen=new Set();
 for(let i=0;i<src.length;i+=3){
  const f=src.slice(i,i+3).map(j=>remap[j]);
  if(new Set(f).size!==3||norm(normal(f))<=areaMin){degenerate++;continue;}
  const k=oriented(...f);if(seen.has(k)){duplicate++;continue;}seen.add(k);faces.push(f);
 }
 if(!faces.length)throw Error('A limpeza removeria toda a malha.');
 const cleanTriangles=faces.length,cleanVertices=p.length;
 // Distinct attributes at one position denote a seam or sharp edge: freeze all copies.
 const samePosition=new Map(),seams=new Set();
 for(let i=0;i<p.length;i++){
  const k=p[i].join(',');
  if(samePosition.has(k)){seams.add(i);seams.add(samePosition.get(k));}else samePosition.set(k,i);
 }
 const protectedIds=new Set();
 if(protectedPoints.length)for(let i=0;i<p.length;i++)if(protectedPoints.some(q=>norm(sub(p[i],q))<=diagonal*protectRadius))protectedIds.add(i);
 let collapses=0,rounds=0,boundaryCount=0;
 for(;rounds<maxRounds&&faces.length>target;rounds++){
  const edges=new Map(),inc=new Map(),neighbors=new Map(),locked=new Set([...seams,...protectedIds]),fn=faces.map(normal);
  function link(a,b,fi){
   const key=edgeKey(a,b);if(!edges.has(key))edges.set(key,{a:Math.min(a,b),b:Math.max(a,b),faces:[]});
   edges.get(key).faces.push(fi);
   if(!neighbors.has(a))neighbors.set(a,new Set());neighbors.get(a).add(b);
   if(!neighbors.has(b))neighbors.set(b,new Set());neighbors.get(b).add(a);
  }
  faces.forEach((f,fi)=>{for(let k=0;k<3;k++){const a=f[k];if(!inc.has(a))inc.set(a,[]);inc.get(a).push(fi);link(a,f[(k+1)%3],fi);}});
  for(const e of edges.values()){
   let hard=e.faces.length!==2;
   if(!hard){const [a,b]=e.faces.map(i=>fn[i]);hard=dot(a,b)/(norm(a)*norm(b))<normalCos;}
   if(hard){locked.add(e.a);locked.add(e.b);}
  }
  boundaryCount=Math.max(boundaryCount,locked.size);
  const candidates=[];
  for(const e of edges.values()){
   if(e.faces.length!==2||locked.has(e.a)||locked.has(e.b))continue;
   const d=norm(sub(p[e.a],p[e.b]));
   if(d>diagonal*maxEdge||uv&&norm(sub(uv[e.a],uv[e.b]))>uvTolerance)continue;
   const common=[...neighbors.get(e.a)].filter(n=>neighbors.get(e.b).has(n));
   if(common.length!==2)continue; // manifold link condition
   candidates.push({...e,d});
  }
  candidates.sort((a,b)=>a.d-b.d||a.a-b.a||a.b-b.b);
  const busy=new Set(),replace=new Map();let removed=0;
  for(const {a,b} of candidates){
   if(faces.length-removed-2<target)break;
   const ring=new Set([a,b,...neighbors.get(a),...neighbors.get(b)]);
   if([...ring].some(i=>busy.has(i)))continue;
   let ok=true;
   for(const fi of inc.get(b)){
    const f=faces[fi];if(f.includes(a))continue;
    const next=f.map(i=>i===b?a:i),nn=normal(next),old=fn[fi];
    if(norm(nn)<=areaMin||dot(nn,old)/(norm(nn)*norm(old))<normalCos){ok=false;break;}
    if(uv){const u=uvArea(f),v=uvArea(next);if(Math.abs(u)>1e-12&&(u*v<=0||Math.abs(v)<Math.abs(u)*.15)){ok=false;break;}}
   }
   if(!ok)continue;
   replace.set(b,a);for(const i of ring)busy.add(i);removed+=2;
  }
  if(!replace.size)break;
  faces=faces.map(f=>f.map(i=>replace.get(i)??i)).filter(f=>new Set(f).size===3);
  collapses+=replace.size;
 }
 const geometry=compact(p,uv,ns,faces);
 return {geometry,report:{before:{vertices:count,triangles:src.length/3},after:{vertices:geometry.positions.length/3,triangles:faces.length},welded:count-cleanVertices,degenerate,duplicate,cleanTriangles,collapses,rounds,lockedSeamVertices:seams.size,protectedVertices:protectedIds.size,maxLockedVertices:boundaryCount,targetTriangles:target,targetReached:faces.length<=target}};
}
export function optimizeProject(source,{id,ratio,targetTriangles,preset='balanced',rig,...options}={}){
 const project=structuredClone(validate(source,{empty:false}));
 if(rig)validateRig(rig);
 const selected=project.parts.filter(p=>p.shape==='mesh'&&(!id||p.id===id));
 if(!selected.length)throw Error('Selecione uma malha editável; perfis devem ser refinados antes.');
 const budget=trainingPreset(preset).triangles;
 const reports=[];
 for(const part of selected){
  const before=(part.geometry.indices?.length??part.geometry.positions.length/3)/3;
  // Budget is per selected mesh, not the sum of an entire scene.
  const target=targetTriangles??(ratio===undefined?Math.min(before,budget):undefined);
  const jointPoints=rig?.partId===part.id?rig.bones.map(b=>b.position.map((v,i)=>v/part.size[i])):[];
  const result=optimizeGeometry(part.geometry,{...options,ratio:ratio??.65,targetTriangles:target,protectedPoints:[...(options.protectedPoints??[]),...jointPoints]});
  part.geometry=result.geometry;reports.push({id:part.id,...result.report});
 }
 validate(project,{empty:false});serializeProject(project,false);
 return {project,report:{preset,parts:reports,warnings:['Simplificação conservadora: pode parar antes da meta.','Rig opcional protege regiões próximas aos ossos; pesos serão recalculados na exportação.','Não faz retopologia quad, união booleana de superfícies ou importação direta de FBX/GLB com skin.']}};
}
