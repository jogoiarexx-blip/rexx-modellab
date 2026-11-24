import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {profileGeometry,profileSize,validateContour} from '../src/profile.js';
import {buildScene,validate,serializeProject} from '../src/model.js';
import {exportGLB,importGLB,verifyGLB} from '../src/format.js';

globalThis.FileReader??=class {readAsArrayBuffer(blob){blob.arrayBuffer().then(b=>{this.result=b;this.onloadend();});}};
const read=async()=>JSON.parse(await readFile(new URL('../examples/placa.modellab.json',import.meta.url)));
test('Medida conhecida e largura manual dão a mesma escala',async()=>{
  const p=await read(),n=p.parts[0],ref=p.references[0];
  assert.deepEqual(profileSize(n.profile,ref,999,.035),n.size);
  delete n.profile.calibration;
  assert.deepEqual(profileSize(n.profile,ref,.584,.035),n.size);
  const doubled=profileSize(n.profile,ref,1.168,.07);
  assert.deepEqual(doubled,[1.168,.592,.07]);
  n.size[1]=.94;assert.throws(()=>validate(p),/dimensões/i);
});
test('Contorno côncavo gera sólido fechado com volume e normais para fora, em ambos os sentidos',()=>{
  const points=[[0,0],[2,0],[4,0],[4,1],[1,1],[1,4],[0,4]];
  for(const path of [points,[...points].reverse()]){
    validateContour(path,{width:4,height:4});
    const g=profileGeometry(path,[4,4,2]),a=g.attributes.position,index=g.index.array;
    const edges=new Map();let volume=0;
    for(let i=0;i<index.length;i+=3){
      const t=index.slice(i,i+3),coords=Array.from(t,k=>[a.getX(k),a.getY(k),a.getZ(k)]);
      const [P,Q,R]=coords;
      volume+=(P[0]*(Q[1]*R[2]-Q[2]*R[1])+P[1]*(Q[2]*R[0]-Q[0]*R[2])+P[2]*(Q[0]*R[1]-Q[1]*R[0]))/6;
      for(let j=0;j<3;j++){const v=coords[j].join(','),w=coords[(j+1)%3].join(',');const key=[v,w].sort().join(':');edges.set(key,(edges.get(key)||0)+1);}
    }
    assert.ok(Math.abs(volume-14)<1e-8);assert.ok([...edges.values()].every(n=>n===2));g.dispose();
  }
});
test('Impede cruzamentos, repetições, pontos fora da foto e medidas inválidas',async()=>{
  const p=await read(),ref=p.references[0];
  for(const invalid of [[],[[0,0],[2,2],[0,2],[2,0]],[[0,0],[0,0],[4,4]],[[0,0],[850,2],[4,4]],[[0,0],[4,0],[2,0],[2,3]]])assert.throws(()=>validateContour(invalid,ref));
  const n=p.parts[0];n.profile.calibration.b=n.profile.calibration.a;assert.throws(()=>validate(p),/extremidades/);
  n.profile.reference='inexistente';assert.throws(()=>validate(p),/ausente/);
});
test('Perfis diferentes de mesmo tamanho mantêm malhas distintas',async()=>{
  const p=await read(),first=p.parts[0],second=structuredClone(first);
  second.id='outro';second.profile.points=[[110,112],[694,112],[694,408],[110,408]];p.parts.push(second);
  const scene=buildScene(p);
  assert.notEqual(scene.objects.get('outro').geometry,scene.objects.get(first.id).geometry);
  scene.dispose();
});
test('JSON preserva a foto e GLB reproduz volume e declaração de superfícies estimadas',async()=>{
  const p=await read(),source=serializeProject(p),a=await exportGLB(p),b=await exportGLB(JSON.parse(source));
  assert.deepEqual(Buffer.from(a.buffer),Buffer.from(b.buffer));
  assert.deepEqual(a.report.dimensions,[.584,.296,.035]);assert.equal(a.report.triangles,32);
  assert.deepEqual((await verifyGLB(a.buffer)).inferredSurfaces[0].surfaces,['laterais','traseira']);
  assert.equal(Buffer.from(a.buffer).includes(Buffer.from('data:image/jpeg')),false);
  const imported=await importGLB(a.buffer,'Placa');assert.equal(imported.parts[0].shape,'mesh');assert.equal(imported.references,undefined);assert.equal((await exportGLB(imported)).report.inferredSurfaces.length,1);
});
