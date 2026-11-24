#!/usr/bin/env node
// MCP stdio, revisão 2025-11-25. Nenhuma porta de rede ou execução de shell.
import {open,lstat,realpath,mkdir,readdir,link,unlink} from 'node:fs/promises';
import {constants} from 'node:fs';
import {resolve,join,dirname,basename} from 'node:path';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {createProject,photoProject,applyOperations,inspectProject} from '../src/automation.js';
import {serializeProject,MAX_BYTES} from '../src/model.js';
import {jpegURI} from '../src/raster.js';
import {renderViews} from '../src/render.js';
import {encodePNG} from '../cli/png.js';
import {autoRig,adjustRig,previewRig} from '../src/rig.js';
import {previewPose,exportSkinnedGLB,verifySkinnedGLB,hasSkin} from '../src/skin.js';
import {exportGLB,verifyGLB} from '../src/format.js';
import {animationNames,exportAnimatedGLB,previewAnimation} from '../src/animation.js';
import {auditUV,editTextures} from '../src/texture.js';
import {buildCharacterPackage,characterPackageEntries} from '../src/character-pipeline.js';
import {parseMotionFBX} from '../cli/fbx-motion.js';
import {createCreature,creatureSpecies} from '../src/creature-training.js';
import {trainClothing} from '../src/clothing-training.js';
import {refineCharacter} from '../src/refine.js';

const filename=/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,119}$/;
const validName=s=>typeof s==='string'&&filename.test(s)&&!s.includes('..')&&!/[. ]$/.test(s)&&! /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(s);
const LIMIT=MAX_BYTES;
export async function workspace(root,{readOnly=false}={}){
  if(!root)throw Error('Informe --workspace.');
  const abs=resolve(root);
  await mkdir(abs,{recursive:true,mode:0o700});
  const canonical=await realpath(abs);
  if(canonical!==abs)throw Error('Workspace deve ser caminho real, sem symlinks.');
  function path(name){
    if(!validName(name))throw Error('Use nome simples de arquivo dentro do workspace, sem diretórios.');
    return join(canonical,name);
  }
  async function read(name){
    const p=path(name),info=await lstat(p);
    if(!info.isFile()||info.isSymbolicLink()||info.nlink!==1)throw Error('Arquivo regular sem links obrigatório.');
    const fd=await open(p,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
    try{
      const st=await fd.stat();
      if(!st.isFile()||st.nlink!==1||st.ino!==info.ino||st.dev!==info.dev||st.size>LIMIT||await realpath(p)!==p)throw Error('Arquivo inválido ou maior que 24 MiB.');
      const data=Buffer.alloc(st.size);let offset=0;
      while(offset<data.length){const r=await fd.read(data,offset,data.length-offset,offset);if(!r.bytesRead)throw Error('Arquivo alterado durante leitura.');offset+=r.bytesRead;}
      if((await fd.stat()).size!==st.size)throw Error('Arquivo alterado durante leitura.');
      return data;
    }finally{await fd.close();}
  }
  async function write(name,data){
    if(readOnly)throw Error('Workspace somente leitura.');
    const p=path(name),bytes=typeof data==='string'?Buffer.from(data):Buffer.from(data);
    if(bytes.length>LIMIT)throw Error('Saída maior que 24 MiB.');
    // Publicação sem sobrescrever: link falha se o destino já existir, inclusive symlink.
    const tmp=join(canonical,'.modellab-'+randomUUID()+'.tmp');
    let fd;
    try{fd=await open(tmp,'wx',0o600);await fd.writeFile(bytes);await fd.close();fd=null;await link(tmp,p);}
    finally{if(fd)await fd.close();await unlink(tmp).catch(()=>{});}
    return {file:name,bytes:bytes.length};
  }
  return {read,write,readOnly,async list(){
    const entries=await readdir(canonical,{withFileTypes:true});
    const files=[];
    for(const e of entries.filter(e=>e.isFile()&&validName(e.name)).slice(0,1000)){
      const st=await lstat(path(e.name));if(st.isFile()&&!st.isSymbolicLink()&&st.nlink===1)files.push({file:e.name,bytes:st.size});
    }
    return files;
  }};
}
const str=(description,extra={})=>({type:'string',description,...extra});
const obj=description=>({type:'object',description});
const num=(description,minimum,maximum)=>({type:'number',description,minimum,maximum});
const file=description=>str(description,{maxLength:120});
const project=file('Projeto .modellab.json no workspace');
const output=file('Novo nome de saída; nunca sobrescreve arquivo existente');
const rig=file('Esqueleto .rig.json no workspace');
const points={type:'array',minItems:3,maxItems:192,items:{type:'array',minItems:2,maxItems:2,items:{type:'number'}}};
const view={type:'object',properties:{file:file('JPEG'),points,facing:str('Direção do rosto',{enum:['left','right']})},required:['file'],additionalProperties:false};
const views={type:'array',minItems:1,maxItems:5,uniqueItems:true,items:str('Vista',{enum:['front','back','left','right','iso']})};
const preset=str('Perfil de textura',{enum:['mobile','balanced','cinematic']});
const tools=[];
function define(name,description,properties,required,mutates,run){
 tools.push({definition:{name,description,inputSchema:{type:'object',properties,required,additionalProperties:false},annotations:{readOnlyHint:!mutates,destructiveHint:false,openWorldHint:false,idempotentHint:!mutates}},mutates,run});
}
function check(value,s,path='arguments'){
 if(s.type==='object'){
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error(path+' deve ser objeto.');
  for(const k of s.required??[])if(!Object.hasOwn(value,k))throw Error(path+'.'+k+' obrigatório.');
  if(s.properties)for(const [k,v] of Object.entries(value)){
   if(!Object.hasOwn(s.properties,k)){if(s.additionalProperties===false)throw Error('Campo desconhecido: '+path+'.'+k);}
   else check(v,s.properties[k],path+'.'+k);
  }
 }else if(s.type==='array'){
  if(!Array.isArray(value)||value.length<(s.minItems??0)||value.length>(s.maxItems??1000))throw Error(path+' lista inválida.');
  if(s.uniqueItems&&new Set(value).size!==value.length)throw Error(path+' contém duplicatas.');
  if(s.items)for(const v of value)check(v,s.items,path+'[]');
 }else if(s.type==='string'){
  if(typeof value!=='string'||value.length>(s.maxLength??500)||!value.length||s.enum&&!s.enum.includes(value))throw Error(path+' texto inválido.');
 }else if(s.type==='number'){
  if(!Number.isFinite(value)||value<(s.minimum??-1e9)||value>(s.maximum??1e9))throw Error(path+' número inválido.');
 }
}
const parse=async(w,n)=>JSON.parse((await w.read(n)).toString('utf8'));
const save=async(w,n,p)=>w.write(n,serializeProject(p));
const resultText=value=>({content:[{type:'text',text:JSON.stringify(value)}]});
const buffer=b=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);
const renderProps={project,views,size:num('Resolução da prévia, em pixels',64,512)};
function previews(result){
 const content=[{type:'text',text:JSON.stringify(result.report)}];
 for(const image of Object.values(result.images))content.push({type:'image',mimeType:'image/png',data:encodePNG(image).toString('base64')});
 return {content};
}
define('list_files','Lista arquivos locais permitidos.',{},[],false,async w=>resultText(await w.list()));
define('create_project','Cria projeto vazio editável.',{name:str('Nome do modelo',{maxLength:120}),output},['output'],true,async(w,a)=>resultText(await save(w,a.output,createProject(a.name))));
define('photo_character','Reconstrói personagem de JPEG frontal, com costas e lateral opcionais; contornos em pixels.',{front:file('JPEG frontal'),points,back:view,side:view,name:str('Nome',{maxLength:120}),height:num('Altura em metros',.1,10),depth:num('Profundidade em metros',.01,5),volume:num('Volume',.5,1.5),detail:num('Relevo fotográfico',0,1),output},['front','output'],true,async(w,a)=>{
 const readView=async v=>v?{image:jpegURI(await w.read(v.file)),points:v.points,facing:v.facing}:undefined;
 const p=photoProject({image:jpegURI(await w.read(a.front)),points:a.points,name:a.name,height:a.height,depth:a.depth,volume:a.volume,detail:a.detail,back:await readView(a.back),side:await readView(a.side)});
 return resultText(await save(w,a.output,p));
});
define('edit_project','Aplica operações ModelLab em cópia, por exemplo updatePart e adjustProfile.',{project,operations:{type:'array',maxItems:1000,items:obj('Operação ModelLab')},output},['project','operations','output'],true,async(w,a)=>resultText(await save(w,a.output,applyOperations(await parse(w,a.project),a.operations))));
define('inspect_project','Inspeciona dimensões, malhas, triângulos e referências.',{project},['project'],false,async(w,a)=>resultText(inspectProject(await parse(w,a.project))));
define('render_project','Retorna PNGs reais e relatório da malha para inspeção visual. Ordem indicada no relatório.',renderProps,['project'],false,async(w,a)=>previews(renderViews(await parse(w,a.project),{size:a.size??384,views:a.views??['front','back','left','iso']})));
define('refine_character','Converte perfil em mesh com volumes regionais ajustados.',{project,id:str('ID da peça'),factors:obj('head, torso, arms, legs, feet'),output},['project','output'],true,async(w,a)=>resultText(await save(w,a.output,refineCharacter(await parse(w,a.project),a.id??'character',a.factors??{}))));
define('create_creature','Cria criatura paramétrica estática editável: '+creatureSpecies().join(', '),{options:obj('Receita: species, height, proportions, quality, color, accent, name'),reference:file('JPEG lateral opcional'),landmarks:obj('withers, rump, muzzle, groundY em pixels'),facing:str('Direção do focinho',{enum:['left','right']}),output},['output'],true,async(w,a)=>{
 const opts={...a.options};
 if(Object.hasOwn(opts,'reference'))throw Error('Use o campo reference externo para JPEG do workspace.');
 if(a.reference)opts.reference={image:jpegURI(await w.read(a.reference)),landmarks:a.landmarks,facing:a.facing};
 const r=createCreature(opts);return resultText({...await save(w,a.output,r.project),report:r.report});
});
define('train_clothing','Aplica relevo e acabamento procedural de roupas ao perfil humanoide original.',{project,id:str('ID da peça'),options:obj('Estilo suit, field, armor; strength, tint, tintStrength, features, refine'),output},['project','output'],true,async(w,a)=>{
 const r=trainClothing(await parse(w,a.project),a.id??'character',a.options??{});
 return resultText({...await save(w,a.output,r.project),report:r.report});
});
define('build_character','Gera pacote completo de personagem a partir do perfil fotográfico; use prefixo novo. Manifesto salvo por último.',{project,prefix:str('Prefixo simples e exclusivo',{maxLength:70}),options:obj('Receita integrada: refine, clothing, hands, handMesh, joints, animations, levels, maxBytes, retarget'),motion:file('FBX opcional no workspace (até 24 MiB)')},['project','prefix'],true,async(w,a)=>{
 if(!validName(a.prefix))throw Error('Prefixo inválido.');
 const p=await parse(w,a.project),motion=a.motion?parseMotionFBX(await w.read(a.motion)):undefined;
 const result=await buildCharacterPackage(p,a.options??{},motion),entries=characterPackageEntries(result);
 const names=entries.map(e=>a.prefix+'-'+e.file);
 if(names.some(n=>!validName(n)))throw Error('Nome de saída inválido.');
 const existing=new Set((await w.list()).map(f=>f.file));if(names.some(n=>existing.has(n)))throw Error('Escolha outro prefixo: saída já existe.');
 const saved=[];
 try{for(let i=0;i<entries.length;i++)saved.push(await w.write(names[i],entries[i].data));}
 catch(e){throw Error('Pacote incompleto; arquivos salvos: '+saved.map(f=>f.file).join(', ')+'; '+e.message);}
 return resultText({files:saved,manifest:result.manifest});
});
define('audit_uv','Diagnóstico de UV e texturas.',{project},['project'],false,async(w,a)=>resultText(auditUV(await parse(w,a.project))));
define('edit_textures','Otimiza JPEG e permite ajustes UV e atlas em cópia.',{project,preset,options:obj('Opções de editTextures'),output},['project','output'],true,async(w,a)=>{
 const r=editTextures(await parse(w,a.project),{...a.options,...(a.preset?{preset:a.preset}:{})});
 return resultText({...await save(w,a.output,r.project),report:r.report});
});
define('auto_rig','Gera esqueleto humanoide de pose T.',{project,id:str('ID da peça'),hands:str('Tipo de mãos',{enum:['basic','detailed']}),joints:obj('Mapa nome -> posição XYZ local'),output},['project','output'],true,async(w,a)=>{
 const r=autoRig(await parse(w,a.project),a.id??'character',{hands:a.hands??'basic',joints:a.joints??{}});
 return resultText({...await w.write(a.output,JSON.stringify(r)),bones:r.bones.length,warnings:r.warnings});
});
define('edit_rig','Ajusta posições das articulações em novo arquivo.',{rig,joints:obj('Mapa nome -> posição XYZ local'),output},['rig','joints','output'],true,async(w,a)=>{
 const r=adjustRig(await parse(w,a.rig),a.joints);return resultText({...await w.write(a.output,JSON.stringify(r)),bones:r.bones.length});
});
define('preview_rig','Retorna imagens do esqueleto sobre a malha.',{...renderProps,rig},['project','rig'],false,async(w,a)=>previews(previewRig(await parse(w,a.project),await parse(w,a.rig),{size:a.size??384,views:a.views})));
define('preview_pose','Retorna imagens da pose, com rotações Euler em graus.',{...renderProps,rig,rotations:obj('Mapa nome -> rotação XYZ em graus')},['project','rig','rotations'],false,async(w,a)=>previews(previewPose(await parse(w,a.project),await parse(w,a.rig),a.rotations,{size:a.size??384,views:a.views})));
define('list_animations','Lista clips procedurais disponíveis.',{},[],false,async()=>resultText(animationNames()));
define('preview_animation','Retorna imagens de um instante de animação.',{...renderProps,rig,clip:str('Nome do clip',{enum:animationNames()}),time:num('Segundos',0,100)},['project','rig','clip','time'],false,async(w,a)=>previews(previewAnimation(await parse(w,a.project),await parse(w,a.rig),a.clip,a.time,{size:a.size??384,views:a.views})));
define('export_glb','Exporta GLB estático, articulado ou animado; valida antes de salvar.',{project,rig,animations:{type:'array',minItems:1,maxItems:32,uniqueItems:true,items:str('Clip',{enum:animationNames()})},output},['project','output'],true,async(w,a)=>{
 if(a.animations&&!a.rig)throw Error('Animações exigem rig.');
 const p=await parse(w,a.project),r=a.rig?await parse(w,a.rig):null;
 const b=a.animations?await exportAnimatedGLB(p,r,a.animations):r?await exportSkinnedGLB(p,r):await exportGLB(p);
 return resultText({...await w.write(a.output,new Uint8Array(b.buffer)),report:b.report});
});
define('validate_glb','Valida GLB ModelLab estático ou articulado.',{file:file('GLB local')},['file'],false,async(w,a)=>{const b=buffer(await w.read(a.file));return resultText(await(hasSkin(b)?verifySkinnedGLB(b):verifyGLB(b)));});

export function protocol(w){
 let initialized=false,ready=false;
 const supported=['2025-11-25','2025-06-18','2025-03-26','2024-11-05'];
 const response=(id,result)=>({jsonrpc:'2.0',id,result});
 const error=(id,code,message)=>({jsonrpc:'2.0',id,error:{code,message}});
 return async message=>{
  if(!message||Array.isArray(message)||message.jsonrpc!=='2.0'||typeof message.method!=='string')return error(null,-32600,'Invalid Request');
  const {id,method,params}=message,notification=!Object.hasOwn(message,'id');
  if(method==='notifications/initialized'){if(initialized)ready=true;return null;}
  if(notification)return null;
  if(typeof id!=='string'&&typeof id!=='number')return error(null,-32600,'Invalid id');
  if(method==='initialize'){
   if(initialized||typeof params?.protocolVersion!=='string')return error(id,-32602,'Invalid initialize');
   initialized=true;
   return response(id,{protocolVersion:supported.includes(params.protocolVersion)?params.protocolVersion:supported[0],capabilities:{tools:{listChanged:false}},serverInfo:{name:'rexx-modellab',version:'0.14.0'},instructions:'Use apenas arquivos no workspace. Crie novos nomes para cada revisão. As imagens de render são estimativas geométricas, não reconstruções perfeitas.'});
  }
  if(method==='ping')return response(id,{});
  if(!ready)return error(id,-32002,'Server not initialized');
  if(method==='tools/list')return response(id,{tools:tools.filter(t=>!w.readOnly||!t.mutates).map(t=>t.definition)});
  if(method!=='tools/call')return error(id,-32601,'Method not found');
  const t=tools.find(t=>t.definition.name===params?.name);
  if(!t||w.readOnly&&t.mutates)return error(id,-32602,'Tool unavailable');
  const args=params.arguments??{};
  try{check(args,t.definition.inputSchema);}catch(e){return error(id,-32602,e.message);}
  try{return response(id,await t.run(w,args));}
  catch(e){return response(id,{isError:true,content:[{type:'text',text:String(e.message).slice(0,500)}]});}
 };
}
export async function serve(root,options={}){
 const handler=protocol(await workspace(root,options));
 // Limite de linha antes de JSON.parse. Processa chamadas em série.
 const max=4*1024*1024;let pending=Buffer.alloc(0),dropping=false;
 async function send(line){
  let msg;try{msg=JSON.parse(line.toString('utf8'));}catch{process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:null,error:{code:-32700,message:'Parse error'}})+'\n');return;}
  const r=await handler(msg);if(r)process.stdout.write(JSON.stringify(r)+'\n');
 }
 for await(const chunk of process.stdin){
  let start=0;
  while(start<chunk.length){
   const end=chunk.indexOf(10,start),stop=end<0?chunk.length:end;
   if(!dropping){const part=chunk.subarray(start,stop);if(pending.length+part.length>max){pending=Buffer.alloc(0);dropping=true;}else pending=Buffer.concat([pending,part]);}
   if(end<0)break;
   if(dropping)process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:null,error:{code:-32600,message:'Request too large'}})+'\n');
   else if(pending.length)await send(pending);
   pending=Buffer.alloc(0);dropping=false;start=end+1;
  }
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const args=process.argv.slice(2);let root,readOnly=false;
 for(let i=0;i<args.length;i++){if(args[i]==='--workspace')root=args[++i];else if(args[i]==='--read-only')readOnly=true;else{process.stderr.write('Argumento desconhecido.\n');process.exit(1);}}
 serve(root,{readOnly}).catch(e=>{process.stderr.write(e.message+'\n');process.exitCode=1;});
}
