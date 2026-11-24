// Renderizador ortográfico CPU, sem navegador, WebGL ou dependências novas.
import {Vector3} from '../vendor/engine.mjs';
import {buildScene,validate,metrics} from './model.js';
export const VIEWS={front:[0,0],back:[Math.PI,0],left:[Math.PI/2,0],right:[-Math.PI/2,0],iso:[.65,.22]};
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
export function renderViews(project,{size=512,views=Object.keys(VIEWS)}={}){
  validate(project,{empty:false});
  if(!Number.isInteger(size)||size<64||size>1024)throw Error('Resolução deve estar entre 64 e 1024.');
  if(!Array.isArray(views)||!views.length||views.some(v=>!Object.hasOwn(VIEWS,v))||new Set(views).size!==views.length)throw Error('Vistas inválidas.');
  const scene=buildScene(project);
  try{
    const meshes=[],audit=[];
    scene.root.traverse(o=>{
      if(!o.isMesh)return;
      const g=o.geometry,p=g.attributes.position,n=g.attributes.normal,uv=g.attributes.uv,idx=g.index?.array;
      const coords=new Float64Array(p.count*3),normals=new Float32Array(p.count*3);
      const inverse=o.matrixWorld.clone().invert().elements,v=new Vector3();
      for(let i=0;i<p.count;i++){
        v.fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld).toArray(coords,i*3);
        if(n){const x=n.getX(i),y=n.getY(i),z=n.getZ(i);v.set(inverse[0]*x+inverse[1]*y+inverse[2]*z,inverse[4]*x+inverse[5]*y+inverse[6]*z,inverse[8]*x+inverse[9]*y+inverse[10]*z).normalize().toArray(normals,i*3);}
      }
      const count=idx?.length??p.count,entry={id:o.userData.partId,vertices:p.count,triangles:count/3,degenerate:0,missingUV:!uv};
      for(let i=0;i<count;i+=3){
        const a=(idx?idx[i]:i)*3,b=(idx?idx[i+1]:i+1)*3,c=(idx?idx[i+2]:i+2)*3;
        const ab=[coords[b]-coords[a],coords[b+1]-coords[a+1],coords[b+2]-coords[a+2]],ac=[coords[c]-coords[a],coords[c+1]-coords[a+1],coords[c+2]-coords[a+2]];
        if(Math.hypot(ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0])<=1e-12)entry.degenerate++;
      }
      audit.push(entry);meshes.push({coords,normals,uv,idx,count,material:o.material});
    });
    const images={};
    for(const view of views)images[view]=render(meshes,size,VIEWS[view]);
    const warnings=[];
    for(const a of audit){
      if(a.degenerate)warnings.push(a.id+': '+a.degenerate+' triângulos degenerados (inclui possíveis costuras de primitivas).');
      if(a.missingUV)warnings.push(a.id+': UV ausente.');
    }
    for(const p of project.parts)if(p.profile?.form==='humanoid'&&(!p.profile.back||!p.profile.side))warnings.push(p.id+': costas/lateral estimadas a partir da referência.');
    return {images,report:{ok:true,name:project.name,...metrics(scene.root),resolution:size,views:Object.keys(images),meshAudit:audit,warnings,referenceComparison:compareFront(project,images.front)}};
  }finally{scene.dispose();}
}
function render(meshes,size,[yaw,pitch]){
  const cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch);
  let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
  const projected=meshes.map(m=>{
    const a=new Float64Array(m.coords.length);
    for(let i=0;i<a.length;i+=3){
      const [x,y,z]=m.coords.subarray(i,i+3),d=x*sy+z*cy;
      a[i]=x*cy-z*sy;a[i+1]=y*cp-d*sp;a[i+2]=d*cp+y*sp;
      minX=Math.min(minX,a[i]);maxX=Math.max(maxX,a[i]);minY=Math.min(minY,a[i+1]);maxY=Math.max(maxY,a[i+1]);
    }return a;
  });
  const scale=.86*size/Math.max(maxX-minX,maxY-minY,1e-9),cx=(maxX+minX)/2,cy2=(maxY+minY)/2;
  const rgba=new Uint8Array(size*size*4),zbuf=new Float64Array(size*size).fill(-Infinity);
  const linearToSRGB=x=>Math.round(255*clamp(x<=.0031308?12.92*x:1.055*Math.pow(x,1/2.4)-.055,0,1));
  for(let k=0;k<meshes.length;k++){
    const m=meshes[k],p=projected[k],col=m.material.color,tex=m.material.map?.image;
    for(let i=0;i<p.length;i+=3){p[i]=size/2+(p[i]-cx)*scale;p[i+1]=size/2-(p[i+1]-cy2)*scale;}
    for(let i=0;i<m.count;i+=3){
      const a=m.idx?m.idx[i]:i,b=m.idx?m.idx[i+1]:i+1,c=m.idx?m.idx[i+2]:i+2,A=a*3,B=b*3,C=c*3;
      const ax=p[A],ay=p[A+1],bx=p[B],by=p[B+1],cx=p[C],cy=p[C+1],area=(bx-ax)*(cy-ay)-(by-ay)*(cx-ax);
      if(area>=-1e-9)continue;
      const left=clamp(Math.floor(Math.min(ax,bx,cx)),0,size-1),right=clamp(Math.ceil(Math.max(ax,bx,cx)),0,size-1);
      const top=clamp(Math.floor(Math.min(ay,by,cy)),0,size-1),bottom=clamp(Math.ceil(Math.max(ay,by,cy)),0,size-1);
      for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++){
        const dx=x+.5-ax,dy=y+.5-ay,wb=(dx*(cy-ay)-dy*(cx-ax))/area,wc=((bx-ax)*dy-(by-ay)*dx)/area,wa=1-wb-wc;
        if(Math.min(wa,wb,wc)<-1e-6)continue;
        const pixel=y*size+x,z=wa*p[A+2]+wb*p[B+2]+wc*p[C+2];
        if(z<=zbuf[pixel])continue;zbuf[pixel]=z;
        const ny=wa*m.normals[A+1]+wb*m.normals[B+1]+wc*m.normals[C+1],nx=wa*m.normals[A]+wb*m.normals[B]+wc*m.normals[C],nz=wa*m.normals[A+2]+wb*m.normals[B+2]+wc*m.normals[C+2];
        const lit=.72+.28*Math.max(0,ny*.6+(nx*Math.sin(yaw)+nz*Math.cos(yaw))*.8);
        let rgb=[linearToSRGB(col.r),linearToSRGB(col.g),linearToSRGB(col.b)];
        if(tex?.data&&m.uv){
          const u=wa*m.uv.getX(a)+wb*m.uv.getX(b)+wc*m.uv.getX(c),v=wa*m.uv.getY(a)+wb*m.uv.getY(b)+wc*m.uv.getY(c);
          const t=4*(clamp(Math.floor(v*tex.height),0,tex.height-1)*tex.width+clamp(Math.floor(u*tex.width),0,tex.width-1));
          rgb=rgb.map((v,i)=>v*tex.data[t+i]/255);
        }
        for(let j=0;j<3;j++)rgba[pixel*4+j]=Math.round(rgb[j]*lit);
        rgba[pixel*4+3]=255;
      }
    }
  }
  return {width:size,height:size,data:rgba,projection:{scale,cx,cy:cy2}};
}
function compareFront(project,image){
  const parts=project.parts.filter(p=>p.shape!=='group'),p=parts[0];
  if(!image||parts.length!==1||p.shape!=='profile'||p.parent!==null||p.rotation.some(x=>x!==0)||p.scale.some(x=>x!==1))return null;
  const points=p.profile.points,xs=points.map(x=>x[0]),ys=points.map(x=>x[1]),l=Math.min(...xs),r=Math.max(...xs),t=Math.min(...ys),b=Math.max(...ys);
  const {scale,cx,cy}=image.projection,s=image.width;
  const poly=points.map(([x,y])=>[s/2+((x-l)/(r-l)*p.size[0]-p.size[0]/2+p.position[0]-cx)*scale,s/2-((.5-(y-t)/(b-t))*p.size[1]+p.position[1]-cy)*scale]);
  let union=0,intersection=0;
  for(let y=0;y<s;y++)for(let x=0;x<s;x++){
    let inside=false;
    for(let i=0,j=poly.length-1;i<poly.length;j=i++){
      const [ax,ay]=poly[i],[bx,by]=poly[j];
      if((ay>y+.5)!==(by>y+.5)&&x+.5<(bx-ax)*(y+.5-ay)/(by-ay)+ax)inside=!inside;
    }
    const visible=image.data[(y*s+x)*4+3]>0;
    if(inside||visible)union++;if(inside&&visible)intersection++;
  }
  return {type:'contour-iou',iou:union?+(intersection/union).toFixed(4):0, note:'Compara o contorno fornecido com a projeção frontal; não mede fidelidade facial ou realismo.'};
}
