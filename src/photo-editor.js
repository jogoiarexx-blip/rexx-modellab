import { bounds, profileSize, profileGeometry, validateContour, MAX_POINTS } from './profile.js';
import {anatomy,suggestContour} from './silhouette.js';
import {pixels} from './raster.js';
import {sideDepth,suggestedDepth} from './character.js';
import {drawCharacter} from './character-preview.js';
import example from '../examples/placa.modellab.json';

const NS='http://www.w3.org/2000/svg';
const byId=id=>document.getElementById(id);
const round=n=>Math.round(n*1000)/1000;
const display=n=>Number(n.toPrecision(5)).toLocaleString('pt-BR',{maximumSignificantDigits:5});
const segmentDistance=(p,a,b)=>{
  const dx=b[0]-a[0],dy=b[1]-a[1],length=dx*dx+dy*dy;
  const t=length?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/length)):0;
  return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);
};
function svg(tag,attrs){
  const el=document.createElementNS(NS,tag);
  for(const [key,value] of Object.entries(attrs))el.setAttribute(key,value);
  return el;
}
function projectedFaces(points,size,view,color){
  const geo=profileGeometry(points,size);
  try{
    const pos=geo.attributes.position,idx=geo.index.array;
    const yaw={front:0,back:Math.PI,side:Math.PI/2,iso:.65}[view],pitch=view==='iso'?.34:0;
    const cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch);
    const vertices=Array.from({length:pos.count},(_,i)=>{
      const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i),depth=sy*x+cy*z;
      return [cy*x-sy*z,sp*depth-cp*y,cp*depth+sp*y];
    });
    const b=bounds(vertices);
    const scale=view==='iso'?Math.min(244/b.width,98/b.height):Math.min(244/Math.max(size[0],size[2]),98/size[1]);
    const xy=p=>[(p[0]-b.left-b.width/2)*scale+145,(p[1]-b.top-b.height/2)*scale+64];
    const faces=[];
    for(let k=0;k<idx.length;k+=3){
      const a=vertices[idx[k]],b=vertices[idx[k+1]],c=vertices[idx[k+2]];
      const area=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
      if(area>=-1e-15)continue;
      const nx=geo.attributes.normal.getX(idx[k]),ny=geo.attributes.normal.getY(idx[k]),nz=geo.attributes.normal.getZ(idx[k]);
      const brightness=.67+.31*Math.max(0,-.4*nx+.65*ny+.82*nz);
      const rgb=[1,3,5].map(i=>Math.round(parseInt(color.slice(i,i+2),16)*brightness));
      const fill='rgb('+rgb.join(',')+')';
      faces.push({z:(a[2]+b[2]+c[2])/3,points:[a,b,c].map(xy),fill});
    }
    return faces.sort((a,b)=>a.z-b.z);
  }finally{geo.dispose();}
}
function preview(container,points,size,view,color){
  const faces=projectedFaces(points,size,view,color);
  container.replaceChildren(...faces.map(f=>svg('polygon',{points:f.points.map(p=>p.join(',')).join(' '),fill:f.fill,stroke:f.fill,'stroke-width':.55})));
}
function exportViews(name,points,size,color,reference,back,side,detail){
  const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=320;
  const ctx=canvas.getContext('2d');
  ctx.fillStyle='#202720';ctx.fillRect(0,0,1080,320);
  ctx.fillStyle='#e0e8d8';ctx.font='600 24px sans-serif';ctx.fillText(name,22,36,1020);
  ['front','side','back'].forEach((view,i)=>{
    ctx.save();ctx.translate(18+i*353,63);ctx.fillStyle='#30392f';ctx.fillRect(0,0,338,168);
    if(reference){
      const image=document.createElement('canvas');image.width=338;image.height=168;
      drawCharacter(image,reference,points,size,view,color,back,side,detail);ctx.drawImage(image,0,0);
    }else{
    ctx.translate(7,11);ctx.scale(1.12,1.12);
    for(const f of projectedFaces(points,size,view,color)){
      ctx.fillStyle=ctx.strokeStyle=f.fill;ctx.lineWidth=.6;ctx.beginPath();
      f.points.forEach(([x,y],j)=>j?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fill();ctx.stroke();
    }
    }
    ctx.restore();ctx.fillStyle='#d3ed76';ctx.font='600 16px sans-serif';ctx.fillText(['Frente','Lado','Costas'][i],22+i*353,254);
  });
  ctx.fillStyle='#c6d0be';ctx.font='15px sans-serif';
  ctx.fillText(size.map(display).join(' × ')+' m  ·  Mesma escala nas três vistas. '+(side?'Volume ajustado pela foto de perfil.':back?'Costas fotografadas. Volume lateral estimado.':'Laterais e costas estimadas.'),22,295);
  canvas.toBlob(blob=>{
    if(!blob)return;
    const url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=(name.replace(/[^a-z0-9_-]/gi,'-').slice(0,72)||'perfil')+'-vistas.png';
    document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
  },'image/png');
}
export async function readReference(file){
  if(!file||file.size>12*1024*1024)throw Error('Escolha uma imagem de até 12 MiB.');
  const bytes=new Uint8Array(await file.slice(0,12).arrayBuffer());
  const jpeg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
  const png=bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71;
  const webp=String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP';
  if(!jpeg&&!png&&!webp)throw Error('Escolha uma foto JPEG, PNG ou WebP.');
  const url=URL.createObjectURL(file);
  try{
    const image=new Image();
    image.src=url;await image.decode();
    const factor=Math.min(1,1600/Math.max(image.naturalWidth,image.naturalHeight));
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(image.naturalWidth*factor));canvas.height=Math.max(1,Math.round(image.naturalHeight*factor));
    const ctx=canvas.getContext('2d');ctx.fillStyle='#f4f4ef';ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(image,0,0,canvas.width,canvas.height);
    return {name:(file.name.trim()||'Foto local').slice(0,120),width:canvas.width,height:canvas.height,image:canvas.toDataURL('image/jpeg',.94)};
  }finally{URL.revokeObjectURL(url);}
}
export function createPhotoEditor(apply){
  const dialog=byId('photoDialog'),surface=byId('traceSurface'),message=byId('profileMessage');
  let ref,points,calPoints,measure,active,drag,revisions,editing,version=0,color,busy=false;
  const width=byId('profileWidth'),depth=byId('profileDepth'),known=byId('knownMeters'),scaleMode=byId('scaleMode'),submit=byId('applyProfile');
  const form=byId('profileForm'),volume=byId('profileVolume'),humanPreview=byId('humanPreview');
  const facing=byId('sideFacing'), detail=byId('profileDetail');
  const sidePhoto=profile=>profile.side?{...profile.side,ref:auxiliary.side.ref}:undefined;
  const auxiliaryViews=[{key:'back',prefix:'rear',label:'das costas'},{key:'side',prefix:'side',label:'de perfil'}];
  let auxiliary={}, view='front';
  const tracedRef=()=>auxiliary[view]?.ref??ref;
  const tracedPoints=()=>auxiliary[view]?.points??points;
  const tracedHistory=()=>auxiliary[view]?.history??revisions;
  function setTracedPoints(value){if(view==='front')points=value;else auxiliary[view].points=value;}
  function showReference(key){
    if(drag)return;
    view=key;traceNote='';
    active=-1;
    byId('profileView').value=key;
    render();
  }
  let rigidDepth=.05,storedHuman=false,traceNote='';
  const isHuman=()=>form.value==='humanoid'||(form.value==='auto'&&!!anatomy(points));
  const tint=()=>isHuman()?(storedHuman?color:'#ffffff'):(storedHuman?example.materials[0].color:color);
  function suggest(){
    const found=suggestContour(pixels(tracedRef().image));
    if(found.length){
      remember();setTracedPoints(found);active=-1;
      traceNote='Contorno sugerido. Arraste os pontos para ajustar.';
    }else traceNote='Fundo ou contorno ambíguo. Clique ao redor da peça para marcar os pontos.';
  }
  byId('autoTrace').onclick=()=>{if(!busy){suggest();render();}};
  function remember(){
    const history=tracedHistory();
    const snapshot={points:structuredClone(tracedPoints()),active};
    if(view==='front')Object.assign(snapshot,{calPoints:structuredClone(calPoints),measure});
    history.push(snapshot);
    if(history.length>60)history.shift();
  }
  function draft(){
    const profile={reference:ref.id||'reference',points:structuredClone(points)};
    if(scaleMode.value==='measure'){
      if(calPoints.length!==2)throw Error('Marque os dois extremos de uma distância conhecida na imagem.');
      profile.calibration={a:[...calPoints[0]],b:[...calPoints[1]],meters:known.valueAsNumber};
    }
    const human=isHuman();
    const size=profileSize(profile,ref,width.valueAsNumber,human?1:depth.valueAsNumber);
    if(human){
      profile.form='humanoid';profile.volume=Number(volume.value);profile.detail=detail.valueAsNumber;
      for(const {key,label} of auxiliaryViews){
        const item=auxiliary[key];
        if(!item)continue;
        try{validateContour(item.points,item.ref);}catch(e){throw Error('Contorno '+label+'. '+e.message);}
        profile[key]={reference:item.ref.id||key,points:structuredClone(item.points)};
      }
      if(profile.side)profile.side.facing=facing.value;
      size[2]=profile.side?sideDepth(profile.side.points,size[1],profile.volume):suggestedDepth(points,size[0],profile.volume);
      if(size[2]<.00001||size[2]>10000)throw Error('A profundidade calculada está fora da escala permitida.');
    }else if(form.value==='rigid')profile.form='rigid';
    const name=byId('profileName').value.trim();
    if(!name)throw Error('Dê um nome à peça.');
    return {name,profile,size};
  }
  function render(){
    const human=isHuman();
    if(!human&&view!=='front'&&!drag){view='front';traceNote='';active=-1;}
    const visible=tracedRef(), outline=tracedPoints();
    byId('rearControls').hidden=!human;
    byId('photoBrowse').textContent=human?'Carregar foto da frente':'Carregar imagem';
    byId('frontTrace').disabled=busy;
    byId('frontTrace').setAttribute('aria-pressed',view==='front');
    byId('sideSettings').hidden=!human||view!=='side';
    for(const {key,prefix,label} of auxiliaryViews){
      const present=!!auxiliary[key],tab=byId(prefix+'Trace'),browse=byId(prefix+'Browse'),remove=byId(prefix+'Remove');
      tab.disabled=busy||!present;
      tab.setAttribute('aria-pressed',view===key);
      browse.disabled=busy;
      browse.textContent=(present?'Trocar foto ':'Adicionar foto ')+label;
      remove.disabled=busy;
      remove.hidden=!present;
    }
    surface.setAttribute('viewBox','0 0 '+visible.width+' '+visible.height);
    const img=byId('traceImage');
    img.setAttribute('width',visible.width);img.setAttribute('height',visible.height);
    if(img.getAttribute('href')!==visible.image)img.setAttribute('href',visible.image);
    const markers=[],radius=Math.max(visible.width,visible.height)*.007;
    if(outline.length)markers.push(svg(outline.length>=3?'polygon':'polyline',{points:outline.map(p=>p.join(',')).join(' '),fill:outline.length>=3?'#d3ed7620':'none',stroke:'#d3ed76','stroke-width':2,'vector-effect':'non-scaling-stroke'}));
    outline.forEach(([cx,cy],i)=>markers.push(svg('circle',{cx,cy,r:radius*(i===active?1.2:1),fill:i===active?'#eaffb7':'#283121',stroke:'#d3ed76','stroke-width':1.5})));
    if(view==='front'&&scaleMode.value==='measure'&&calPoints.length){
      if(calPoints.length===2)markers.push(svg('line',{x1:calPoints[0][0],y1:calPoints[0][1],x2:calPoints[1][0],y2:calPoints[1][1],stroke:'#92ddff','stroke-width':2,'stroke-dasharray':'5 3','vector-effect':'non-scaling-stroke'}));
      calPoints.forEach(([cx,cy])=>markers.push(svg('circle',{cx,cy,r:radius,stroke:'#92ddff',fill:'#203b43','stroke-width':2})));
    }
    byId('traceLines').replaceChildren(...markers);
    byId('pointCount').textContent=outline.length+' pontos';
    byId('pointUndo').disabled=!tracedHistory().length;byId('pointDelete').disabled=active<0;byId('pointClear').disabled=!outline.length;
    byId('volumeRow').hidden=!human;
    byId('detailRow').hidden=!human;
    byId('detailValue').value=Math.round(detail.valueAsNumber*100)+'%';
    volume.querySelector('option[value="1"]').textContent=auxiliary.side?'Proporcional ao perfil':'Proporcional ao tronco';
    if(human&&!depth.disabled)rigidDepth=depth.value;
    if(!human&&depth.disabled)depth.value=rigidDepth;
    depth.disabled=human;
    humanPreview.hidden=!human;byId('profilePreview').style.display=human?'none':'';
    byId('formHint').textContent=form.value==='auto'?(human?'Pose de T detectada. Volume calculado pelo tronco.':points.length>=3?'Contorno de objeto. Espessura uniforme.':'Marque ou sugira o contorno para detectar a forma.'):(human?'Foto na frente. Volume estimado por região do corpo.':'A profundidade é igual em toda a peça.');
    width.disabled=scaleMode.value==='measure';byId('calibrationRow').hidden=!width.disabled;
    byId('traceHint').textContent=measure&&view==='front'?'Clique nos dois extremos da medida conhecida.':(traceNote?traceNote+' ':'')+'Clique no contorno em sequência. Arraste um ponto para ajustar. Shift + clique insere um ponto na borda mais próxima.';
    byId('photoSource').textContent=visible.name+' · '+visible.width+' × '+visible.height+' px';
    try{
      const {size,profile}=draft();if(width.disabled)width.value=Number(size[0].toPrecision(9));
      if(human){depth.value=Number(size[2].toPrecision(5));if(!drag)drawCharacter(humanPreview,ref,points,size,byId('profileView').value,tint(),auxiliary.back,sidePhoto(profile),profile.detail);}
      else if(!drag)preview(byId('profilePreview'),points,size,byId('profileView').value,tint());
      byId('profileDims').textContent=size.map(display).join(' × ')+' m';
      message.textContent=human?(profile.side?'O perfil ajusta a profundidade e colore o lado fotografado.':auxiliary.back?'Frente e costas usam as fotos. A profundidade é estimada.':'A frente usa a foto. O volume lateral e as cores das costas são estimados.'):'Laterais e costas são estimadas pela profundidade. A cor vem do material.';message.classList.remove('invalid');submit.disabled=busy;byId('profileSheet').disabled=busy;
    }catch(e){
      humanPreview.hidden=true;byId('profilePreview').replaceChildren();byId('profileDims').textContent='—';message.textContent=e.message||'Revise as dimensões.';message.classList.add('invalid');submit.disabled=true;byId('profileSheet').disabled=true;
    }
  }
  function coords(e){
    const ref=tracedRef();
    const r=surface.getBoundingClientRect(),s=Math.min(r.width/ref.width,r.height/ref.height);
    if(!s)return null;
    const x=(e.clientX-r.left-(r.width-ref.width*s)/2)/s,y=(e.clientY-r.top-(r.height-ref.height*s)/2)/s;
    return {p:[round(Math.max(0,Math.min(ref.width,x))),round(Math.max(0,Math.min(ref.height,y)))],inside:x>=0&&y>=0&&x<=ref.width&&y<=ref.height,tolerance:10/s};
  }
  surface.addEventListener('pointerdown',e=>{
    if(e.button!==0||drag||busy)return;
    const loc=coords(e);if(!loc?.inside)return;
    e.preventDefault();
    const points=tracedPoints();
    if(measure&&view==='front'){remember();calPoints.push(loc.p);if(calPoints.length===2)measure=false;render();return;}
    let best=-1,nearest=loc.tolerance;
    points.forEach((p,i)=>{const d=Math.hypot(p[0]-loc.p[0],p[1]-loc.p[1]);if(d<nearest){nearest=d;best=i;}});
    if(best===-1){
      if(points.length>=MAX_POINTS){message.textContent='Limite de '+MAX_POINTS+' pontos atingido.';return;}
      remember();
      let at=points.length;
      if(e.shiftKey&&points.length>1){let min=Infinity;points.forEach((p,i)=>{const d=segmentDistance(loc.p,p,points[(i+1)%points.length]);if(d<min){min=d;at=i+1;}});}
      points.splice(at,0,loc.p);active=at;drag={id:e.pointerId,snapshot:true};
    }else{active=best;drag={id:e.pointerId,snapshot:false};}
    surface.setPointerCapture?.(e.pointerId);render();
  });
  surface.addEventListener('pointermove',e=>{
    if(!drag||drag.id!==e.pointerId)return;
    const loc=coords(e);if(!loc)return;
    const points=tracedPoints();
    if(!drag.snapshot){if(Math.hypot(points[active][0]-loc.p[0],points[active][1]-loc.p[1])<.05)return;remember();drag.snapshot=true;}
    points[active]=loc.p;render();
  });
  for(const event of ['pointerup','pointercancel','lostpointercapture'])surface.addEventListener(event,e=>{if(drag?.id===e.pointerId){drag=null;render();}});
  byId('pointUndo').onclick=()=>{const prev=tracedHistory().pop();
    if(!prev)return;
    setTracedPoints(prev.points);active=prev.active;
    if(view==='front'){calPoints=prev.calPoints;measure=scaleMode.value==='measure'&&prev.measure;}
    render();};
  byId('pointDelete').onclick=()=>{if(active>=0){remember();tracedPoints().splice(active,1);active=-1;render();}};
  byId('pointClear').onclick=()=>{remember();setTracedPoints([]);active=-1;render();};
  byId('calibrate').onclick=()=>{if(view!=='front')showReference('front');remember();calPoints=[];measure=true;render();};
  scaleMode.onchange=()=>{measure=scaleMode.value==='measure'&&calPoints.length!==2;render();};
  form.onchange=render;volume.onchange=render;facing.onchange=render;
  for(const id of ['profileDetail','knownMeters','profileName','profileWidth','profileDepth','profileView'])byId(id).addEventListener('input',render);
  byId('frontTrace').onclick=()=>showReference('front');
  for(const {key,prefix,label} of auxiliaryViews){
    const input=byId(prefix+'File');
    byId(prefix+'Trace').onclick=()=>showReference(key);
    byId(prefix+'Browse').onclick=()=>{input.value='';input.click();};
    byId(prefix+'Remove').onclick=()=>{
      if(drag)return;
      delete auxiliary[key];
      if(view===key)showReference('front');else render();
    };
    input.onchange=async()=>{
      const file=input.files[0];if(!file||!isHuman())return;
      const stamp=++version;
      busy=true;render();message.textContent='Preparando foto '+label+'…';
      try{
        const next=await readReference(file);
        if(stamp!==version)return;
        const contour=suggestContour(pixels(next.image));
        auxiliary[key]={ref:next,points:contour,history:contour.length?[{points:[],active:-1}]:[]};
        busy=false;drag=null;view=key;active=-1;
        byId('profileView').value=key;
        traceNote=contour.length?'Revise o contorno sugerido.':'Marque o contorno '+label+' para alinhar a referência.';
        render();
      }catch(e){
        if(stamp===version){busy=false;render();message.textContent=e.message;message.classList.add('invalid');}
      }
    };
  }
  byId('photoBrowse').onclick=()=>{byId('photoFile').value='';byId('photoFile').click();};
  byId('photoFile').onchange=async e=>{
    const file=e.target.files[0];if(!file)return;const stamp=++version;
    busy=true;submit.disabled=true;byId('profileSheet').disabled=true;message.textContent='Preparando imagem…';
    try{
      const next=await readReference(file);if(stamp!==version)return;
      auxiliary={};view='front';facing.value='right';
      ref=next;points=[];calPoints=[];active=-1;measure=false;drag=null;revisions=[];
      byId('profileName').value=(file.name.replace(/\.[^.]+$/,'').trim()||'Perfil de foto').slice(0,120);
      scaleMode.value='width';width.value=.5;depth.disabled=false;depth.value=.05;
      form.value='auto';volume.value='1';detail.value='.45';traceNote='';suggest();busy=false;render();
    }catch(e){if(stamp===version){busy=false;render();message.textContent=e.message||'Não foi possível abrir a imagem.';message.classList.add('invalid');}}
  };
  byId('profileSheet').onclick=()=>{const spec=draft();exportViews(spec.name,points,spec.size,tint(),isHuman()?ref:null,spec.profile.back?auxiliary.back:undefined,sidePhoto(spec.profile),spec.profile.detail);};
  byId('photoClose').onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>{version++;drag=null;busy=false;});
  submit.onclick=()=>{
    try{
      const spec=draft();
      apply({...spec,reference:ref,auxiliary,editing,target:byId('profileTarget').value},()=>dialog.close());
    }catch(e){message.textContent=e.message;message.classList.add('invalid');}
  };
  return function open(state={}){
    version++;busy=false;editing=state.part?.id||null;
    const source=state.part||example.parts[0];
    ref=state.reference||example.references[0];color=state.color||example.materials[0].color;
    auxiliary={};view='front';facing.value=source.profile.side?.facing??'right';
    for(const {key} of auxiliaryViews){
      const ref=state.auxiliary?.[key];
      if(ref)auxiliary[key]={ref,points:structuredClone(source.profile[key].points),history:[]};
    }
    detail.value=source.profile.detail??.45;
    points=structuredClone(source.profile.points);
    storedHuman=source.profile.form==='humanoid';form.value=source.profile.form||'auto';const factor=source.profile.volume??1;
    volume.querySelector('option[data-custom]')?.remove();
    const option=Array.from(volume.options).find(o=>Number(o.value)===factor);
    if(option)volume.value=option.value;else{
      const custom=document.createElement('option');custom.value=String(factor);custom.textContent=display(factor*100)+'%';custom.dataset.custom='1';volume.append(custom);volume.value=custom.value;
    }
    traceNote='';depth.disabled=false;
    const calibration=source.profile.calibration;
    calPoints=calibration?[calibration.a.slice(),calibration.b.slice()]:[];
    width.value=source.size[0];depth.value=source.size[2];known.value=calibration?.meters??.1;scaleMode.value=calibration?'measure':'width';
    active=-1;drag=null;revisions=[];measure=false;
    byId('profileView').value='iso';byId('profileName').value=source.name;byId('targetLabel').hidden=!!editing;byId('profileTarget').value=state.dirty?'add':'new';
    submit.textContent=editing?'Aplicar alterações':'Criar peça 3D';render();dialog.showModal();
  };
}
