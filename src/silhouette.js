import {pixelOffset} from './raster.js';
import {bounds, validateContour} from './profile.js';

// Pares de interseções delimitam as regiões internas de uma silhueta, inclusive entre as pernas.
export function spans(points,y){
  const xs=[];
  for(let i=0;i<points.length;i++){
    const a=points[i],b=points[(i+1)%points.length];
    if((a[1]>y)!==(b[1]>y))xs.push(a[0]+(b[0]-a[0])*(y-a[1])/(b[1]-a[1]));
  }
  xs.sort((a,b)=>a-b);
  const intervals=[];
  for(let i=0;i+1<xs.length;i+=2)intervals.push([xs[i],xs[i+1]]);
  return intervals;
}
export function anatomy(points){
  if(points.length<7)return null;
  const b=bounds(points);
  if(b.width/b.height<.43||b.width/b.height>1.60)return null;
  const rows=Array.from({length:51},(_,i)=>spans(points,b.top+(i+.5)*b.height/51));
  const breadth=row=>row.length?(row[row.length-1][1]-row[0][0])/b.width:0;
  const armRows=rows.map((r,i)=>i>5&&i<24&&r.length===1&&breadth(r)>.72?i:-1).filter(i=>i>=0);
  const legRows=rows.slice(32,48).filter(row=>row.length===2 && row[1][0]-row[0][1]>.015*b.width);
  if(armRows.length<2||armRows.length>12||legRows.length<6)return null;
  const shoulder=armRows[0],underarm=armRows.at(-1)+1;
  const head=rows[Math.max(1,Math.floor(shoulder*.5))],chest=rows[Math.min(30,underarm+3)];
  if(head.length!==1||chest.length!==1||breadth(head)>.43||breadth(chest)>.64||breadth(chest)<.13)return null;
  const center=(chest[0][0]+chest[0][1])/2;
  if(Math.abs(center-(b.left+b.width/2))>b.width*.17)return null;
  return {bounds:b,center,chestWidth:chest[0][1]-chest[0][0],armTop:(shoulder+.5)/51,armBottom:(underarm+.5)/51};
}
function simplify(path,eps){
  if(path.length<3)return path;
  const kept=new Set([0,path.length-1]),stack=[[0,path.length-1]];
  while(stack.length){
    const [lo,hi]=stack.pop(),a=path[lo],b=path[hi],dx=b[0]-a[0],dy=b[1]-a[1],sq=dx*dx+dy*dy;
    let best=eps*eps,pivot=-1;
    for(let i=lo+1;i<hi;i++){
      const p=path[i],t=sq?Math.min(1,Math.max(0,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/sq)):0;
      const err=(p[0]-a[0]-t*dx)**2+(p[1]-a[1]-t*dy)**2;
      if(err>best){best=err;pivot=i;}
    }
    if(pivot>=0){kept.add(pivot);stack.push([lo,pivot],[pivot,hi]);}
  }
  return [...kept].sort((a,b)=>a-b).map(i=>path[i]);
}
export function suggestContour(image){
  const factor=Math.min(1,208/Math.max(image.width,image.height));
  const w=Math.max(2,Math.round(image.width*factor)),h=Math.max(2,Math.round(image.height*factor)),rgb=new Uint8Array(w*h*3),border=[];
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const k=(y*w+x)*3,s=pixelOffset(image,(x+.5)*image.width/w-.5,(y+.5)*image.height/h-.5);
    rgb.set(image.data.subarray(s,s+3),k);
    if(!x||!y||x===w-1||y===h-1)border.push(k);
  }
  const color=[0,1,2].map(c=>border.map(k=>rgb[k+c]).sort((a,b)=>a-b)[border.length>>1]);
  const delta=k=>Math.hypot(rgb[k]-color[0],rgb[k+1]-color[1],rgb[k+2]-color[2]);
  const noise=border.map(delta).sort((a,b)=>a-b)[Math.floor(border.length*.85)];
  if(noise>57)return [];
  const threshold=Math.max(16,noise+7),mask=new Uint8Array(w*h),queue=new Int32Array(w*h);
  for(let i=0;i<mask.length;i++)mask[i]=delta(i*3)>threshold?1:0;
  // Fechamento no plano reduzido recompõe fendas estreitas causadas por sombras da roupa.
  const radius=2;
  function filter(input,grow){
    const out=new Uint8Array(input.length);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      let val=grow?0:1;
      scan: for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){
        if(dx*dx+dy*dy>radius*radius)continue;
        const nx=Math.min(w-1,Math.max(0,x+dx)),ny=Math.min(h-1,Math.max(0,y+dy));
        if(input[ny*w+nx]===+grow){val=+grow;break scan;}
      }
      out[y*w+x]=val;
    }
    return out;
  }
  mask.set(filter(filter(mask,true),false));
  let largest=[];
  for(let i=0;i<mask.length;i++){
    if(mask[i]!==1)continue;
    let head=0,tail=1;queue[0]=i;mask[i]=2;
    while(head<tail){
      const k=queue[head++],x=k%w;
      for(const v of [x?k-1:-1,x<w-1?k+1:-1,k-w,k+w])if(v>=0&&v<mask.length&&mask[v]===1){mask[v]=2;queue[tail++]=v;}
    }
    if(tail>largest.length)largest=queue.slice(0,tail);
  }
  if(largest.length<w*h*.025||largest.length>w*h*.89)return [];
  mask.fill(0);for(const k of largest)mask[k]=1;
  const next=new Map(),stride=w+1;
  function edge(a,b){if(!next.has(a))next.set(a,[]);next.get(a).push(b);}
  for(const k of largest){
    const x=k%w,y=Math.floor(k/w),v=y*stride+x;
    if(!y||!mask[k-w])edge(v,v+1);
    if(x===w-1||!mask[k+1])edge(v+1,v+1+stride);
    if(y===h-1||!mask[k+w])edge(v+stride+1,v+stride);
    if(!x||!mask[k-1])edge(v+stride,v);
  }
  let outline=[],largestArea=0;
  while(next.size){
    const start=next.keys().next().value;let cur=start;const loop=[];
    do{
      loop.push([cur%stride,Math.floor(cur/stride)]);
      const choices=next.get(cur);if(!choices)break;
      const v=choices.pop();if(!choices.length)next.delete(cur);cur=v;
    }while(cur!==start);
    const area=loop.reduce((a,p,i)=>{const q=loop[(i+1)%loop.length];return a+p[0]*q[1]-q[0]*p[1];},0);
    if(cur===start&&area>largestArea){largestArea=area;outline=loop;}
  }
  if(outline.length<4)return [];
  const far=outline.reduce((k,p,i)=>Math.hypot(p[0]-outline[0][0],p[1]-outline[0][1])>Math.hypot(outline[k][0]-outline[0][0],outline[k][1]-outline[0][1])?i:k,0);
  for(const eps of [1.15,1.8,2.5,3.5]){
    const pts=[...simplify(outline.slice(0,far+1),eps).slice(0,-1),...simplify([...outline.slice(far),outline[0]],eps).slice(0,-1)].map(([x,y])=>[x*image.width/w,y*image.height/h]);
    try{validateContour(pts,image);return pts;}catch{}
  }
  return [];
}
