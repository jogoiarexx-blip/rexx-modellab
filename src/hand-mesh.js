// REXX-TRAIN-05 — articulated procedural hands; overlapping closed components, not welded topology.
import {FINGERS} from './hand-rig.js';
import {validateRig} from './rig.js';
import {validate,serializeProject,buildScene} from './model.js';
// Sums of lengths of Lcl Translation for FBX finger nodes 2–4 (both hands).
export const FINGER_REFERENCE=Object.freeze({
 Thumb:Object.freeze([.038049,.040019]),
 Index:Object.freeze([.042076,.046716]),
 Middle:Object.freeze([.042756,.042756]),
 Ring:Object.freeze([.042756,.042756]),
 Pinky:Object.freeze([.028621,.033781])
});
const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),mul=(a,s)=>a.map(v=>v*s);
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),length=a=>Math.hypot(...a);
const unit=a=>{const n=length(a);if(n<1e-8)throw Error('Direção de mão degenerada.');return mul(a,1/n);};
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const mix=(a,b,t)=>add(a,mul(sub(b,a),t));
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function frame(rig,side){
 const lookup=n=>{const b=rig.bones.find(b=>b.name===side+n);if(!b)throw Error('Use rig detailed de 66 ossos: '+side+n);return b.position;};
 const wrist=lookup('Hand'),tip=lookup('HandEnd'),L=length(sub(tip,wrist)),axis=unit(sub(tip,wrist));
 if(L<.001||Math.abs(axis[0])<.7)throw Error('Mão precisa estar estendida em pose T.');
 const up=unit(sub([0,1,0],mul(axis,axis[1]))),across=unit(cross(axis,up));
 const digits=FINGERS.map(name=>({name,points:[1,2,3,4].map(i=>lookup('Hand'+name+i))}));
 return {wrist,tip,L,axis,up,across,digits};
}
// Rings with consistent winding and capped ends. UV sampled from the old hand,
// intentionally approximate: the source photograph does not describe every finger.
function tube(mesh,centers,radii,up,segments,uvAt){
 const rings=[],first=mesh.positions.length/3;
 function vertex(p){const i=mesh.positions.length/3;mesh.positions.push(...p);if(mesh.uv)mesh.uv.push(...uvAt(p));return i;}
 for(let j=0;j<centers.length;j++){
  const axis=unit(sub(centers[Math.min(j+1,centers.length-1)],centers[Math.max(0,j-1)]));
  const u=unit(sub(up,mul(axis,dot(up,axis)))),v=unit(cross(axis,u)),ring=[];
  for(let k=0;k<segments;k++){
   const a=2*Math.PI*k/segments;
   ring.push(vertex(add(centers[j],add(mul(u,radii[j][0]*Math.cos(a)),mul(v,radii[j][1]*Math.sin(a))))));
  }
  rings.push(ring);
 }
 for(let j=0;j<rings.length-1;j++)for(let k=0;k<segments;k++){
  const n=(k+1)%segments,a=rings[j][k],b=rings[j][n],c=rings[j+1][n],d=rings[j+1][k];
  mesh.indices.push(a,b,c,a,c,d);
 }
 const a=vertex(centers[0]),b=vertex(centers.at(-1));
 for(let k=0;k<segments;k++){
  const n=(k+1)%segments;
  mesh.indices.push(a,rings[0][n],rings[0][k],b,rings.at(-1)[k],rings.at(-1)[n]);
 }
 return {first,vertices:mesh.positions.length/3-first,triangles:2*segments*centers.length};
}
export function buildHandMesh(source,rig,{segments=10,thickness=1}={}){
 validateRig(rig);const project=structuredClone(validate(source,{empty:false})),part=project.parts.find(p=>p.id===rig.partId);
 if(part?.shape!=='mesh'||!['single-view-humanoid','two-view-humanoid'].includes(part.origin))throw Error('Refine primeiro o perfil humanoide para mesh; use o rig gerado nessa mesma malha.');
 if(!Number.isInteger(segments)||segments<6||segments>20||!Number.isFinite(thickness)||thickness<.65||thickness>1.25)throw Error('Parâmetros de mão inválidos.');
 const scene=buildScene(project,{textures:false});
 try{
  const g=scene.objects.get(part.id).geometry,p=g.attributes.position,uv=g.attributes.uv;
  if(!g.index||!uv)throw Error('Malha indexada com UV necessária.');
  const mesh={positions:Array.from(p.array),uv:Array.from(uv.array),indices:Array.from(g.index.array)};
  const original=mesh.positions.slice(),originalCount=original.length/3,report=[];
  for(const side of ['left','right']){
   const f=frame(rig,side),{wrist,L,axis,up}=f;
   const samples=[];let compressed=0;
   for(let i=0;i<originalCount;i++){
    const q=original.slice(i*3,i*3+3),rel=sub(q,wrist),t=dot(rel,axis)/L;
    const radial=length(sub(rel,mul(axis,t*L)))/L;
    if(t>=-.25&&t<=1.4&&radial<1.2)samples.push({q,uv:mesh.uv.slice(i*2,i*2+2)});
    // Keep the original closed body, compress the mitten into the palm.
    if(t>.38&&t<1.4&&radial<1.2){
     const next=.38+.075*(1-Math.exp(-(t-.38)/.22));
     mesh.positions.splice(i*3,3,...add(q,mul(axis,(next-t)*L)));compressed++;
    }
   }
   if(!compressed||!samples.length)throw Error('Não foi encontrada a mão original: '+side);
   const uvAt=q=>{
    let best=samples[0],d=Infinity;
    for(const s of samples){const delta=sub(q,s.q),v=dot(delta,delta);if(v<d){d=v;best=s;}}
    return best.uv;
   };
   // Closed palm overlaps the wrist and finger roots; independent components ease later retopology.
   const palm=tube(mesh,[-.08,.12,.36,.53].map(t=>add(wrist,mul(axis,t*L))),
      [[.085,.13],[.12,.22],[.115,.30],[.075,.28]].map(([a,b])=>[a*L*thickness,b*L*thickness]),up,segments,uvAt);
   const digits=[];
   for(const {name,points} of f.digits){
    const measured=FINGER_REFERENCE[name].reduce((a,b)=>a+b,0)/(.042756*2);
    // Radius is a heuristic scaled by measured relative chain length, not a measured width.
    const radius=L*.052*Math.sqrt(measured)*thickness;
    const c=[mix(points[0],points[1],-.16),points[0],mix(points[0],points[1],.52),points[1],mix(points[1],points[2],.52),points[2],mix(points[2],points[3],.58),points[3]];
    const radii=[.78,1,.88,.92,.76,.81,.64,.31].map(s=>[radius*s*.82,radius*s]);
    const out=tube(mesh,c,radii,up,segments,uvAt);
    digits.push({name,...out});
   }
   report.push({side,compressed,palm,digits});
  }
  part.size=[1,1,1];part.geometry=mesh;
  validate(project,{empty:false});serializeProject(project,false);
  return {project,report:{hands:2,digits:10,components:12,addedVertices:mesh.positions.length/3-originalCount,details:report,warnings:['Componentes fechados sobrepostos; não são uma superfície soldada.','UV dos dedos aproximado por amostragem da mão original.','Use o mesmo rig na exportação, não recalcule após alterar a mão.']}};
 }finally{scene.dispose();}
}
export function gripPose(rig,strength=1){
 validateRig(rig);
 if(!Number.isFinite(strength)||strength<0||strength>1)throw Error('Força da pose deve estar entre 0 e 1.');
 const rotations={};
 for(const side of ['left','right']){
  frame(rig,side);
  const sign=side==='left'?-1:1;
  for(const name of FINGERS)for(let j=1;j<=3;j++){
   const angle=(name==='Thumb'?[25,35,25]:[55,75,50])[j-1]*strength;
   rotations[side+'Hand'+name+j]=[0,0,sign*angle];
  }
 }
 return rotations;
}
