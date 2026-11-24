import {BufferGeometry, Float32BufferAttribute, ShapeUtils, Vector2} from '../vendor/engine.mjs';
import {bounds} from './profile.js';
import {anatomy,spans} from './silhouette.js';
import {photoRelief,projectSide} from './photo-detail.js';
import {pixels,pixelOffset,compress} from './raster.js';

const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const mix=(a,b,t)=>a+(b-a)*t;
function body(points){
  const b=bounds(points);
  return anatomy(points)||{bounds:b,center:b.left+b.width*.5,chestWidth:b.width*.31,armTop:.18,armBottom:.34};
}
export function suggestedDepth(points,width,volume=1){
  const info=body(points);
  return width*info.chestWidth/info.bounds.width*.68*volume;
}
function nearestBoundary(p,poly){
  let squared=Infinity;
  for(let i=0;i<poly.length;i++){
    const a=poly[i],b=poly[(i+1)%poly.length],dx=b[0]-a[0],dy=b[1]-a[1];
    const t=clamp(((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy),0,1);
    squared=Math.min(squared,(p[0]-a[0]-dx*t)**2+(p[1]-a[1]-dy*t)**2);
  }
  return Math.sqrt(squared);
}
function segmentWidth(intervals,x,fallback){
  const s=intervals.find(([a,b])=>a<=x&&x<=b);
  return s?s[1]-s[0]:fallback;
}
const turn=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
function triangulate(points){
  const faces=ShapeUtils.triangulateShape(points.map(([x,y])=>new Vector2(x,-y)),[]);
  if(faces.length===points.length-2&&faces.every(([a,b,c])=>turn(points[a],points[b],points[c])<-1e-8))return faces;
  // Evita diagonais que passam por outro vértice do contorno em silhuetas recortadas por pixels.
  const polygon=points.map((_,i)=>i),triangles=[];
  const area=points.reduce((sum,p,i)=>sum+turn(points[0],p,points[(i+1)%points.length]),0);
  if(area>0)polygon.reverse();
  while(polygon.length>3){
    let ear=-1,shortest=Infinity;
    for(let i=0;i<polygon.length;i++){
      const a=points[polygon[(i+polygon.length-1)%polygon.length]];
      const b=points[polygon[i]],c=points[polygon[(i+1)%polygon.length]];
      const length=(a[0]-c[0])**2+(a[1]-c[1])**2;
      if(length>=shortest||turn(a,b,c)>=-1e-8)continue;
      const occupied=polygon.some(j=>{
        const p=points[j];
        return p!==a&&p!==b&&p!==c&&turn(a,b,p)<=1e-8&&turn(b,c,p)<=1e-8&&turn(c,a,p)<=1e-8;
      });
      if(!occupied){ear=i;shortest=length;}
    }
    if(ear<0)throw Error('Ajuste os pontos muito próximos ou alinhados no contorno.');
    triangles.push([polygon[(ear+polygon.length-1)%polygon.length],polygon[ear],polygon[(ear+1)%polygon.length]]);
    polygon.splice(ear,1);
  }
  triangles.push(polygon);
  return triangles;
}
// Subdivisão conforme: os triângulos vizinhos compartilham o mesmo ponto médio.
function tessellate(outline,density){
  const contour=outline.filter((p,i)=>{
    const a=outline[(i+outline.length-1)%outline.length],b=outline[(i+1)%outline.length];
    return Math.abs((p[0]-a[0])*(b[1]-p[1])-(p[1]-a[1])*(b[0]-p[0]))>1e-8;
  });
  const points=contour.map(p=>p.slice());
  let triangles=triangulate(points);
  const b=bounds(points),step=Math.max(b.width,b.height)/density;
  for(let pass=0;pass<7;pass++){
    const mids=new Map(),out=[];
    function mid(i,j){
      const a=points[i],b=points[j];if(Math.hypot(a[0]-b[0],a[1]-b[1])<=step)return -1;
      const key=Math.min(i,j)+','+Math.max(i,j);
      if(!mids.has(key)){mids.set(key,points.length);points.push([(a[0]+b[0])/2,(a[1]+b[1])/2]);}
      return mids.get(key);
    }
    for(const [a,b,c] of triangles){
      const u=mid(a,b),v=mid(b,c),w=mid(c,a);
      if(u>=0&&v>=0&&w>=0)out.push([a,u,w],[u,b,v],[w,v,c],[u,v,w]);
      else if(u>=0&&v>=0)out.push([u,b,v],[a,u,c],[u,v,c]);
      else if(v>=0&&w>=0)out.push([v,c,w],[b,v,a],[v,w,a]);
      else if(w>=0&&u>=0)out.push([w,a,u],[c,w,b],[w,u,b]);
      else if(u>=0)out.push([a,u,c],[u,b,c]);
      else if(v>=0)out.push([b,v,a],[v,c,a]);
      else if(w>=0)out.push([c,w,b],[w,a,b]);
      else out.push([a,b,c]);
    }
    triangles=out;if(!mids.size)break;
  }
  // Uma orelha curta pode ter somente vértices no contorno. Acrescente um ponto interno.
  const distances=points.map(p=>nearestBoundary(p,contour));
  const split=new Map(),edge=(i,j)=>Math.min(i,j)+','+Math.max(i,j);
  for(const tri of triangles)for(let k=0;k<3;k++){
    const i=tri[k],j=tri[(k+1)%3],key=edge(i,j);
    if(distances[i]>1e-6||distances[j]>1e-6||split.has(key))continue;
    const mid=points[i].map((v,axis)=>(v+points[j][axis])/2),d=nearestBoundary(mid,contour);
    if(d>1e-6){split.set(key,points.length);points.push(mid);distances.push(d);}
  }
  const out=[];
  for(const tri of triangles){
    const ring=[];
    for(let k=0;k<3;k++){
      const i=tri[k],j=tri[(k+1)%3],mid=split.get(edge(i,j));
      ring.push(i);if(mid!==undefined)ring.push(mid);
    }
    if(ring.length===3&&tri.some(i=>distances[i]>1e-6)){out.push(tri);continue;}
    const center=[0,1].map(k=>tri.reduce((s,i)=>s+points[i][k],0)/3),id=points.length;
    points.push(center);distances.push(nearestBoundary(center,contour));
    for(let k=0;k<ring.length;k++)out.push([ring[k],ring[(k+1)%ring.length],id]);
  }
  return {points,triangles:out,distances};
}
export function sideDepth(points,height,volume=1){
  const box=bounds(points);
  return height*box.width/box.height*volume;
}
function sideEnvelope(side){
  if(!side)return null;
  const box=bounds(side.points),direction=side.facing==='left'?-1:1;
  const rows=Array.from({length:129},(_,i)=>{
    const y=box.top+clamp(i/128,.0001,.9999)*box.height;
    const intervals=spans(side.points,y);
    const middle=box.left+box.width*.5;
    if(!intervals.length)return [0,0];
    const a=(intervals[0][0]-middle)/box.width*direction;
    const b=(intervals.at(-1)[1]-middle)/box.width*direction;
    return [Math.min(a,b),Math.max(a,b)];
  });
  return v=>{
    const i=clamp(v,0,1)*128,lo=Math.floor(i),hi=Math.ceil(i);
    return rows[lo].map((n,index)=>mix(n,rows[hi][index],i-lo));
  };
}
export function characterGeometry(outline,size,side,ref,detail=0){
  const {points,triangles,distances}=tessellate(outline,detail>0?56:40),info=body(outline),b=info.bounds;
  const swapped=outline.map(([x,y])=>[y,x]),half=info.chestWidth*.5;
  const lateral=sideEnvelope(side),roundness=[],centerDepth=[],noseProfile=[];
  const relief=ref&&detail>0?photoRelief(ref,b):null;
  const thickness=points.map(([x,y],i)=>{
    const row=(y-b.top)/b.height,armZone=row>info.armTop-.055&&row<info.armBottom+.055;
    let radius=segmentWidth(spans(outline,y),x,2*half)*.5;
    if(armZone)radius=Math.min(radius,half*1.08);
    const head=row<info.armTop,legs=row>.58;
    const limbWeight=armZone?clamp((Math.abs(x-info.center)/half-.70)/.55,0,1):0;
    const armRadius=Math.min(half*.65,segmentWidth(spans(swapped,x),y,half*.62)*.5);
    const localRadius=Math.max(.001,mix(radius,armRadius,limbWeight));
    const peak=mix(radius*(head?.93:legs?.87:.67),armRadius*.91,limbWeight);
    const k=clamp(distances[i]/localRadius,0,1);
    const curve=distances[i]<1e-6?0:Math.sqrt(k*(2-k));
    if(lateral){
      const [rear,front]=lateral(row);
      centerDepth[i]=(front+rear)*.5;
      // Preserva a separação das duas faces quando o perfil lateral afunila.
      roundness[i]=curve===0?0:Math.max(.00002,Math.max(.006,(front-rear)*.5)*mix(1,.52,limbWeight)*curve);
      if(head&&curve>0&&row>info.armTop*.3){
        const average=(lateral(row-.021)[1]+lateral(row+.021)[1])*.5;
        const prominence=clamp(front-average,0,(front-rear)*.18);
        const offset=(x-info.center)/localRadius;
        noseProfile[i]=-prominence*(1-Math.exp(-offset*offset*8))*curve;
      }
    }
    return distances[i]<1e-6?0:Math.max(.000001,peak*curve);
  });
  const max=thickness.reduce((a,b)=>Math.max(a,b),0),positions=[],uv=[],indices=[],n=points.length;
  for(const front of [true,false])points.forEach(([x,y],i)=>{
    const u=(x-b.left)/b.width,v=(y-b.top)/b.height;
    const sign=front?1:-1;
    const radius=lateral?roundness[i]:thickness[i]/max*.5;
    const displacement=front&&relief&&radius>0?clamp(relief(x,y,distances[i])*detail*size[1]*.018,-radius*size[2]*.4,radius*size[2]*.65):0;
    const z=(lateral?centerDepth[i]:0)+sign*radius+(front?(noseProfile[i]??0):0);
    positions.push((u-.5)*size[0],(.5-v)*size[1],z*size[2]+displacement);
    uv.push((front?u:1+u)*.5,v);
  });
  for(const [a,b,c] of triangles)indices.push(a,b,c,c+n,b+n,a+n);
  const geo=new BufferGeometry();
  geo.setAttribute('position',new Float32BufferAttribute(positions,3));geo.setAttribute('uv',new Float32BufferAttribute(uv,2));geo.setIndex(indices);geo.computeVertexNormals();
  // Costura com UVs distintos, mas normal contínua na silhueta.
  const normals=geo.attributes.normal;
  points.forEach((_,i)=>{if(thickness[i]===0){
    const x=normals.getX(i)+normals.getX(n+i),y=normals.getY(i)+normals.getY(n+i),z=normals.getZ(i)+normals.getZ(n+i);
    const length=Math.hypot(x,y,z);
    if(length>1e-6){
      normals.setXYZ(i,x/length,y/length,z/length);
      normals.setXYZ(n+i,x/length,y/length,z/length);
    }
  }});
  for(let i=0;i<normals.count;i++)if(Math.hypot(normals.getX(i),normals.getY(i),normals.getZ(i))<1e-6){
    normals.setXYZ(i,0,0,i<n?1:-1);
  }
  return geo;
}
const atlases=new Map();
export function characterAtlas(ref,points,back,lateral){
  const key=JSON.stringify([points,lateral?.side.points,lateral?.side.facing,lateral?.size,lateral?.detail]),cached=atlases.get(ref.image);
  const sideImage=lateral?.side.ref.image;
  const rearKey=back?JSON.stringify(back.points):null;
  if(cached?.key===key&&cached.rearKey===rearKey&&cached.rearImage===back?.ref.image&&cached.sideImage===sideImage)return cached;
  const source=pixels(ref.image),b=bounds(points);
  if(source.width!==ref.width||source.height!==ref.height)throw Error('A resolução da foto diverge da referência salva.');
  const rear=back?pixels(back.ref.image):null,rearBounds=back?bounds(back.points):null;
  if(rear&&(rear.width!==back.ref.width||rear.height!==back.ref.height))throw Error('A resolução da foto das costas diverge da referência salva.');
  const maxSide=896,projectedHeight=lateral?bounds(lateral.side.points).height:0,rearHeight=rearBounds?.height??0;
  const ratio=Math.min(maxSide/Math.max(b.width,b.height),Math.max(1,rearHeight/b.height,projectedHeight/b.height));
  const w=Math.max(8,Math.round(b.width*ratio)),h=Math.max(8,Math.round(b.height*ratio));
  const image={width:w*2,height:h,data:new Uint8Array(w*2*h*4)};
  const src=source.data,out=image.data,info=body(points);
  const vertical=points.map(([x,y])=>[y,x]);
  const columns=Array.from({length:w},(_,col)=>{
    const x=b.left+(col+.5)*b.width/w;
    return spans(vertical,x);
  });
  function localColor(x,y,dx,dy){
    const rgb=[0,0,0];
    for(const ox of [-1,0,1])for(const oy of [-1,0,1]){
      const i=pixelOffset(source,x+ox*dx,y+oy*dy);
      for(let k=0;k<3;k++)rgb[k]+=src[i+k]/9;
    }
    return rgb;
  }
  for(let row=0;row<h;row++){
    const y=b.top+(row+.5)*b.height/h;
    const rearY=rearBounds?rearBounds.top+(row+.5)*rearBounds.height/h:0;
    const rearSpans=rear?spans(back.points,rearY):[];
    const sections=spans(points,y).map(([a,end])=>{
      const span=end-a,inset=Math.min(span*.18,Math.max(1,1.3/ratio));
      const inArms=(y-b.top)/b.height>info.armTop-.04&&(y-b.top)/b.height<info.armBottom+.04&&span>info.chestWidth*1.4;
      const left=inArms?info.center-info.chestWidth*.5:a,right=inArms?info.center+info.chestWidth*.5:end;
      const delta=right-left;
      return {a,b:end,inset,left,right,inArms,
        backL:localColor(left+delta*.17,y,delta*.042,Math.max(.7,source.height*.008)),
        backR:localColor(right-delta*.17,y,delta*.042,Math.max(.7,source.height*.008))};
    });
    if(!sections.length)continue;
    for(let col=0;col<w;col++){
      const x=b.left+(col+.5)*b.width/w;
      let section=sections[0],best=Infinity;
      for(const s of sections){const delta=Math.max(0,s.a-x,x-s.b);if(delta<best){best=delta;section=s;}}
      const i=pixelOffset(source,clamp(x,section.a+section.inset,section.b-section.inset),y),f=4*(row*2*w+col),r=f+4*w;
      const across=clamp((x-section.left)/(section.right-section.left),0,1);
      if(rearSpans.length){
        const expected=rearBounds.left+(1-(x-b.left)/b.width)*rearBounds.width;
        let interval=rearSpans[rearSpans.length-1-sections.indexOf(section)],mapped=expected;
        if(rearSpans.length===sections.length){
          const fraction=clamp((x-section.a)/(section.b-section.a),0,1);
          mapped=mix(interval[1],interval[0],fraction);
        }else{
          interval=rearSpans.reduce((best,current)=>{
            const distance=([lo,hi])=>Math.max(0,lo-expected,expected-hi);
            return distance(current)<distance(best)?current:best;
          });
        }
        const [lo,hi]=interval,inset=Math.min(1.25,(hi-lo)*.15);
        const sample=pixelOffset(rear,clamp(mapped,lo+inset,hi-inset),rearY);
        for(let c=0;c<3;c++){out[f+c]=src[i+c];out[r+c]=rear.data[sample+c];}
        out[f+3]=out[r+3]=255;
        continue;
      }
      let sleeve=null;
      const armWeight=section.inArms?clamp((Math.abs(x-info.center)/info.chestWidth-.39)/.25,0,1):0;
      if(armWeight){
        const column=columns[col].find(([a,b])=>a<=y&&y<=b);
        if(column){const [lo,hi]=column;sleeve=localColor(x,mix(lo,hi,.46),Math.max(.6,source.width*.005),(hi-lo)*.12);}
      }
      for(let c=0;c<3;c++){
        out[f+c]=src[i+c];
        const base=mix(section.backL[c],section.backR[c],across);
        out[r+c]=Math.round((sleeve?mix(base,sleeve[c],armWeight):base)*.94);
      }
      out[f+3]=out[r+3]=255;
    }
  }
  if(lateral)projectSide(image,lateral.geometry,lateral.side,lateral.size[2],points,b);
  const entry={key,sideImage,rearKey,rearImage:back?.ref.image,image,encoded:null};
  if(atlases.size>=3)atlases.delete(atlases.keys().next().value);
  atlases.set(ref.image,entry);return entry;
}
export function characterJPEG(ref,points,back,lateral){
  const atlas=characterAtlas(ref,points,back,lateral);
  return atlas.encoded??=compress(atlas.image);
}
