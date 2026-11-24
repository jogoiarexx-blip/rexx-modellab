// REXX-TRAIN-03: depth envelopes measured from four local-space GLB references.
// Samples are 5th–95th percentile of unique position Z / height, +/- .04 of row.
export const DEPTH_ROWS=Object.freeze([.09,.18,.28,.40,.51,.65,.78,.91]);
export const DEPTH_REFERENCES=Object.freeze({
 corsair:Object.freeze([.137,.130,.203,.122,.111,.105,.084,.065]),
 denim:Object.freeze([.139,.198,.197,.205,.214,.203,.225,.201]),
 harbinger:Object.freeze([.322,.437,.462,.436,.220,.353,.415,.310]),
 rustbound:Object.freeze([null,null,null,null,.100,null,.018,null])
});
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
const bell=(v,c,w)=>Math.exp(-(((v-c)/w)**2));
export const ANATOMY_STYLES=Object.freeze({
 neutral:Object.freeze({chest:.10,waist:.03,hip:.06,limb:.08,face:.05}),
 athletic:Object.freeze({chest:.21,waist:.12,hip:.05,limb:.17,face:.06}),
 soft:Object.freeze({chest:.11,waist:-.04,hip:.17,limb:.05,face:.04})
});
export function validateAnatomyOptions(style,strength){
 if(style!==undefined&&!Object.hasOwn(ANATOMY_STYLES,style))throw Error('Estilo anatômico inválido: '+style);
 if(!Number.isFinite(strength)||strength<0||strength>1)throw Error('Força anatômica deve estar entre 0 e 1.');
}
function sample(values,row){
 if(row<=DEPTH_ROWS[0])return values[0];
 for(let i=1;i<DEPTH_ROWS.length;i++)if(row<=DEPTH_ROWS[i])return lerp(values[i-1],values[i],smooth((row-DEPTH_ROWS[i-1])/(DEPTH_ROWS[i]-DEPTH_ROWS[i-1])));
 return values.at(-1);
}
// A robust sample of the current thickness prevents a fitted envelope from amplifying near-zero seams.
export function currentDepthEnvelope(positions,height,width,center=0){
 const n=positions.count/2,values=DEPTH_ROWS.map(row=>{
  const sample=[];
  for(let i=0;i<n;i++){
   const y=.5-positions.getY(i)/height,x=positions.getX(i)-center;
   if(Math.abs(y-row)>.04||(row<.55&&Math.abs(x)>.16*height))continue;
   const d=Math.abs(positions.getZ(i)-positions.getZ(i+n))/height;
   if(Number.isFinite(d)&&d>1e-6)sample.push(d);
  }
  sample.sort((a,b)=>a-b);
  return sample.length>=8?sample[Math.floor((sample.length-1)*.85)]:null;
 });
 return row=>{
  const valid=values.map((v,i)=>v===null?null:{row:DEPTH_ROWS[i],v}).filter(Boolean);
  if(!valid.length)return null;
  if(row<=valid[0].row)return valid[0].v;
  for(let i=1;i<valid.length;i++)if(row<=valid[i].row)return lerp(valid[i-1].v,valid[i].v,smooth((row-valid[i-1].row)/(valid[i].row-valid[i-1].row)));
  return valid.at(-1).v;
 };
}
// x is relative to torso center in half-chest units. Arm mask is derived from the silhouette.
export function anatomicalDepth({row,x,arms=0,front,style='neutral',strength=.6,currentDepth,sideCalibrated=false}){
 validateAnatomyOptions(style,strength);
 const p=ANATOMY_STYLES[style],ax=Math.abs(x);
 // The corsair reference is a useful depth prior, not a universal body template.
 // Side photography takes precedence over a statistical prior.
 const target=sample(DEPTH_REFERENCES.corsair,row);
 const current=typeof currentDepth==='function'?currentDepth(row):null;
 const envelope=sideCalibrated||!current?1:lerp(1,clamp(target/current,.78,1.22),.35);
 const torso=1-smooth((ax-.85)/.55);
 const pec=bell(row,.28,.067)*bell(ax,.48,.29)*p.chest;
 const waist=bell(row,.41,.068)*p.waist;
 const hip=bell(row,.52,.074)*bell(ax,.58,.38)*p.hip;
 const face=bell(row,.105,.045)*(bell(ax,.09,.17)*.7+bell(ax,.31,.18)*.3)*p.face;
 const thigh=bell(row,.64,.10)*p.limb*.65;
 const calf=bell(row,.82,.075)*p.limb*.5;
 const armShape=bell(ax,1.65,.42)*p.limb;
 const frontDetail=front?pec-waist+hip*.30+face:pec*.30-waist*.5+hip+face*.05;
 const shape=torso*frontDetail+(1-torso)*.3*frontDetail+thigh+calf;
 const regional=lerp(shape,armShape,arms);
 // Keep the photo silhouette, and do not aggressively distort a measured side view.
 return 1+strength*clamp((envelope-1)+regional,-.25,.35)*(sideCalibrated?.40:1);
}
