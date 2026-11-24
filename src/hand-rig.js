// REXX-TRAIN-02: five independent chains per hand, informed by the 66-joint Mixamo reference.
// This is a procedural approximation for a T-pose with palm down, not a recovered skeleton.
export const FINGERS=Object.freeze(['Thumb','Index','Middle','Ring','Pinky']);
const proportions=Object.freeze({
 Thumb:[.20,.57,.34,.22],Index:[.44,1,.22,.17],Middle:[.43,1.07,0,0],
 Ring:[.45,.98,-.20,-.15],Pinky:[.49,.83,-.38,-.29]
});
const mix=(a,b,t)=>a+(b-a)*t;
export function addFingerBones(bones){
 const out=bones.map(b=>({...b,position:[...b.position]}));
 for(const side of ['left','right']){
  const hand=out.find(b=>b.name===side+'Hand'),end=out.find(b=>b.name===side+'HandEnd');
  if(!hand||!end)throw Error('Mão ausente: '+side);
  if(out.some(b=>b.name.startsWith(side+'HandIndex')))throw Error('Dedos já existentes.');
  const a=hand.position,b=end.position,L=Math.hypot(...a.map((v,i)=>b[i]-v));
  if(!Number.isFinite(L)||L<.001)throw Error('Comprimento da mão inválido.');
  for(const finger of FINGERS){
   const [start,finish,z0,z1]=proportions[finger];
   for(let k=1;k<=4;k++){
    const t=(k-1)/3,u=mix(start,finish,t);
    const position=a.map((v,i)=>mix(v,b[i],u));
    position[2]+=L*mix(z0,z1,t);
    const prefix=side+'Hand'+finger;
    out.push({name:prefix+k,parent:k===1?hand.name:prefix+(k-1),position});
   }
  }
 }
 return out;
}
export function fingerSegment(name){
 const m=/^(left|right)Hand(Thumb|Index|Middle|Ring|Pinky)([1-3])$/.exec(name);
 return m?name.slice(0,-1)+(Number(m[3])+1):null;
}
export function fingerGroup(name){
 return /^(?:left|right)Hand(Thumb|Index|Middle|Ring|Pinky)[1-4]$/.exec(name)?.[1]??null;
}
// Names only; rotations still require bind-pose and coordinate calibration.
export function mixamoAlias(name){
 const m=/^(?:mixamorig:|mixamorig_)?(Left|Right)Hand(Thumb|Index|Middle|Ring|Pinky)([1-4])$/.exec(name);
 if(m)return m[1].toLowerCase()+'Hand'+m[2]+m[3];
 return null;
}
export function handRegion(p,hand,end){
 if(!hand||!end)return false;
 const a=hand.position,b=end.position,d=b.map((v,i)=>v-a[i]),q=p.map((v,i)=>v-a[i]);
 const l2=d.reduce((s,v)=>s+v*v,0);
 if(l2<1e-8)return false;
 const t=d.reduce((s,v,i)=>s+v*q[i],0)/l2;
 const radial=q.reduce((s,v,i)=>s+(v-t*d[i])**2,0);
 return t>=.12&&t<=1.25&&radial<=l2*.65**2;
}
