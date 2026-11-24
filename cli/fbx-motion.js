// Binary FBX 7400, single baked animation layer. No meshes or textures are loaded.
import {inflateSync} from 'node:zlib';
const TICKS=46186158000;
const allowed=new Set(['Objects','Connections','Model','AnimationStack','AnimationLayer','AnimationCurveNode','AnimationCurve','Properties70','Pose','PoseNode']);
const leaves=new Set(['P','C','KeyTime','KeyValueFloat','Node','Matrix']);
export function parseMotionFBX(input){
 const b=Buffer.isBuffer(input)?input:Buffer.from(input);
 if(b.length<40||b.length>128*1024*1024||b.subarray(0,23).toString('latin1')!=='Kaydara FBX Binary  \x00\x1a\x00'||b.readUInt32LE(23)!==7400)throw Error('Use FBX binário 7400 de uma camada, até 128 MiB.');
 const need=(o,n,end)=>{if(!Number.isSafeInteger(o)||n<0||o+n>end)throw Error('FBX truncado.');};
 function props(start,end,count,name){
  const p=[];let o=start;
  if(count>100000)throw Error('Propriedades demais.');
  for(let i=0;i<count;i++){
   need(o,1,end);const t=String.fromCharCode(b[o++]);
   const widths={Y:2,C:1,I:4,L:8,F:4,D:8};
   if(widths[t]){
    const n=widths[t];need(o,n,end);
    p.push(t==='Y'?b.readInt16LE(o):t==='C'?b[o]:t==='I'?b.readInt32LE(o):t==='L'?Number(b.readBigInt64LE(o)):t==='F'?b.readFloatLE(o):b.readDoubleLE(o));o+=n;
   }else if(t==='S'||t==='R'){
    need(o,4,end);const n=b.readUInt32LE(o);o+=4;need(o,n,end);p.push(t==='S'?b.toString('utf8',o,o+n):null);o+=n;
   }else if('fdlibc'.includes(t)){
    need(o,12,end);const n=b.readUInt32LE(o),enc=b.readUInt32LE(o+4),len=b.readUInt32LE(o+8);o+=12;need(o,len,end);
    if(['KeyTime','KeyValueFloat','Matrix'].includes(name)){
     const size={f:4,d:8,l:8,i:4,b:1,c:1}[t];
     if(n>100000||enc>1)throw Error('Array FBX incompatível.');
     const raw=enc?inflateSync(b.subarray(o,o+len),{maxOutputLength:n*size}):b.subarray(o,o+len);
     if(raw.length!==n*size)throw Error('Array FBX inválido.');
     const a=Array.from({length:n},(_,j)=>t==='f'?raw.readFloatLE(j*4):t==='d'?raw.readDoubleLE(j*8):t==='l'?Number(raw.readBigInt64LE(j*8)):t==='i'?raw.readInt32LE(j*4):raw[j]);
     if(!a.every(Number.isFinite))throw Error('Array FBX não finito.');p.push(a);
    }
    o+=len;
   }else throw Error('Tipo FBX desconhecido: '+t);
  }
  if(o!==end)throw Error('Comprimento de propriedades FBX inválido.');
  return p;
 }
 function walk(start,stop,depth=0){
  if(depth>12)throw Error('Hierarquia FBX profunda.');
  const nodes=[];
  for(let o=start;o+13<=stop;){
   const end=b.readUInt32LE(o),count=b.readUInt32LE(o+4),len=b.readUInt32LE(o+8),nl=b[o+12];
   if(!end)break;
   if(end<=o||end>stop||o+13+nl+len>end)throw Error('Nó FBX inválido.');
   const name=b.toString('utf8',o+13,o+13+nl),ps=o+13+nl,pe=ps+len;
   if(allowed.has(name)||leaves.has(name)){
    const p=props(ps,pe,count,name),children=allowed.has(name)?walk(pe,end,depth+1):[];
    nodes.push({name,p,children});
   }
   o=end;
  }
  return nodes;
 }
 const root=walk(27,b.length),objects=root.find(n=>n.name==='Objects')?.children??[],connections=root.find(n=>n.name==='Connections')?.children??[];
 const getProps=n=>Object.fromEntries((n.children.find(c=>c.name==='Properties70')?.children??[]).filter(x=>x.name==='P').map(x=>[x.p[0],x.p.slice(4)]));
 const clean=s=>String(s).split('\x00')[0];
 const models=objects.filter(n=>n.name==='Model'),stacks=objects.filter(n=>n.name==='AnimationStack'),layers=objects.filter(n=>n.name==='AnimationLayer');
 if(stacks.length!==1||layers.length!==1||models.length>512)throw Error('FBX precisa ter uma animação e uma camada.');
 const idmap=new Map(models.map(n=>[n.p[0],n])),curveNodes=new Set(objects.filter(n=>n.name==='AnimationCurveNode').map(n=>n.p[0]));
 const curves=new Map(objects.filter(n=>n.name==='AnimationCurve').map(n=>[n.p[0],{times:n.children.find(x=>x.name==='KeyTime')?.p[0],values:n.children.find(x=>x.name==='KeyValueFloat')?.p[0]}]));
 const parent=new Map(),targets=new Map(),axes=new Map();
 for(const c of connections){
  const [kind,a,d,prop]=c.p;
  if(kind==='OO'&&idmap.has(a)&&idmap.has(d))parent.set(a,d);
  if(kind==='OP'&&curveNodes.has(a)&&idmap.has(d)&&['Lcl Rotation','Lcl Translation'].includes(prop))targets.set(a,{id:d,prop});
  if(kind==='OP'&&curves.has(a)&&curveNodes.has(d)&&/^d\|[XYZ]$/.test(prop)){if(!axes.has(d))axes.set(d,{});axes.get(d)[prop.at(-1)]=curves.get(a);}
 }
 const binds=new Map();
 for(const pose of objects.filter(n=>n.name==='Pose'&&n.p[2]==='BindPose'))for(const pn of pose.children.filter(n=>n.name==='PoseNode')){
  const id=pn.children.find(x=>x.name==='Node')?.p[0],m=pn.children.find(x=>x.name==='Matrix')?.p[0];if(idmap.has(id)&&m?.length===16)binds.set(id,m);
 }
 const nodes=models.filter(n=>n.p[2]!=='Mesh').map(n=>{
  const p=getProps(n),v=(key,d)=>p[key]??d;
  for(const k of ['RotationPivot','ScalingPivot','RotationOffset','ScalingOffset'])if(v(k,[0,0,0]).some(x=>Math.abs(x)>1e-7))throw Error('Pivôs FBX não suportados.');
  const scale=v('Lcl Scaling',[1,1,1]);if(scale.some(x=>Math.abs(x-1)>1e-4))throw Error('Escala FBX não unitária.');
  return {id:n.p[0],name:clean(n.p[1]),parent:parent.get(n.p[0])??null,translation:v('Lcl Translation',[0,0,0]),rotation:v('Lcl Rotation',[0,0,0]),pre:v('PreRotation',[0,0,0]),post:v('PostRotation',[0,0,0]),order:v('RotationOrder',[0])[0],bind:binds.get(n.p[0])??null,tracks:{}};
 });
 const byId=new Map(nodes.map(n=>[n.id,n]));
 for(const [id,t] of targets){
  const n=byId.get(t.id),a=axes.get(id);if(!n||!a)continue;
  const key=t.prop==='Lcl Rotation'?'rotation':'translation';
  if(n.tracks[key])throw Error('Trilhas duplicadas.');
  n.tracks[key]=a;
 }
 let min=Infinity,max=-Infinity,keys=0,rotationTracks=0;
 for(const n of nodes)for(const [type,track] of Object.entries(n.tracks)){
  if(type==='rotation')rotationTracks++;
  for(const c of Object.values(track)){
   if(!Array.isArray(c.times)||!Array.isArray(c.values)||!c.times.length||c.times.length!==c.values.length||c.times.some((x,i)=>!Number.isSafeInteger(x)||(i>0&&x<=c.times[i-1])))throw Error('Curva FBX inválida.');
   min=Math.min(min,c.times[0]);max=Math.max(max,c.times.at(-1));keys+=c.times.length;
  }
 }
 const d=(max-min)/TICKS;if(!rotationTracks||!Number.isFinite(d)||d<=0||d>60)throw Error('Duração FBX inválida (máx. 60 segundos).');
 return {name:clean(stacks[0].p[1]),nodes,start:min,duration:d,ticksPerSecond:TICKS,stats:{rotationTracks,keys,bindMatrices:binds.size}};
}
