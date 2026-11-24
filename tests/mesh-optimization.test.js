import test from 'node:test';
import assert from 'node:assert/strict';
import {optimizeGeometry,optimizeProject,REFERENCE_WELD_STATS} from '../src/mesh-optimization.js';
import {defaults,makePart} from '../src/model.js';
function grid(n=20){
 const positions=[],uv=[],indices=[];
 for(let y=0;y<=n;y++)for(let x=0;x<=n;x++){positions.push(x/n,y/n,0);uv.push(x/n,y/n);}
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){const a=y*(n+1)+x,b=a+1,c=a+n+1,d=c+1;indices.push(a,b,d,a,d,c);}
 return {positions,uv,indices};
}
test('exact cleanup preserves distinct UV and normal seams',()=>{
 const g={positions:[0,0,0,1,0,0,0,1,0,0,0,0,0,0,0,1,1,0],uv:[0,0,1,0,0,1,0,0,.5,.5,1,1],indices:[0,1,2,3,1,2,0,0,1,4,1,5]};
 const {geometry,report}=optimizeGeometry(g,{maxRounds:0});
 assert.equal(report.welded,1);assert.equal(report.degenerate,1);assert.equal(report.duplicate,1);
 assert.equal(report.lockedSeamVertices,2);assert.equal(geometry.indices.length,6);
 assert.equal(REFERENCE_WELD_STATS[0].fullAttributes,20628);
});
test('interior edge collapse reduces triangles without changing open boundary or UV orientation',()=>{
 const g=grid(),{geometry,report}=optimizeGeometry(g,{ratio:.7,maxEdge:.1,uvTolerance:.12});
 assert.ok(report.collapses>0);assert.ok(report.after.triangles<report.before.triangles);
 for(let i=0;i<geometry.indices.length;i+=3){
  const [a,b,c]=geometry.indices.slice(i,i+3).map(j=>geometry.uv.slice(j*2,j*2+2));
  assert.ok((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])>0);
 }
 const boundary=(p)=>{const s=new Set();for(let i=0;i<p.length;i+=3)if([0,1].includes(p[i])||[0,1].includes(p[i+1]))s.add(p.slice(i,i+3).join(','));return s;};
 assert.deepEqual(boundary(geometry.positions),boundary(g.positions));
});
test('protected joint area and input preservation; no false success',()=>{
 const g=grid(),p=defaults();p.parts=[{...makePart('mesh','Mesh','mesh',p.materials[0].id),geometry:g}];
 const before=JSON.stringify(p);
 const result=optimizeProject(p,{id:'mesh',targetTriangles:1,maxRounds:0,protectedPoints:[[.5,.5,0]]});
 assert.equal(JSON.stringify(p),before);assert.equal(result.report.parts[0].targetReached,false);assert.ok(result.report.parts[0].protectedVertices>0);
 assert.throws(()=>optimizeGeometry(g,{ratio:0}));
});
