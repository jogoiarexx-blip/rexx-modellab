import {characterGeometry,characterAtlas} from './character.js';

let cached;
function mesh(ref,points,size,side,detail){
  const key=JSON.stringify([points,size,side?.points,side?.facing,detail]);
  if(key!==cached?.key||ref.image!==cached?.image){
    cached?.geometry.dispose();cached={key,image:ref.image,geometry:characterGeometry(points,size,side,ref,detail)};
  }
  return cached.geometry;
}
// O teste de profundidade mantém os braços e as pernas na ordem correta em todas as vistas.
export function drawCharacter(canvas,ref,points,size,view,tint='#ffffff',back,side,detail){
  const geo=mesh(ref,points,size,side,detail);
  const atlas=characterAtlas(ref,points,back,side?{geometry:geo,side,size,detail}:undefined).image;
  const pos=geo.attributes.position,norm=geo.attributes.normal,uv=geo.attributes.uv;
  const yaw={front:0,iso:.63,side:side?.facing==="right"?-Math.PI/2:Math.PI/2,back:Math.PI}[view],pitch=view==='iso'?.13:0;
  const cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch);
  const width=canvas.width,height=canvas.height,scale=.92*Math.min(width/Math.max(size[0],size[2]),height/size[1]);
  const vertices=new Float32Array(pos.count*4),tints=[1,3,5].map(i=>parseInt(tint.slice(i,i+2),16)/255);
  for(let i=0;i<pos.count;i++){
    const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i),depth=x*sy+z*cy,k=i*4;
    vertices[k]=width*.5+(cy*x-sy*z)*scale;vertices[k+1]=height*.5+(sp*depth-cp*y)*scale;
    vertices[k+2]=depth*cp+sp*y;
    vertices[k+3]=.86+.14*Math.max(0,norm.getY(i)*.55+Math.abs(norm.getZ(i))*.82-norm.getX(i)*.23);
  }
  const ctx=canvas.getContext('2d'),output=ctx.createImageData(width,height),rgba=output.data;
  const zbuffer=new Float32Array(width*height).fill(-Infinity),idx=geo.index.array;
  for(let i=0;i<idx.length;i+=3){
    const a=idx[i],b=idx[i+1],c=idx[i+2],A=a*4,B=b*4,C=c*4;
    const ax=vertices[A],ay=vertices[A+1],bx=vertices[B],by=vertices[B+1],cx=vertices[C],cy=vertices[C+1];
    const area=(bx-ax)*(cy-ay)-(by-ay)*(cx-ax);
    if(area>=-1e-6)continue;
    const left=Math.max(0,Math.floor(Math.min(ax,bx,cx))),right=Math.min(width-1,Math.ceil(Math.max(ax,bx,cx)));
    const top=Math.max(0,Math.floor(Math.min(ay,by,cy))),bottom=Math.min(height-1,Math.ceil(Math.max(ay,by,cy)));
    for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++){
      const dx=x+.5-ax,dy=y+.5-ay,wb=(dx*(cy-ay)-dy*(cx-ax))/area,wc=((bx-ax)*dy-(by-ay)*dx)/area,wa=1-wb-wc;
      if(Math.min(wa,wb,wc)<-1e-5)continue;
      const pixel=y*width+x,z=wa*vertices[A+2]+wb*vertices[B+2]+wc*vertices[C+2];
      if(z<=zbuffer[pixel])continue;zbuffer[pixel]=z;
      const u=wa*uv.getX(a)+wb*uv.getX(b)+wc*uv.getX(c),v=wa*uv.getY(a)+wb*uv.getY(b)+wc*uv.getY(c);
      const pixelX=Math.max(0,Math.min(atlas.width-1,Math.floor(u*atlas.width))),pixelY=Math.max(0,Math.min(atlas.height-1,Math.floor(v*atlas.height)));
      const src=4*(pixelY*atlas.width+pixelX),dst=pixel*4,light=wa*vertices[A+3]+wb*vertices[B+3]+wc*vertices[C+3];
      for(let k=0;k<3;k++)rgba[dst+k]=atlas.data[src+k]*light*tints[k];rgba[dst+3]=255;
    }
  }
  ctx.putImageData(output,0,0);
}
