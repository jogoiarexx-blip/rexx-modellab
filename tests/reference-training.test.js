import test from 'node:test';
import assert from 'node:assert/strict';
import {REFERENCE_CORPUS,trainingPreset,photoTrainingOptions,budgetReview,inspectReferenceGLB} from '../src/reference-training.js';
function glb(j,bin=new Uint8Array()){
 const s=new TextEncoder().encode(JSON.stringify(j)),n=Math.ceil(s.length/4)*4,b=Math.ceil(bin.length/4)*4;
 const out=new Uint8Array(28+n+b),v=new DataView(out.buffer);
 for(const [i,x] of [[0,0x46546c67],[4,2],[8,out.length],[12,n],[16,0x4e4f534a],[20+n,b],[24+n,0x004e4942]])v.setUint32(i,x,true);
 out.fill(32,20,20+n);out.set(s,20);out.set(bin,28+n);return out;
}
test('corpus real distingue geometria, rig e corrida',()=>{
 assert.equal(REFERENCE_CORPUS.length,9);
 assert.equal(REFERENCE_CORPUS.filter(x=>x.clips).length,3);
 assert.equal(Math.max(...REFERENCE_CORPUS.map(x=>x.triangles)),2581135);
});
test('presets aplicados à produção e limites revisados',()=>{
 assert.equal(photoTrainingOptions('mobile').detail,0);
 assert.equal(photoTrainingOptions('cinematic',.2).detail,.2);
 assert.equal(trainingPreset('balanced').texture,2048);
 assert.throws(()=>trainingPreset('unknown'));
 assert.deepEqual(budgetReview({triangles:13000,bytes:1,maxTexture:2048},'mobile').warnings.map(w=>w.field),['triangles','maxTexture']);
 assert.equal(budgetReview({triangles:1},'mobile').notMeasured.length,2);
});
test('analisa triângulos, pesos, ossos e cabeçalho PNG sem decodificar textura',()=>{
 const bin=new Uint8Array(40),d=new DataView(bin.buffer);
 d.setFloat32(0,.5,true);d.setFloat32(4,.5,true);
 bin.set([137,80,78,71],16);d.setUint32(32,4096);d.setUint32(36,2048);
 const report=inspectReferenceGLB(glb({accessors:[{count:1},{count:3},{count:1,type:'VEC4',componentType:5126,bufferView:0}],bufferViews:[{buffer:0,byteLength:16},{buffer:0,byteOffset:16,byteLength:24}],meshes:[{primitives:[{attributes:{POSITION:0,JOINTS_0:0,WEIGHTS_0:2},indices:1}]}],skins:[{joints:[1,2]}],images:[{bufferView:1}],animations:[{name:'Running'}]},bin));
 assert.equal(report.triangles,1);assert.equal(report.bones,2);assert.equal(report.influences[2],1);
 assert.equal(report.invalidWeights,0);assert.equal(report.maxTexture,4096);assert.equal(report.textureBytes,24);assert.deepEqual(report.clips,['Running']);
 assert.throws(()=>inspectReferenceGLB(new Uint8Array(20)));
});
test('pesos inválidos e dimensões desconhecidas não são aprovados silenciosamente',()=>{
 const bin=new Uint8Array(16),d=new DataView(bin.buffer);d.setFloat32(0,.5,true);
 const report=inspectReferenceGLB(glb({accessors:[{count:1},{count:1,type:'VEC4',componentType:5126,bufferView:0}],bufferViews:[{buffer:0,byteLength:16}],meshes:[{primitives:[{attributes:{POSITION:0,JOINTS_0:0,WEIGHTS_0:1}}]}],images:[{uri:'external.png'}]},bin));
 assert.equal(report.invalidWeights,1);assert.equal(report.maxTexture,null);assert.ok(report.budget.notMeasured.includes('maxTexture'));
});
