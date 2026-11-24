import test from 'node:test';
import assert from 'node:assert/strict';
import {faceOptions,facialOffset,UPPER_REGION_REFERENCES} from '../src/face-training.js';
import {refineCharacter} from '../src/refine.js';
import {photoProject} from '../src/automation.js';
import {compress} from '../src/raster.js';
const image=compress({width:100,height:100,data:new Uint8Array(40000).fill(255)});
const points=[[43,5],[57,5],[57,20],[92,20],[92,30],[64,30],[64,90],[52,90],[50,56],[48,90],[36,90],[36,30],[8,30],[8,20],[43,20]];
const box=[.41,.02,.59,.17],opts=faceOptions({strength:1,box},points);
const at=(u,v,o=opts,gap=.1,side=false)=>facialOffset(box[0]+u*(box[2]-box[0]),box[1]+v*(box[3]-box[1]),gap,1.8,o,side);
test('medidas reais não são landmarks; opções e ordem validadas',()=>{
 assert.equal(UPPER_REGION_REFERENCES.rustbound.extent,null);
 assert.ok(UPPER_REGION_REFERENCES.harbinger.extent[2]>UPPER_REGION_REFERENCES.denim.extent[2]);
 assert.throws(()=>faceOptions({box:[0,0,1,.8]},points));
 assert.throws(()=>faceOptions({features:{unknown:1}},points));
 assert.throws(()=>faceOptions({rows:{nose:.2}},points));
 assert.ok(faceOptions({},points).box[3]<=.23);
});
test('nariz tem relevo, órbitas são rebaixadas, costuras e vista lateral protegidas',()=>{
 assert.ok(at(.5,.59)>at(.8,.59));
 const isolated=faceOptions({strength:1,box,features:{forehead:0,brow:0,nose:0,cheeks:0,lips:0,chin:0}},points);
 assert.ok(at(.73,.45,isolated)<0);
 assert.equal(at(0,.5),0);assert.equal(at(.5,.5,opts,0),0);
 assert.ok(Math.abs(at(.5,.59,opts,.1,true))<Math.abs(at(.5,.59)));
 assert.equal(at(.5,.59,faceOptions({strength:0,box},points)),0);
});
test('subdivisão facial local preserva UV, silhueta fechada e perfil original',()=>{
 const p=photoProject({image,points,height:1.8,depth:.25});
 const a=refineCharacter(p,'character'),zero=refineCharacter(p,'character',{face:{strength:0,box}});
 assert.deepEqual(a.parts[0].geometry,zero.parts[0].geometry);
 const b=refineCharacter(p,'character',{face:{strength:1,box}}),g=b.parts[0].geometry;
 assert.ok(g.positions.length>a.parts[0].geometry.positions.length);
 assert.equal(g.uv.length,g.positions.length/3*2);
 assert.equal(p.parts[0].shape,'profile');
 const half=g.positions.length/6,edges=new Map();
 for(let i=0;i<half;i++){const k=i*3,l=(i+half)*3;assert.equal(g.positions[k],g.positions[l]);assert.equal(g.positions[k+1],g.positions[l+1]);}
 const point=i=>g.positions.slice(i*3,i*3+3).map(v=>v.toFixed(7)).join(',');
 for(let i=0;i<g.indices.length;i+=3)for(let k=0;k<3;k++){const e=[point(g.indices[i+k]),point(g.indices[i+(k+1)%3])].sort().join('/');edges.set(e,(edges.get(e)??0)+1);}
 assert.ok([...edges.values()].every(n=>n===2));
});
