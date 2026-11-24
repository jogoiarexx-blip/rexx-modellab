import test from 'node:test';
import assert from 'node:assert/strict';
import {anatomy,spans,suggestContour} from '../src/silhouette.js';
import {characterGeometry,characterJPEG,sideDepth,suggestedDepth} from '../src/character.js';
import {compress,pixels} from '../src/raster.js';
import {defaults,makePart} from '../src/model.js';
import {exportGLB,importGLB} from '../src/format.js';

globalThis.FileReader??=class{readAsArrayBuffer(blob){blob.arrayBuffer().then(data=>{this.result=data;this.onloadend();});}};
const points=[[59,7],[76,7],[78,24],[87,29],[119,31],[119,40],[85,39],[80,68],[84,101],[85,134],[73,134],[67,79],[60,134],[47,134],[51,96],[53,69],[49,39],[14,40],[14,31],[48,29],[59,24]];
function reference(){
  const width=136,height=146,data=new Uint8Array(width*height*4);
  for(let y=0;y<height;y++){
    const row=spans(points,y+.5);
    for(let x=0;x<width;x++){
      const inside=row.some(([a,b])=>a<x+.5&&x+.5<b);
      const color=inside?(y<26?[201,148,104]:(x>62&&x<72&&y<65?[202,44,46]:[72,120,69])):[223,220,219];
      data.set([...color,255],4*(y*width+x));
    }
  }
  return {id:'foto',name:'Referência',width,height,image:compress({width,height,data})};
}
test('Sugere o contorno sobre fundo uniforme e distingue os braços e as pernas de um objeto plano',()=>{
  const ref=reference(),suggestion=suggestContour(pixels(ref.image));
  assert.ok(anatomy(points));assert.ok(anatomy(suggestion));
  assert.equal(anatomy([[0,0],[100,0],[100,120],[0,120]]),null);
  const blank={width:60,height:80,data:new Uint8Array(60*80*4).fill(128)};
  assert.deepEqual(suggestContour(blank),[]);
});
test('Personagem tem volume fechado, profundidade regional e normais para fora nos dois sentidos do contorno',()=>{
  for(const polygon of [points,[...points].reverse()]){
    const d=suggestedDepth(polygon,.5);assert.ok(d>.05&&d<.16);
    const mesh=characterGeometry(polygon,[.5,.605,d]),pos=mesh.attributes.position,idx=mesh.index.array,edges=new Map();
    let vol=0,arm=0,chest=0;
    for(let i=0;i<pos.count;i++){
      if(Math.abs(pos.getX(i))>.18)arm=Math.max(arm,pos.getZ(i));
      if(Math.abs(pos.getX(i))<.035&&pos.getY(i)>.04&&pos.getY(i)<.15)chest=Math.max(chest,pos.getZ(i));
    }
    assert.ok(arm>0&&arm<chest*.75);
    for(let i=0;i<idx.length;i+=3){
      const tri=[idx[i],idx[i+1],idx[i+2]].map(j=>[pos.getX(j),pos.getY(j),pos.getZ(j)]);
      const [a,b,c]=tri;
      vol+=(a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6;
      for(let k=0;k<3;k++){const key=[tri[k].join(','),tri[(k+1)%3].join(',')].sort().join('/');edges.set(key,(edges.get(key)||0)+1);}
    }
    assert.ok(vol>0);assert.ok([...edges.values()].every(n=>n===2));mesh.dispose();
  }
});
test('O GLB incorpora o JPEG e mantém sua orientação, as cores e os bytes da textura após a reimportação',async()=>{
  const p=defaults(),ref=reference();p.materials[0].color='#ffffff';p.references=[ref];
  const n=makePart('personagem','Personagem','profile',p.materials[0].id);
  n.size=[.5,.5*127/105,suggestedDepth(points,.5)];n.profile={form:'humanoid',volume:1,points,reference:ref.id};p.parts=[n];
  const jpeg=characterJPEG(ref,points),atlas=pixels(jpeg);
  const at=(u,v)=>{const k=4*(Math.floor(v*atlas.height)*atlas.width+Math.floor(u*atlas.width));return atlas.data.slice(k,k+3);};
  const red=at(.25,.35),back=at(.75,.35);assert.ok(red[0]>red[1]*2);assert.ok(back[1]>back[0]);
  const {buffer,report}=await exportGLB(p);assert.equal(report.textures,1);
  const imported=await importGLB(buffer,'Personagem');assert.equal(imported.parts[0].origin,'single-view-humanoid');
  assert.equal(imported.materials[0].baseColorImage,jpeg);
  const again=await exportGLB(imported);assert.equal(again.report.triangles,report.triangles);
  assert.equal((await importGLB(again.buffer)).materials[0].baseColorImage,jpeg);
});

test('A foto traseira mantém a orientação esquerda/direita e acompanha o GLB',async()=>{
  const front=reference();
  const {width,height,data}=pixels(front.image);
  const rearData=data.slice();
  for(let y=0;y<height;y++){
    for(const [start,end] of spans(points,y+.5)){
      for(let x=Math.ceil(start);x<end;x++){
        rearData.set(x<67?[32,75,212,255]:[220,151,34,255],4*(y*width+x));
      }
    }
  }
  const rear={...front,id:'costas',image:compress({width,height,data:rearData})};
  const p=defaults();
  p.references=[front,rear];
  const n=makePart('personagem','Personagem','profile',p.materials[0].id);
  n.size=[.5,.5*127/105,suggestedDepth(points,.5)];
  n.profile={form:'humanoid',points,reference:front.id,back:{reference:rear.id,points}};
  p.parts=[n];
  const {buffer,report}=await exportGLB(p);
  assert.deepEqual(report.inferredSurfaces[0].surfaces,['laterais']);
  const imported=await importGLB(buffer);
  assert.equal(imported.parts[0].origin,'two-view-humanoid');
  const atlas=pixels(imported.materials[0].baseColorImage);
  const colorAt=x=>{
    const i=4*(30*atlas.width+x);
    return atlas.data.slice(i,i+3);
  };
  const rearLeft=colorAt(Math.round(atlas.width*.82)),rearRight=colorAt(Math.round(atlas.width*.68));
  assert.ok(rearLeft[2]>rearLeft[0]*2);
  assert.ok(rearRight[0]>rearRight[2]*2);
  delete n.profile.back;
  assert.notEqual((await importGLB((await exportGLB(p)).buffer)).materials[0].baseColorImage,imported.materials[0].baseColorImage);
});

test('O contorno de perfil muda a espessura e a posição do volume, preservando largura e altura',async()=>{
  const sidePoints=[[52,7],[73,7],[82,19],[70,27],[78,34],[88,53],[86,70],[68,83],[67,125],[75,134],[59,134],[54,105],[51,82],[47,57],[48,35],[56,25]];
  const front=reference(), side={...front,id:'perfil'};
  const height=.5*127/105,depth=sideDepth(sidePoints,height);
  assert.ok(depth>.18&&depth<.21);
  const size=[.5,height,depth],spec={reference:side.id,points:sidePoints,facing:'right'};
  const right=characterGeometry(points,size,spec);
  const left=characterGeometry(points,size,{...spec,facing:'left'});
  const flat=characterGeometry(points,size);
  for(const g of [right,left,flat])g.computeBoundingBox();
  assert.equal(right.boundingBox.max.x,flat.boundingBox.max.x);
  assert.equal(right.boundingBox.max.y,flat.boundingBox.max.y);
  assert.ok(Math.abs(right.boundingBox.max.z+left.boundingBox.min.z)<1e-7);
  const pos=right.attributes.position;
  const centerAt=(positions,limit)=>Array.from({length:positions.count},(_,i)=>i)
    .filter(i=>Math.abs(positions.getY(i)-limit)<.008)
    .reduce(([lo,hi],i)=>[Math.min(lo,positions.getZ(i)),Math.max(hi,positions.getZ(i))],[Infinity,-Infinity]);
  const [legMin,legMax]=centerAt(pos,-.2),[trunkMin,trunkMax]=centerAt(pos,.08);
  assert.ok(trunkMax-trunkMin>legMax-legMin);
  const p=defaults();
  p.references=[front,side];
  const part=makePart('perfil','Perfil','profile',p.materials[0].id);
  part.size=size;part.profile={form:'humanoid',reference:front.id,points,side:spec};p.parts=[part];
  const {buffer,report}=await exportGLB(p);
  assert.match(report.inferredSurfaces[0].method,/contorno de perfil/);
  assert.equal((await importGLB(buffer)).parts[0].sideCalibrated,true);
  for(const g of [right,left,flat])g.dispose();
});

test('O relevo altera a superfície sem deformar o contorno e a foto de perfil colore seu lado no GLB',async()=>{
  const front=reference(), size=[.5,.5*127/105,.21];
  const detailed=characterGeometry(points,size,undefined,front,1);
  const baseline=characterGeometry(points,size);
  assert.ok(detailed.attributes.position.count>baseline.attributes.position.count);
  // Com a mesma subdivisão, a frente fotografada se altera e as costas continuam idênticas.
  const neutral=characterGeometry(points,size,undefined,{...front,image:compress({width:front.width,height:front.height,data:new Uint8Array(front.width*front.height*4).fill(128)})},1);
  const a=detailed.attributes.position,b=neutral.attributes.position,count=a.count/2;
  assert.ok(Array.from({length:count},(_,i)=>Math.abs(a.getZ(i)-b.getZ(i))).some(d=>d>.0005));
  for(let i=0;i<count;i++){
    assert.equal(a.getZ(i+count),b.getZ(i+count));
    if(b.getZ(i)===0)assert.equal(a.getZ(i),0);
  }
  const blue=new Uint8Array(front.width*front.height*4);
  for(let i=0;i<blue.length;i+=4)blue.set([19,55,229,255],i);
  const side={...front,id:'lateral',image:compress({width:front.width,height:front.height,data:blue})};
  const sidePoints=[[40,7],[84,7],[84,134],[40,134]];
  const p=defaults();
  const part=makePart('tres','Três vistas','profile',p.materials[0].id);
  p.parts=[part];p.references=[front,side];
  part.size=size;part.profile={form:'humanoid',reference:front.id,points,detail:1,side:{reference:side.id,points:sidePoints,facing:'right'}};
  const loaded=await importGLB((await exportGLB(p)).buffer);
  const atlas=pixels(loaded.materials[0].baseColorImage);
  const blues=(atlas,from,to)=>{
    let count=0;
    for(let y=0;y<atlas.height;y++)for(let x=from;x<to;x++){
      const i=4*(y*atlas.width+x);
      if(atlas.data[i+2]>atlas.data[i]*2&&atlas.data[i+2]>145)count++;
    }
    return count;
  };
  const left=blues(atlas,0,atlas.width/4),right=blues(atlas,atlas.width/4,atlas.width/2);
  part.profile.side.facing='left';
  const flipped=pixels((await importGLB((await exportGLB(p)).buffer)).materials[0].baseColorImage);
  assert.ok(left>right*1.5,[left,right]);
  const flippedLeft=blues(flipped,0,flipped.width/4),flippedRight=blues(flipped,flipped.width/4,flipped.width/2);
  assert.ok(flippedRight>flippedLeft*1.5,[flippedLeft,flippedRight]);
  for(const g of [detailed,baseline,neutral])g.dispose();
});
