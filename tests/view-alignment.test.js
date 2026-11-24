import test from 'node:test';
import assert from 'node:assert/strict';
import {viewMapper,validateAlignment} from '../src/view-alignment.js';
import {auditViews} from '../src/view-audit.js';
import {photoProject} from '../src/automation.js';
import {refineCharacter} from '../src/refine.js';
import {compress,pixels} from '../src/raster.js';
import {characterAtlas,characterGeometry} from '../src/character.js';
const points=[[43,5],[57,5],[57,20],[92,20],[92,30],[64,30],[64,90],[52,90],[50,56],[48,90],[36,90],[36,30],[8,30],[8,20],[43,20]];
const side=[[45,5],[55,5],[62,25],[59,48],[57,90],[43,90],[40,52],[39,30]];
const data=new Uint8Array(40000);
for(let y=0;y<100;y++)for(let x=0;x<100;x++)data.set([y<50?240:20,x*2,y<50?20:240,255],4*(y*100+x));
const image=compress({width:100,height:100,data}),alignment=[[.4,.6]];
test('registration interpolates corresponding heights without reversing rows',()=>{
 const map=viewMapper(alignment);assert.equal(map(.4),.6);assert.equal(map(0),0);assert.equal(map(1),1);
 assert.equal(viewMapper()(.4),.4);
 assert.throws(()=>validateAlignment([[.4,.6],[.5,.3]]));assert.throws(()=>validateAlignment([[.01,.9]]));
});
test('photo stores correspondence, geometry and back texture use it; audit identifies rows',()=>{
 const p=photoProject({image,points,back:{image,points,alignment},side:{image,points:side,facing:'left',alignment}});
 const report=auditViews(p);assert.equal(report.views.back.anchors,1);assert.equal(report.views.side.comparison.find(x=>x.row===.40).viewRow,.6);
 const part=p.parts[0],ref=p.references[0],b=p.references[1];
 const a=characterAtlas(ref,points,{ref:b,points},undefined,{fresh:true}).image;
 const c=characterAtlas(ref,points,{ref:b,points,alignment},undefined,{fresh:true}).image;
 assert.notDeepEqual(a.data,c.data);
 const g=characterGeometry(points,part.size,part.profile.side,ref,0),h=characterGeometry(points,part.size,{...part.profile.side,alignment:undefined},ref,0);
 assert.equal(g.attributes.position.count,h.attributes.position.count);
 assert.ok(g.attributes.position.array.some((x,i)=>x!==h.attributes.position.array[i]));g.dispose();h.dispose();
});
test('refine can reproject side texture onto final geometry; keeps input and valid UV',()=>{
 const p=photoProject({image,points,side:{image,points:side,facing:'left',alignment}});
 const before=JSON.stringify(p),q=refineCharacter(p,'character',{anatomyStyle:'athletic',face:{strength:.5},reproject:true});
 assert.equal(JSON.stringify(p),before);
 const g=q.parts[0].geometry;assert.equal(g.uv.length,g.positions.length/3*2);
 assert.ok(pixels(q.materials.at(-1).baseColorImage).width>0);
});
