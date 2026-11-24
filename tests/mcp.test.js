import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,symlink,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {workspace,protocol} from '../mcp/server.js';
import {compress,jpegBytes} from '../src/raster.js';
test('MCP handshake, ferramentas, imagens e GLB',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'modellab-mcp-'));
 try{
  const w=await workspace(dir),call=protocol(w);let id=0;
  const request=(method,params)=>call({jsonrpc:'2.0',id:++id,method,params});
  const tool=(name,args)=>request('tools/call',{name,arguments:args});
  assert.equal((await request('tools/list')).error.code,-32002);
  assert.equal((await request('initialize',{protocolVersion:'2025-11-25'})).result.protocolVersion,'2025-11-25');
  await call({jsonrpc:'2.0',method:'notifications/initialized'});
  assert.ok((await request('tools/list')).result.tools.length>=16);
  const image=compress({width:100,height:100,data:new Uint8Array(40000).fill(255)});
  await w.write('front.jpg',jpegBytes(image));
  const points=[[43,5],[57,5],[57,20],[92,20],[92,30],[64,30],[64,90],[52,90],[50,56],[48,90],[36,90],[36,30],[8,30],[8,20],[43,20]];
  const created=await tool('photo_character',{front:'front.jpg',points,depth:.25,output:'hero.json'});
  assert.ok(!created.result.isError,JSON.stringify(created));
  const rendered=await tool('render_project',{project:'hero.json',size:96,views:['front']});
  assert.equal(rendered.result.content[1].mimeType,'image/png');
  assert.ok(!(await tool('auto_rig',{project:'hero.json',output:'hero.rig.json'})).result.isError);
  const glb=await tool('export_glb',{project:'hero.json',rig:'hero.rig.json',animations:['idle'],output:'hero.glb'});
  assert.ok(!glb.result.isError,JSON.stringify(glb));
  assert.ok(!(await tool('validate_glb',{file:'hero.glb'})).result.isError);
  assert.ok((await tool('create_project',{output:'hero.json'})).result.isError);
  assert.ok((await tool('create_project',{output:'../escape.json'})).result.isError);
  assert.equal((await tool('inspect_project',{project:'hero.json',unknown:true})).error.code,-32602);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('workspace bloqueia caminhos, symlinks e escrita em modo leitura',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'modellab-mcp-'));
 try{
  const w=await workspace(dir);await w.write('source.json','{}');
  await assert.rejects(w.read('../source.json'));await assert.rejects(w.write('source.json','changed'));
  if(process.platform!=='win32'){await symlink(join(dir,'source.json'),join(dir,'link.json'));await assert.rejects(w.read('link.json'));}
  const ro=await workspace(dir,{readOnly:true});await assert.rejects(ro.write('new.json','{}'));
  const p=protocol(ro);await p({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-11-25'}});await p({jsonrpc:'2.0',method:'notifications/initialized'});
  const list=await p({jsonrpc:'2.0',id:2,method:'tools/list'});assert.ok(list.result.tools.every(t=>t.annotations.readOnlyHint));
 }finally{await rm(dir,{recursive:true,force:true});}
});
