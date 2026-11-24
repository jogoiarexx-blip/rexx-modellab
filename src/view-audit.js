import {validate} from './model.js';
import {bounds} from './profile.js';
import {spans,anatomy} from './silhouette.js';
import {viewMapper} from './view-alignment.js';
const round=n=>+n.toFixed(4);
function widths(points,row){
 const b=bounds(points),s=spans(points,b.top+row*b.height);
 return {count:s.length,width:s.reduce((v,[a,c])=>v+c-a,0)/b.height};
}
export function auditViews(project,id='character'){
 validate(project,{empty:false});
 const p=project.parts.find(p=>p.id===id);
 if(p?.shape!=='profile'||p.profile.form!=='humanoid')throw Error('Selecione um perfil humanoide antes de refinar.');
 const f=p.profile,warnings=[],views={},front=bounds(f.points),human=anatomy(f.points);
 if(!human)warnings.push('Silhueta frontal não reconhecida como pose T; revise manualmente.');
 for(const key of ['back','side']){
  const v=f[key];if(!v){warnings.push('Vista '+key+' ausente: superfície estimada.');continue;}
  const map=viewMapper(v.alignment),b=bounds(v.points);
  const comparison=[.09,.18,.28,.40,.51,.65,.78,.91].map(row=>{
   const a=widths(f.points,row),otherRow=map(row),c=widths(v.points,otherRow);
   return {row,viewRow:round(otherRow),frontWidth:round(a.width),viewWidth:round(c.width),frontIntervals:a.count,viewIntervals:c.count,...(key==='back'?{relativeWidthDifference:round(Math.abs(a.width-c.width)/Math.max(.001,a.width))}:{})};
  });
  if(key==='back'&&comparison.some(x=>x.relativeWidthDifference>.30||x.frontIntervals!==x.viewIntervals))warnings.push('Costas: diferenças de largura ou separação de membros; confira pose e alinhamento.');
  if(key==='side'&&b.width/b.height>.65)warnings.push('Perfil muito largo: braços, acessórios ou perspectiva podem inflar a profundidade.');
  views[key]={anchors:v.alignment?.length??0,aspect:round(b.width/b.height),comparison};
 }
 return {id,front:{aspect:round(front.width/front.height),humanoidRecognized:!!human},views,warnings,limitations:['Comparação de silhuetas, não mede identidade ou precisão 3D.','Correspondências fornecidas manualmente.']};
}
