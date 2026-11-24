import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,applyOperations,inspectProject,photoProject} from '../src/automation.js';
import {compress} from '../src/raster.js';
test('cria, edita, inspeciona e mantém original',()=>{
  const p=createProject('Caixa');
  const q=applyOperations(p,[{type:'addPart',part:{id:'box',name:'Caixa',shape:'box',material:'neutral',size:[2,1,1]}},{type:'updatePart',id:'box',fields:{position:[0,.5,0]}}]);
  assert.equal(p.parts.length,0);assert.deepEqual(inspectProject(q).dimensions,[2,1,1]);
  assert.throws(()=>applyOperations(q,[{type:'updatePart',id:'box',fields:{size:[-1,1,1]}}]));assert.deepEqual(q.parts[0].size,[2,1,1]);
  assert.equal(applyOperations(q,[{type:'removePart',id:'box'}]).parts.length,0);
});
test('foto com contorno manual, escala e volume ajustáveis',()=>{
  const width=100,height=100,data=new Uint8Array(width*height*4).fill(255);
  const points=[[43,5],[57,5],[57,20],[92,20],[92,30],[64,30],[64,90],[52,90],[50,56],[48,90],[36,90],[36,30],[8,30],[8,20],[43,20]];
  const p=photoProject({image:compress({width,height,data}),points,height:1.7,depth:.25});
  assert.equal(p.parts[0].size[1],1.7);
  const q=applyOperations(p,[{type:'adjustProfile',id:'character',height:1.8,depth:.28,keepFloor:true,fields:{detail:.3}}]);
  assert.equal(q.parts[0].size[2],.28);
  assert.ok(Math.abs(q.parts[0].size[1]-1.8)<1e-9);
  assert.ok(Math.abs(q.parts[0].position[1]-.9)<1e-9);
  assert.throws(()=>photoProject({image:p.references[0].image,points:[]}));
});
