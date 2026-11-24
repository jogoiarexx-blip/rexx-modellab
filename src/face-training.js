// REXX-TRAIN-04: optional procedural facial relief, not landmark detection.
import {bounds} from './profile.js';
import {anatomy,spans} from './silhouette.js';
// Measured 5–95 percentile extents XYZ / height of the upper central region.
// Hair, masks and accessories may be included; these are NOT facial landmarks.
export const UPPER_REGION_REFERENCES=Object.freeze({
 corsair:Object.freeze({samples:880,extent:[.097,.120,.135]}),
 denim:Object.freeze({samples:26484,extent:[.136,.133,.142]}),
 harbinger:Object.freeze({samples:422,extent:[.211,.129,.325]}),
 rustbound:Object.freeze({samples:11,extent:null})
});
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
const g=(x,y,cx,cy,sx,sy)=>Math.exp(-(((x-cx)/sx)**2+((y-cy)/sy)**2));
export const FACE_FEATURES=Object.freeze({forehead:1,brow:1,eyes:1,nose:1,cheeks:1,lips:1,chin:1});
export const FACE_ROWS=Object.freeze({forehead:.22,brow:.37,eyes:.45,nose:.59,cheeks:.58,lips:.76,chin:.88});
export function faceOptions(input,outline){
 if(input===undefined||input===null)return null;
 if(typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['strength','box','features','rows'].includes(k)))throw Error('Opções faciais inválidas.');
 const strength=input.strength??.65;
 if(!Number.isFinite(strength)||strength<0||strength>1)throw Error('Força facial deve estar entre 0 e 1.');
 const features={...FACE_FEATURES,...input.features},rows={...FACE_ROWS,...input.rows};
 for(const [k,v] of Object.entries(features))if(!Object.hasOwn(FACE_FEATURES,k)||!Number.isFinite(v)||v<0||v>1.5)throw Error('Fator facial inválido: '+k);
 for(const [k,v] of Object.entries(rows))if(!Object.hasOwn(FACE_ROWS,k)||!Number.isFinite(v)||v<.08||v>.94)throw Error('Posição facial inválida: '+k);
 if(!(rows.forehead<rows.brow&&rows.brow<rows.eyes&&rows.eyes<rows.nose&&rows.nose<rows.lips&&rows.lips<rows.chin))throw Error('Ordem vertical facial inválida.');
 const b=bounds(outline),info=anatomy(outline),bottom=clamp((info?.armTop??.19)-.018,.12,.23);
 let box=input.box;
 if(box===undefined){
  const intervals=spans(outline,b.top+b.height*bottom*.46);
  const center=info?.center??b.left+b.width*.5;
  const nearest=intervals.find(([a,z])=>a<=center&&center<=z)??intervals.reduce((best,s)=>!best||s[1]-s[0]>best[1]-best[0]?s:best,null);
  if(!nearest)throw Error('Não foi possível estimar a cabeça; informe face.box.');
  box=[(nearest[0]-b.left)/b.width,.012,(nearest[1]-b.left)/b.width,bottom];
 }
 if(!Array.isArray(box)||box.length!==4||!box.every(Number.isFinite)||box[0]<0||box[1]<0||box[2]>1||box[3]>.35||box[2]-box[0]<.025||box[3]-box[1]<.045)throw Error('Caixa facial inválida: use [x0,y0,x1,y1] normalizados no corpo.');
 return {strength,features,rows,box:[...box]};
}
// x and y are normalized body coordinates; front/back gap bounds deformation.
export function facialOffset(x,y,gap,height,opts,sideCalibrated=false){
 if(!opts||opts.strength===0||gap<=1e-7)return 0;
 const [x0,y0,x1,y1]=opts.box,u=(x-x0)/(x1-x0),v=(y-y0)/(y1-y0);
 if(u<=0||u>=1||v<=0||v>=1)return 0;
 const a=Math.abs(u-.5),f=opts.features,r=opts.rows;
 const forehead=.16*f.forehead*g(a,v,0,r.forehead,.38,.18);
 const brows=.16*f.brow*g(a,v,.23,r.brow,.17,.065);
 const sockets=-.24*f.eyes*g(a,v,.23,r.eyes,.125,.065);
 const lids=.10*f.eyes*g(a,v,.23,r.eyes+.065,.14,.032);
 const bridge=.16*f.nose*g(a,v,0,(r.eyes+r.nose)/2,.085,.15);
 const nose=.48*f.nose*g(a,v,0,r.nose,.095,.075)+.12*f.nose*g(a,v,.085,r.nose+.028,.055,.047);
 const cheeks=.18*f.cheeks*g(a,v,.29,r.cheeks,.16,.12);
 const lips=.15*f.lips*g(a,v,0,r.lips,.19,.035)-.055*f.lips*g(a,v,0,r.lips+.025,.19,.015);
 const chin=.17*f.chin*g(a,v,0,r.chin,.22,.075);
 const edge=smooth(Math.min(u,1-u,v,1-v)/.12);
 const signal=clamp(forehead+brows+sockets+lids+bridge+nose+cheeks+lips+chin,-.25,.65);
 // Human-like references had upper-region depth near .14 height; never use monster depth as a face prior.
 const limit=Math.min(height*.026,gap*.48);
 return signal*limit*edge*opts.strength*(sideCalibrated?.35:1);
}
