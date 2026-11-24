const $=id=>document.getElementById(id);
const clips=[['idle','Parado'],['walk','Andar'],['run','Correr'],['jump','Pular'],['attack','Atacar'],['hit','Dano'],['death','Morte'],['crouch','Agachar'],['aim','Mirar']];
for(const [value,label] of clips){const l=document.createElement('label');l.className='check';const i=document.createElement('input');i.type='checkbox';i.name='animation';i.value=value;i.checked=!['crouch','aim'].includes(value);l.append(i,label);$('animations').append(l);}
let source=null,worker=null,busy=false,ready=false,urls=[];
const photoIds=['frontPhoto','backPhoto','sidePhoto','sideFacing','photoHeight','contourPoints'];
const status=s=>$('status').textContent=s;
const clearDownloads=()=>{for(const u of urls)URL.revokeObjectURL(u);urls=[];$('downloads').replaceChildren();};
function controls(){
 for(const id of ['mode','file','draft',...photoIds,'anatomy','face','clothing','hands','handMesh','alignment','species','height','quality','view','time'])$(id).disabled=busy;
 for(const i of document.querySelectorAll('input[name=animation],input[name=lod]'))i.disabled=busy;
 $('handMesh').disabled=busy||$('hands').value==='basic';
 $('prepare').disabled=busy||($('mode').value==='human'&&!source&&!$('frontPhoto').files.length);
 $('cancel').hidden=!busy;$('refresh').disabled=busy||!ready;$('export').disabled=busy||!ready;$('pose').disabled=busy||!ready;
}
function invalidate(){ready=false;clearDownloads();controls();status('Gere uma nova prévia para aplicar as configurações.');}
function load(p){
 if(!p||p.schemaVersion!=='1.0'||!Array.isArray(p.parts))throw Error('Projeto ModelLab inválido.');
 const parts=p.parts.filter(x=>x.shape!=='group');
 if(parts.length!==1||parts[0].shape!=='profile'||parts[0].profile?.form!=='humanoid')throw Error('Use um projeto com um único perfil humanoide em pose T.');
 source=p;for(const id of ['frontPhoto','backPhoto','sidePhoto'])$(id).value='';$('source').textContent=p.name+' · '+parts[0].id;invalidate();status('Projeto carregado.');
}
$('file').onchange=async()=>{try{const f=$('file').files[0];if(!f)return;if(f.size>24*1024*1024)throw Error('Arquivo acima de 24 MiB.');load(JSON.parse(await f.text()));}catch(e){source=null;invalidate();status(e.message);}};
$('draft').onclick=()=>{try{const raw=localStorage.getItem('rexx-modellab.draft.1');if(!raw)throw Error('Nenhum rascunho disponível. Salve o JSON no editor e carregue-o aqui.');load(JSON.parse(raw));}catch(e){status(e.message);}};
async function localJPEG(file){
 if(!file||file.size>20*1024*1024)throw Error('Selecione uma imagem de até 20 MiB.');
 const bitmap=await createImageBitmap(file);
 try{
  const scale=Math.min(1,1400/Math.max(bitmap.width,bitmap.height));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
  const ctx=canvas.getContext('2d');ctx.fillStyle='#eee';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
  return {image:canvas.toDataURL('image/jpeg',.93),width:canvas.width,height:canvas.height};
 }finally{bitmap.close();}
}
for(const id of photoIds)$(id).addEventListener('change',()=>{if(id==='frontPhoto'&&$('frontPhoto').files.length){source=null;$('file').value='';$('source').textContent='Fotografia frontal selecionada.';}invalidate();});
$('mode').onchange=()=>{const human=$('mode').value==='human';$('human').hidden=!human;$('creature').hidden=human;invalidate();};
$('face').oninput=()=>$('faceValue').value=Math.round(Number($('face').value)*100)+'%';
for(const id of ['anatomy','face','clothing','hands','handMesh','alignment','species','height','quality'])$(id).addEventListener('change',invalidate);
$('animations').addEventListener('change',invalidate);
function spawn(){
 worker=new Worker(new URL('./studio-worker.js',import.meta.url),{type:'module'});
 worker.onerror=e=>{worker.terminate();worker=null;ready=false;busy=false;status('Falha no motor do navegador: '+(e.message||'verifique suporte a módulos e Web Workers.'));controls();};
 worker.onmessage=({data:m})=>{
  if(m.type==='progress'){status(m.message);return;}
  if(m.type==='source'){source=m.source;$('source').textContent=source.name+' · perfil reconstruído';return;}
  busy=false;
  if(m.type==='error'){status(m.message);controls();return;}
  if(m.type==='preview'){
   const image=m.image,ctx=$('canvas').getContext('2d');
   ctx.putImageData(new ImageData(new Uint8ClampedArray(image.data),image.width,image.height),0,0);
   if(m.report){
    $('report').textContent=JSON.stringify(m.report,null,2);$('summary').textContent=m.bones?m.bones+' ossos · '+m.clips.length+' animações':'Criatura paramétrica estática';
    $('pose').replaceChildren(new Option('Repouso','rest'));
    if(m.bones===66)$('pose').append(new Option('Preensão','grip'));
    for(const c of m.clips)$('pose').append(new Option(clips.find(x=>x[0]===c)?.[1]??c,c));
   }
   ready=true;status('Prévia concluída. Inspecione o resultado.');
  }else if(m.type==='export'){
   clearDownloads();
   const summary=document.createElement('p');summary.textContent=m.manifest.levels.map(l=>l.file+': '+(l.bytes/1048576).toFixed(2)+' MiB, '+l.triangles+' triângulos'+(l.budgetMet?'':' (meta não atingida)')).join(' · ');$('downloads').append(summary);
   for(const entry of m.entries){const a=document.createElement('a');a.className='download';const u=URL.createObjectURL(new Blob([entry.data],{type:entry.file.endsWith('.glb')?'model/gltf-binary':'application/json'}));urls.push(u);a.href=u;a.download=entry.file;a.textContent=entry.file;$('downloads').append(a);}
   status('Exportação concluída. Baixe os arquivos individualmente.');
  }
  controls();
 };
}
function send(m,message){if(busy)return;try{if(!worker)spawn();busy=true;controls();status(message);worker.postMessage(m);}catch(e){busy=false;controls();status(e.message);}}
$('prepare').onclick=async()=>{
 try{
  ready=false;clearDownloads();
  if($('mode').value==='creature'){
   const options={species:$('species').value,quality:$('quality').value};if($('height').value)options.height=Number($('height').value);
   send({action:'creature',options,view:$('view').value},'Gerando criatura…');return;
  }
  if($('frontPhoto').files.length){
   busy=true;controls();status('Preparando fotografias locais…');
   const front=await localJPEG($('frontPhoto').files[0]),back=$('backPhoto').files[0]?await localJPEG($('backPhoto').files[0]):undefined,side=$('sidePhoto').files[0]?await localJPEG($('sidePhoto').files[0]):undefined;
   const height=Number($('photoHeight').value),raw=$('contourPoints').value.trim(),points=raw?JSON.parse(raw):undefined;
   const hands=$('hands').value,options={id:'character',refine:{anatomyStyle:$('anatomy').value,face:{strength:Number($('face').value)},reproject:true},clothing:$('clothing').value?{style:$('clothing').value}:null,hands,handMesh:hands==='detailed'&&$('handMesh').checked?{}:false,animations:[...document.querySelectorAll('input[name=animation]:checked')].map(x=>x.value)};
   const photo={image:front.image,points,name:'Personagem da foto',height,detail:.35,back:back?{image:back.image}:undefined,side:side?{image:side.image,facing:$('sideFacing').value}:undefined};
   busy=false;send({action:'photo',photo,options,view:$('view').value},'Reconstruindo corpo, rosto e mãos…');return;
  }
  if(!source)throw Error('Carregue uma fotografia ou projeto primeiro.');
  const p=structuredClone(source),part=p.parts.find(x=>x.shape==='profile'),text=$('alignment').value.trim();
  if(text){const a=JSON.parse(text);if(!a||typeof a!=='object'||Array.isArray(a)||Object.keys(a).some(k=>!['side','back'].includes(k)))throw Error('Alinhamento inválido.');for(const k of Object.keys(a)){if(!part.profile[k])throw Error('Vista ausente: '+k);part.profile[k].alignment=a[k];}}
  const hands=$('hands').value,options={id:part.id,refine:{anatomyStyle:$('anatomy').value,face:{strength:Number($('face').value)},reproject:true},clothing:$('clothing').value?{style:$('clothing').value}:null,hands,handMesh:hands==='detailed'&&$('handMesh').checked?{}:false,animations:[...document.querySelectorAll('input[name=animation]:checked')].map(x=>x.value)};
  send({action:'prepare',source:p,options,view:$('view').value},'Reconstruindo e refinando…');
 }catch(e){busy=false;controls();status(e.message);}
};
$('refresh').onclick=()=>send({action:'pose',clip:$('pose').value,time:Number($('time').value),view:$('view').value},'Renderizando pose…');
$('export').onclick=()=>{const levels=[...document.querySelectorAll('input[name=lod]:checked')].map(x=>x.value);if(!levels.length){status('Selecione pelo menos um LOD.');return;}send({action:'export',levels},'Preparando exportação…');};
$('cancel').onclick=()=>{worker?.terminate();worker=null;busy=false;invalidate();status('Processamento cancelado. Gere a prévia novamente.');};
window.addEventListener('pagehide',()=>{worker?.terminate();clearDownloads();});
controls();
