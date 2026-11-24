import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareLOD,exportLOD,referenceBudgetPlan} from '../src/lod-training.js';
import {defaults,makePart} from '../src/model.js';
function grid(n=20){
 const positions=[],uv=[],indices=[];
 for(let y=0;y<=n;y++)for(let x=0;x<=n;x++){positions.push(x/n,y/n,0);uv.push(x/n,y/n);}
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){const a=y*(n+1)+x,b=a+1,c=a+n+1,d=c+1;indices.push(a,b,d,a,d,c);}
 const p=defaults();p.parts=[{...makePart('grid','Grid','mesh',p.materials[0].id),geometry:{positions,uv,indices}}];return p;
}
test('LOD targets based on nine reference models, not fabricated reductions',()=>{
 const rows=referenceBudgetPlan();assert.equal(rows.length,9);
 assert.equal(rows.find(r=>r.id==='fbx-dense-a').targets[2].triangles,12000);
 assert.equal(rows.find(r=>r.id==='glb-simple').targets[0].triangles,826);
});
test('LOD variants preserve input and report unmet target explicitly',()=>{
 const p=grid(),snapshot=JSON.stringify(p),hi=prepareLOD(p,'lod0'),lo=prepareLOD(p,'lod2');
 assert.equal(JSON.stringify(p),snapshot);assert.equal(hi.report.targetTriangles,800);assert.equal(lo.report.targetTriangles,240);
 assert.ok(lo.report.parts[0].after.triangles<800);
 assert.throws(()=>prepareLOD(p,'lod4'));
});
test('standalone GLB export measures actual bytes and budget',async()=>{
 const {buffer,report}=await exportLOD(grid(),'lod2',{maxBytes:1024});
 assert.equal(report.bytes,buffer.byteLength);assert.equal(report.budgetMet,false);assert.ok(report.unmet.includes('bytes'));
 assert.ok(report.triangles>0);assert.equal(report.textureRGBABytes,0);
});
