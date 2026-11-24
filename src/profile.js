import {BufferGeometry, Float32BufferAttribute, ShapeUtils, Vector2} from '../vendor/engine.mjs';

export const MAX_POINTS = 192;
const pixelTolerance = 1e-5;
const cross = (a,b,c) => (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const dist = (a,b) => Math.hypot(b[0]-a[0],b[1]-a[1]);
const positive = n => Number.isFinite(n) && n >= .00001 && n <= 10000;
const sign = n => Math.abs(n) < 1e-7 ? 0 : Math.sign(n);
function contains(a,b,p) {
  return [0,1].every(i => p[i]>=Math.min(a[i],b[i])-pixelTolerance && p[i]<=Math.max(a[i],b[i])+pixelTolerance);
}
function intersect(a,b,c,d) {
  const s=sign(cross(a,b,c)),t=sign(cross(a,b,d)),u=sign(cross(c,d,a)),v=sign(cross(c,d,b));
  return (s*t<0 && u*v<0) || (!s&&contains(a,b,c)) || (!t&&contains(a,b,d)) || (!u&&contains(c,d,a)) || (!v&&contains(c,d,b));
}
function checkPoint(p,ref){
  if(!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite)||p[0]<0||p[0]>ref.width||p[1]<0||p[1]>ref.height) throw Error('O ponto precisa estar dentro da imagem de referência.');
}
export function validateReference(ref){
  if(!Number.isInteger(ref.width)||!Number.isInteger(ref.height)||Math.min(ref.width,ref.height)<1||Math.max(ref.width,ref.height)>2048) throw Error('A referência aceita até 2.048 pixels por lado.');
  if(typeof ref.image!=='string'||ref.image.length>3700000||!ref.image.startsWith('data:image/jpeg;base64,/9j/')||!/^[A-Za-z0-9+/]+={0,2}$/.test(ref.image.slice(23))) throw Error('A referência deve conter a imagem JPEG incorporada ao projeto.');
}
export function bounds(points) {
  const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
  const left=Math.min(...xs),top=Math.min(...ys);
  return {left,top,width:Math.max(...xs)-left,height:Math.max(...ys)-top};
}
export function validateContour(points,ref){
  if(!Array.isArray(points)||points.length<3||points.length>MAX_POINTS) throw Error('Marque de 3 a '+MAX_POINTS+' pontos ao redor do objeto.');
  points.forEach(p=>checkPoint(p,ref));
  const count=points.length;
  for(let i=0;i<count;i++){
    const a=points[i],b=points[(i+1)%count],c=points[(i+2)%count];
    if(dist(a,b)<pixelTolerance) throw Error('Dois pontos coincidem. Mova ou remova um deles.');
    if(!sign(cross(a,b,c)) && (contains(a,b,c)||contains(b,c,a))) throw Error('Duas arestas estão sobrepostas. Ajuste os pontos.');
    for(let j=i+2;j<count;j++){
      if(i===0&&j===count-1)continue;
      if(intersect(a,b,points[j],points[(j+1)%count])) throw Error('O contorno se cruza. Ajuste os pontos para formar uma única borda.');
    }
  }
  const twiceArea=points.reduce((sum,p,i)=>sum+cross(points[0],p,points[(i+1)%count]),0);
  if(Math.abs(twiceArea)<1e-5) throw Error('O contorno precisa envolver uma área.');
}
export function profileSize(profile,ref,width,depth){
  validateContour(profile.points,ref);
  const b=bounds(profile.points);
  let perPixel=width/b.width;
  if(profile.calibration){
    const {a,b:end,meters}=profile.calibration;
    checkPoint(a,ref);checkPoint(end,ref);
    const length=dist(a,end);
    if(length<.5||!positive(meters)) throw Error('Marque duas extremidades distintas e informe a distância real em metros.');
    perPixel=meters/length;
  }
  const size=[b.width*perPixel,b.height*perPixel,depth];
  if(!size.every(positive)) throw Error('Largura, altura e profundidade precisam estar entre 0,00001 m e 10.000 m.');
  return size;
}
export function validateProfile(node,ref,rearRef,sideRef){
  if(!node.profile||!ref) throw Error('Referência do perfil ausente em '+node.name+'.');
  if(node.profile.form!=null&&!['rigid','humanoid'].includes(node.profile.form))throw Error('Modo de modelagem desconhecido.');
  if(node.profile.volume!=null&&(!Number.isFinite(node.profile.volume)||node.profile.volume<.5||node.profile.volume>1.5))throw Error('Volume do personagem inválido.');
  if(node.profile.back!=null){
    if(node.profile.form!=='humanoid'||!rearRef)throw Error('Selecione um personagem e uma referência válida para as costas.');
    validateContour(node.profile.back.points,rearRef);
  }
  const detail=node.profile.detail;
  if(detail!=null&&(node.profile.form!=='humanoid'||!Number.isFinite(detail)||detail<0||detail>1))throw Error('O relevo deve ficar entre 0% e 100%.');
  const side=node.profile.side;
  if(side!=null){
    if(node.profile.form!=='humanoid'||!sideRef||!['left','right'].includes(side.facing))throw Error('Selecione uma referência lateral e a direção do rosto.');
    validateContour(side.points,sideRef);
  }
  const size=profileSize(node.profile,ref,node.size[0],node.size[2]);
  if(size.some((v,i)=>Math.abs(v-node.size[i])>Math.max(1e-9,v*1e-6))) throw Error('As dimensões do perfil divergem da escala do contorno em '+node.name+'.');
}
export function profileGeometry(points,size){
  const b=bounds(points),[width,height,depth]=size;
  // Remover pontos colineares da malha preserva a mesma borda nas tampas e nas laterais.
  const corners=points.filter((p,i)=>sign(cross(points[(i+points.length-1)%points.length],p,points[(i+1)%points.length])));
  const path=corners.map(([x,y])=>new Vector2(((x-b.left)/b.width-.5)*width,(.5-(y-b.top)/b.height)*height));
  if(ShapeUtils.isClockWise(path))path.reverse();
  const faces=ShapeUtils.triangulateShape(path,[]),n=path.length;
  if(faces.length!==n-2) throw Error('A triangulação do contorno ficou incompleta.');
  const positions=[],uv=[],indices=[];
  for(const z of [depth/2,-depth/2])for(const p of path){positions.push(p.x,p.y,z);uv.push(.5+p.x/width,.5+p.y/height);}
  for(const f of faces){let [a,b,c]=f;if((path[b].x-path[a].x)*(path[c].y-path[a].y)-(path[b].y-path[a].y)*(path[c].x-path[a].x)<0)[b,c]=[c,b];
    indices.push(a,b,c,n+c,n+b,n+a);
  }
  for(let i=0;i<n;i++){const a=path[i],b=path[(i+1)%n],k=positions.length/3;
    positions.push(a.x,a.y,-depth/2,b.x,b.y,-depth/2,b.x,b.y,depth/2,a.x,a.y,depth/2);
    uv.push(0,0,1,0,1,1,0,1);indices.push(k,k+1,k+2,k,k+2,k+3);
  }
  const geo=new BufferGeometry();
  geo.setAttribute('position',new Float32BufferAttribute(positions,3));geo.setAttribute('uv',new Float32BufferAttribute(uv,2));geo.setIndex(indices);geo.computeVertexNormals();
  return geo;
}
