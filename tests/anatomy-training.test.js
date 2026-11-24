import test from 'node:test';
import assert from 'node:assert/strict';
import {anatomicalDepth,DEPTH_REFERENCES,validateAnatomyOptions} from '../src/anatomy-training.js';
import {refineCharacter} from '../src/refine.js';
import {photoProject} from '../src/automation.js';
import {compress} from '../src/raster.js';
import {autoRig} from '../src/rig.js';
const image=compress({width:100,height:100,data:new Uint8Array(40000).fill(255)});
const points=[[43,5],[57,5],[57,20],[92,20],[92,30],[64,30],[64,90],[52,90],[50,56],[48,90],[36,90],[36,30],[8,30],[8,20],[43,20]];
test('medidas de referência distintas e regiões anatômicas limitadas',()=>{
 assert.equal(DEPTH_REFERENCES.corsair[2],.203);
 assert.equal(DEPTH_REFERENCES.harbinger[2],.462);
 assert.equal(DEPTH_REFERENCES.rustbound[0],null);
 const arg={row:.28,x:.48,front:true,style:'athletic',strength:1,currentDepth:()=>.2};
 assert.ok(anatomicalDepth(arg)>anatomicalDepth({...arg,front:false}));
 assert.equal(anatomicalDepth({...arg,strength:0}),1);
 assert.ok(anatomicalDepth({...arg,sideCalibrated:true})<anatomicalDepth(arg));
 assert.throws(()=>validateAnatomyOptions('invalid',.5));
 for(let row=0;row<=1;row+=.01)for(const x of [-4,-1,0,1,4]){const v=anatomicalDepth({...arg,row,x});assert.ok(v>=.75&&v<=1.35);}
});
test('refinamento preserva contorno XY, UV, índices e costuras',()=>{
 const p=photoProject({image,points,height:1.8,depth:.25});
 const a=refineCharacter(p,'character'),b=refineCharacter(p,'character',{anatomyStyle:'athletic',anatomyStrength:1});
 const c=refineCharacter(p,'character',{anatomyStyle:'athletic',anatomyStrength:0});
 const ga=a.parts[0].geometry,gb=b.parts[0].geometry;
 assert.deepEqual(ga,c.parts[0].geometry);
 assert.deepEqual(ga.uv,gb.uv);assert.deepEqual(ga.indices,gb.indices);
 const n=ga.positions.length/6;let changed=0;
 for(let i=0;i<ga.positions.length;i+=3){
  assert.equal(ga.positions[i],gb.positions[i]);assert.equal(ga.positions[i+1],gb.positions[i+1]);
  if(ga.positions[i+2]!==gb.positions[i+2])changed++;
 }
 for(let i=0;i<n;i++){const k=3*i+2;if(ga.positions[k]===ga.positions[k+3*n])assert.equal(gb.positions[k],gb.positions[k+3*n]);}
 assert.ok(changed>0);assert.equal(p.parts[0].shape,'profile');
 assert.equal(autoRig(b,'character',{hands:'detailed'}).bones.length,66);
});
