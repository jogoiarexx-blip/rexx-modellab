import test from 'node:test';
import assert from 'node:assert/strict';
import {photoProject,applyOperations} from '../src/automation.js';
import {refineCharacter} from '../src/refine.js';
import {compress} from '../src/raster.js';
const image=compress({width:100,height:100,data:new Uint8Array(40000).fill(255)});
const points=[[43,5],[57,5],[57,20],[92,20],[92,30],[64,30],[64,90],[52,90],[50,56],[48,90],[36,90],[36,30],[8,30],[8,20],[43,20]];
const side=[[45,5],[55,5],[61,30],[60,52],[57,90],[43,90],[40,52],[39,30]];
test('multivista calibra profundidade e preserva perfil',()=>{
 const p=photoProject({image,points,height:1.7,back:{image,points},side:{image,points:side,facing:'left'}});
 assert.equal(p.references.length,3);assert.ok(Math.abs(p.parts[0].size[2]-.44)<1e-9);
 const q=applyOperations(p,[{type:'adjustProfile',id:'character',height:1.8}]);
 assert.ok(Math.abs(q.parts[0].size[2]-(22/85*1.8))<1e-9);
 assert.throws(()=>photoProject({image,points,side:{image,points:side}}));
});
test('refinamento gera cópia mesh com UV e textura',()=>{
 const p=photoProject({image,points,height:1.8,depth:.25});
 const q=refineCharacter(p,'character',{head:1.1,arms:.9});
 assert.equal(p.parts[0].shape,'profile');assert.equal(q.parts[0].shape,'mesh');
 assert.ok(q.parts[0].geometry.positions.length>100);
 assert.ok(q.materials.at(-1).baseColorImage.startsWith('data:image/jpeg'));
 assert.throws(()=>refineCharacter(p,'character',{arms:3}));
});
