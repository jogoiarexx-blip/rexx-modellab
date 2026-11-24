import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,applyOperations,photoProject} from '../src/automation.js';
import {pixels,jpegBytes,compress} from '../src/raster.js';
import {proceduralTexture,editTextures,auditUV,materialMaps,editImage} from '../src/texture.js';
import {exportGLB} from '../src/format.js';
import {autoRig} from '../src/rig.js';
import {exportAnimatedGLB} from '../src/animation.js';
test('redução de resolução, correção UV e materiais sem alterar original',async()=>{
 const uri=proceduralTexture({size:768,pattern:'stone'});
 const p=applyOperations(createProject('Texturas'),[{type:'updateMaterial',id:'neutral',fields:{baseColorImage:uri}},{type:'addPart',part:{id:'a',name:'A',shape:'box',material:'neutral'}},{type:'addPart',part:{id:'b',name:'B',shape:'box',material:'neutral',position:[2,0,0]}}]);
 const {project,report}=editTextures(p,{preset:'mobile'});
 assert.equal(p.parts[0].shape,'box');assert.equal(project.parts[0].shape,'mesh');
 assert.ok(report.textureSavingsBytes>0);
 assert.equal(pixels(project.materials[0].baseColorImage).width,512);
 assert.ok(auditUV(project).parts.every(p=>p.hasUV&&!p.outside));
 assert.ok((await exportGLB(project)).report.ok);
 const atlas=editTextures(p,{preset:'mobile',atlas:true});
 assert.equal(new Set(atlas.project.materials.map(m=>m.baseColorImage)).size,1);
 assert.ok(auditUV(atlas.project).parts.every(p=>!p.outside));
 assert.ok((await exportGLB(atlas.project)).report.ok);
});
test('mapas auxiliares e reparos por região',()=>{
 const uri=proceduralTexture({size:64,pattern:'fabric'}),maps=materialMaps(uri);
 assert.equal(maps.normal.data.length,64*64*4);assert.equal(maps.orm.data[0],255);assert.equal(maps.orm.data[2],0);
 const edit=editImage(uri,{patches:[{rect:[0,0,.5,.5],fill:'#ff0000'}]});
 assert.ok(pixels(edit).data[0]>200);
});
test('textura otimizada preserva compatibilidade com rig e animações',async()=>{
 const image=compress({width:100,height:100,data:new Uint8Array(40000).fill(255)});
 const points=[[43,5],[57,5],[57,20],[92,20],[92,30],[64,30],[64,90],[52,90],[50,56],[48,90],[36,90],[36,30],[8,30],[8,20],[43,20]];
 const p=photoProject({image,points,height:1.8,depth:.25}),rig=autoRig(p,'character');
 const {project}=editTextures(p,{preset:'mobile'});
 const {report}=await exportAnimatedGLB(project,rig,['idle','walk']);
 assert.equal(report.animations.length,2);assert.equal(report.bones,26);
});
