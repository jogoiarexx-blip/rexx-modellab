// REXX-TRAIN-01: measured reference corpus; no original meshes or textures included.
// FBX counts use control points, GLB counts use exported vertices (not equivalent).
export const REFERENCE_CORPUS=Object.freeze([
 {id:'glb-dense',format:'glb',triangles:295887,vertices:194071,bones:35,maps:3,maxTexture:2048,clips:0},
 {id:'glb-rigged-a',format:'glb',triangles:9662,vertices:20641,bones:69,maps:3,maxTexture:8192,clips:0},
 {id:'glb-rigged-b',format:'glb',triangles:10301,vertices:21981,bones:68,maps:4,maxTexture:4096,clips:0},
 {id:'glb-simple',format:'glb',triangles:826,vertices:1434,bones:10,maps:1,maxTexture:2048,clips:0},
 {id:'fbx-dense-a',format:'fbx',triangles:2581135,vertices:1289385,bones:0,maps:4,maxTexture:2048,clips:0},
 {id:'fbx-dense-b',format:'fbx',triangles:715150,vertices:357561,bones:0,maps:4,maxTexture:2048,clips:0},
 {id:'fbx-run-a',format:'fbx',triangles:10310,vertices:15109,bones:30,maps:4,maxTexture:2048,clips:1},
 {id:'fbx-run-b',format:'fbx',triangles:10318,vertices:18919,bones:66,maps:4,maxTexture:2048,clips:1},
 {id:'fbx-run-c',format:'fbx',triangles:246994,vertices:130964,bones:32,maps:4,maxTexture:2048,clips:1}
].map(Object.freeze));
// Budgets are engineering targets, not claims about visual fidelity or platform limits.
export const TRAINING_PRESETS=Object.freeze({
 mobile:Object.freeze({triangles:12000,texture:1024,bytes:8*1024*1024,detail:0}),
 balanced:Object.freeze({triangles:30000,texture:2048,bytes:24*1024*1024,detail:.16}),
 cinematic:Object.freeze({triangles:300000,texture:4096,bytes:24*1024*1024,detail:.65})
});
export function trainingPreset(name='balanced'){
 if(!Object.hasOwn(TRAINING_PRESETS,name))throw Error('Preset desconhecido: '+name);
 return TRAINING_PRESETS[name];
}
export function budgetReview(stats,name='balanced'){
 const p=trainingPreset(name),warnings=[];
 for(const [field,limit] of [['triangles',p.triangles],['bytes',p.bytes],['maxTexture',p.texture]]){
  if(Number.isFinite(stats[field])&&stats[field]>limit)warnings.push({field,actual:stats[field],limit});
 }
 return {preset:name,targets:p,withinMeasuredBudget:warnings.length===0,warnings,notMeasured:['triangles','bytes','maxTexture'].filter(k=>!Number.isFinite(stats[k]))};
}
export function photoTrainingOptions(name,explicitDetail){
 const p=trainingPreset(name);
 return {detail:explicitDetail??p.detail};
}
function bytesOf(input){
 if(input instanceof ArrayBuffer)return new Uint8Array(input);
 if(ArrayBuffer.isView(input))return new Uint8Array(input.buffer,input.byteOffset,input.byteLength);
 throw Error('Informe bytes GLB.');
}
function textureSize(b){
 if(b.length>=24&&b[0]===137&&b[1]===80&&b[2]===78&&b[3]===71){
  const v=new DataView(b.buffer,b.byteOffset,b.byteLength);return [v.getUint32(16),v.getUint32(20)];
 }
 if(b[0]===255&&b[1]===216){
  let i=2;while(i+4<=b.length){
   if(b[i++]!==255)break;
   while(b[i]===255)i++;
   const m=b[i++];if(m===218||m===217)break;
   if(m===1||(m>=208&&m<=215))continue;
   const l=b[i]*256+b[i+1];if(l<2||i+l>b.length)break;
   if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(m)&&l>=8)return [b[i+5]*256+b[i+6],b[i+3]*256+b[i+4]];
   i+=l;
  }
 }
 return null;
}
export function inspectReferenceGLB(input,{preset='balanced'}={}){
 const bytes=bytesOf(input),v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(bytes.length<20||v.getUint32(0,true)!==0x46546c67||v.getUint32(4,true)!==2||v.getUint32(8,true)!==bytes.length)throw Error('GLB 2 inválido.');
 const n=v.getUint32(12,true);
 if(n%4||20+n>bytes.length||v.getUint32(16,true)!==0x4e4f534a)throw Error('JSON GLB inválido.');
 const j=JSON.parse(new TextDecoder().decode(bytes.subarray(20,20+n)));
 let bin=new Uint8Array(),offset=20+n;
 while(offset<bytes.length){
  if(offset+8>bytes.length)throw Error('Chunk truncado.');
  const len=v.getUint32(offset,true),type=v.getUint32(offset+4,true);
  if(len%4||offset+8+len>bytes.length)throw Error('Chunk inválido.');
  if(type===0x004e4942)bin=bytes.subarray(offset+8,offset+8+len);
  offset+=8+len;
 }
 function view(id){
  const b=j.bufferViews?.[id];if(!b||b.buffer!==0)return null;
  const start=b.byteOffset??0,end=start+b.byteLength;
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<start||end>bin.length)return null;
  return bin.subarray(start,end);
 }
 let vertices=0,triangles=0,skinnedPrimitives=0,unsupportedPrimitives=0,weightedVertices=0,invalidWeights=0,maxWeightError=0;
 const influences=[0,0,0,0,0];
 for(const m of j.meshes??[])for(const p of m.primitives??[]){
  const count=j.accessors?.[p.attributes?.POSITION]?.count??0,ic=p.indices===undefined?count:j.accessors?.[p.indices]?.count??0;
  if(!Number.isSafeInteger(count)||!Number.isSafeInteger(ic)||count<0||ic<0)throw Error('Contagem de accessor inválida.');
  vertices+=count;
  const mode=p.mode??4;if(mode===4)triangles+=Math.floor(ic/3);else if(mode===5||mode===6)triangles+=Math.max(0,ic-2);else unsupportedPrimitives++;
  if(p.attributes?.JOINTS_0===undefined||p.attributes?.WEIGHTS_0===undefined)continue;
  skinnedPrimitives++;
  const a=j.accessors?.[p.attributes.WEIGHTS_0],b=view(a?.bufferView);
  const size=({5126:4,5121:1,5123:2})[a?.componentType];
  if(!a||!b||!size||a.sparse||a.type!=='VEC4'||a.count!==count||(size!==4&&!a.normalized))continue;
  const stride=j.bufferViews[a.bufferView].byteStride??size*4,start=a.byteOffset??0;
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(stride)||start<0||stride<size*4||start+Math.max(0,count-1)*stride+size*4>b.length)continue;
  const d=new DataView(b.buffer,b.byteOffset,b.byteLength);
  for(let i=0;i<count;i++){
   let sum=0,active=0,bad=false;
   for(let k=0;k<4;k++){
    const at=start+i*stride+k*size,w=size===4?d.getFloat32(at,true):size===2?d.getUint16(at,true)/65535:d.getUint8(at)/255;
    if(!Number.isFinite(w)||w<0||w>1)bad=true;
    if(w>1e-6)active++;sum+=w;
   }
   const error=Math.abs(sum-1);if(!Number.isFinite(error)||error>.01||bad)invalidWeights++;
   if(Number.isFinite(error))maxWeightError=Math.max(maxWeightError,error);
   influences[active]++;weightedVertices++;
  }
 }
 const images=(j.images??[]).map(im=>{
  const b=view(im.bufferView),size=b?textureSize(b):null;
  return {mimeType:im.mimeType??null,bytes:b?.length??null,width:size?.[0]??null,height:size?.[1]??null};
 });
 const known=images.flatMap(i=>i.width&&i.height?[Math.max(i.width,i.height)]:[]);
 const maxTexture=known.length?Math.max(...known):images.length?null:0;
 const stats={bytes:bytes.length,vertices,triangles,unsupportedPrimitives,meshes:j.meshes?.length??0,bones:new Set((j.skins??[]).flatMap(s=>s.joints??[])).size,skins:j.skins?.length??0,clips:(j.animations??[]).map(a=>a.name??'unnamed'),materials:j.materials?.length??0,images,maxTexture,textureBytes:images.reduce((s,i)=>s+(i.bytes??0),0),unknownImageSizes:images.length-known.length,skinnedPrimitives,weightedVertices,invalidWeights,maxWeightError,influences};
 return {schema:'rexx-reference-report-1',...stats,budget:budgetReview(stats,preset),limitations:['Contagem por malha, não por instância de cena.','Pesos sparse/comprimidos e imagens externas não são decodificados.','Auditoria estrutural não mede qualidade visual nem valida o movimento.']};
}
