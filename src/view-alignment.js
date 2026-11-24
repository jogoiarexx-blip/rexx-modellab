// REXX-TRAIN-08B — vertical registration of orthographic reference views.
export function validateAlignment(anchors){
 if(anchors===undefined)return;
 if(!Array.isArray(anchors)||anchors.length>12||anchors.some(a=>!Array.isArray(a)||a.length!==2||!a.every(v=>Number.isFinite(v)&&v>0&&v<1)))throw Error('Alinhamento: use até 12 pares internos [frente, vista], entre 0 e 1.');
 const all=[[0,0],...anchors,[1,1]];
 for(let i=1;i<all.length;i++){
  const dx=all[i][0]-all[i-1][0],dy=all[i][1]-all[i-1][1];
  if(dx<.005||dy<.005||dy/dx<.25||dy/dx>4)throw Error('Alinhamento precisa ser crescente, sem compressão excessiva.');
 }
}
export function viewMapper(anchors){
 validateAlignment(anchors);
 if(!anchors?.length)return v=>Math.max(0,Math.min(1,v));
 const all=[[0,0],...anchors,[1,1]];
 return v=>{
  v=Math.max(0,Math.min(1,v));
  for(let i=1;i<all.length;i++)if(v<=all[i][0]){
   const [a,b]=all[i-1],[c,d]=all[i];return b+(d-b)*(v-a)/(c-a);
  }
  return 1;
 };
}
