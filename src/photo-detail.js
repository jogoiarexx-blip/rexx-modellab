import {bounds} from './profile.js';
import {pixels,pixelOffset} from './raster.js';
import {spans} from './silhouette.js';

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const smooth=value=>value*value*(3-2*value);

export function photoRelief(ref,box){
  const image=pixels(ref.image);
  if(image.width!==ref.width||image.height!==ref.height)throw Error('A resolução da foto frontal diverge da referência salva.');
  const radius=Math.max(2,box.height*.017);
  function luma(x,y){
    const i=pixelOffset(image,x,y),p=image.data;
    return (.2126*p[i]+.7152*p[i+1]+.0722*p[i+2])/255;
  }
  return (x,y,distance)=>{
    const center=(2*luma(x,y)+luma(x-radius*.24,y)+luma(x+radius*.24,y)+luma(x,y-radius*.24)+luma(x,y+radius*.24))/6;
    const average=(luma(x-radius,y)+luma(x+radius,y)+luma(x,y-radius)+luma(x,y+radius))*.25;
    return clamp((center-average)*2,-.32,.65)*smooth(clamp(distance/(radius*1.3),0,1));
  };
}

function rasterize(index,vertices,width,height,visit){
  for(let i=0;i<index.length;i+=3){
    const a=vertices[index[i]],b=vertices[index[i+1]],c=vertices[index[i+2]];
    const bx=b[0]-a[0],by=b[1]-a[1],cx=c[0]-a[0],cy=c[1]-a[1],area=bx*cy-by*cx;
    if(Math.abs(area)<1e-8)continue;
    const left=Math.max(0,Math.floor(Math.min(a[0],b[0],c[0]))),right=Math.min(width-1,Math.floor(Math.max(a[0],b[0],c[0])));
    const top=Math.max(0,Math.floor(Math.min(a[1],b[1],c[1]))),bottom=Math.min(height-1,Math.floor(Math.max(a[1],b[1],c[1])));
    for(let row=top;row<=bottom;row++){
      const dy=row+.5-a[1];
      for(let col=left;col<=right;col++){
        const dx=col+.5-a[0],v=(dx*cy-dy*cx)/area,w=(bx*dy-by*dx)/area,u=1-v-w;
        if(Math.min(u,v,w)>=-1e-7)visit(col,row,a,b,c,u,v,w);
      }
    }
  }
}

export function projectSide(atlas,geometry,side,depth,outline,frontBox){
  const photo=pixels(side.ref.image),box=bounds(side.points);
  if(photo.width!==side.ref.width||photo.height!==side.ref.height)throw Error('A resolução da foto de perfil diverge da referência salva.');
  const direction=side.facing==='left'?1:-1;
  const {width,height,data}=atlas,{position,normal,uv}=geometry.attributes,index=geometry.index.array;
  const rows=Array.from({length:height},(_,row)=>{
    const y=box.top+(row+.5)*box.height/height;
    return {y,intervals:spans(side.points,y)};
  });
  const vertices=Array.from({length:position.count},(_,i)=>[
    uv.getX(i)*width,uv.getY(i)*height,position.getZ(i)/depth,
    normal.getX(i)*direction,normal.getZ(i),position.getX(i)*direction
  ]);
  const mapW=192,mapH=256;
  const screen=vertices.map((v,i)=>[(.5-direction*v[2])*mapW,uv.getY(i)*mapH,v[5]]);
  const visibility=new Float32Array(mapW*mapH).fill(-Infinity);
  rasterize(index,screen,mapW,mapH,(col,row,a,b,c,u,v,w)=>{
    const offset=row*mapW+col;
    visibility[offset]=Math.max(visibility[offset],a[2]*u+b[2]*v+c[2]*w);
  });
  const padding=new Uint8Array(width*height);
  geometry.computeBoundingBox();
  const tolerance=(geometry.boundingBox.max.x-geometry.boundingBox.min.x)*.045;
  rasterize(index,vertices,width,height,(col,row,a,b,c,u,v,w)=>{
    const nx=a[3]*u+b[3]*v+c[3]*w,nz=a[4]*u+b[4]*v+c[4]*w;
    const weight=smooth(clamp((nx-Math.abs(nz)*.22-.29)/.63,0,1));
    if(weight<=0)return;
    const lateral=.5-direction*(a[2]*u+b[2]*v+c[2]*w);
    const sampleCol=clamp(Math.floor(lateral*mapW),0,mapW-1);
    const sampleRow=Math.floor((row+.5)*mapH/height);
    const distance=visibility[sampleRow*mapW+sampleCol]-(a[5]*u+b[5]*v+c[5]*w);
    const visible=smooth(1-clamp((distance-tolerance)/tolerance,0,1));
    if(visible<=0)return;
    const {y,intervals}=rows[row],projectedX=box.left+lateral*box.width;
    const interval=intervals.find(([lo,hi])=>projectedX>=lo-1&&projectedX<=hi+1);
    if(!interval)return;
    const [lo,hi]=interval,inset=Math.min(1,(hi-lo)*.17);
    const source=pixelOffset(photo,clamp(projectedX,lo+inset,hi-inset),y),target=4*(row*width+col);
    for(let channel=0;channel<3;channel++)data[target+channel]+=(photo.data[source+channel]-data[target+channel])*weight*visible;
    padding[target/4]=1;
  });
  // Preenche até dois pixels fora da silhueta para preservar as bordas sob filtragem.
  for(let row=0;row<height;row++){
    const valid=spans(outline,frontBox.top+(row+.5)*frontBox.height/height);
    const half=width/2;
    for(const [lo,hi] of valid){
      const first=Math.ceil((lo-frontBox.left)*half/frontBox.width-.5);
      const last=Math.floor((hi-frontBox.left)*half/frontBox.width-.5);
      if(first>last)continue;
      for(const offset of [0,half]){
        for(const [edge,step] of [[first,-1],[last,1]]){
          const source=row*width+offset+edge;
          if(!padding[source])continue;
          for(let d=1;d<=2;d++){
            const col=edge+step*d;
            const x=frontBox.left+(col+.5)*frontBox.width/half;
            if(col<0||col>=half||valid.some(([a,b])=>a<=x&&x<=b))break;
            data.copyWithin(4*(row*width+offset+col),source*4,source*4+4);
          }
        }
      }
    }
  }
}
