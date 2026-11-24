import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,applyOperations,photoProject} from '../src/automation.js';
import {compress} from '../src/raster.js';
import {renderViews} from '../src/render.js';
import {encodePNG} from '../cli/png.js';
test('cinco vistas de uma caixa, PNG e relatório',()=>{
 const p=applyOperations(createProject('Teste'),[{type:'addPart',part:{id:'box',name:'Caixa',shape:'box',material:'neutral',size:[2,1,.5]}}]);
 const {images,report}=renderViews(p,{size:96});
 assert.equal(Object.keys(images).length,5);assert.equal(report.triangles,12);assert.equal(report.meshAudit[0].degenerate,0);
 for(const im of Object.values(images)){assert.ok(im.data.some((v,i)=>i%4===3&&v===255));assert.deepEqual([...encodePNG(im).subarray(0,8)],[137,80,78,71,13,10,26,10]);}
 assert.throws(()=>renderViews(p,{size:9999}));
});
test('personagem: silhueta frontal e alertas de vistas faltantes',()=>{
 const width=100,height=100,data=new Uint8Array(width*height*4).fill(255);
 const points=[[43,5],[57,5],[57,20],[92,20],[92,30],[64,30],[64,90],[52,90],[50,56],[48,90],[36,90],[36,30],[8,30],[8,20],[43,20]];
 const p=photoProject({image:compress({width,height,data}),points,height:1.8,depth:.25});
 const {report}=renderViews(p,{size:128,views:['front']});
 assert.ok(report.referenceComparison.iou>.8);assert.ok(report.warnings.some(x=>x.includes('estimadas')));
});
