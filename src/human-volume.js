// Anatomical prior for unobserved surfaces; not recovered anatomy.
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=v=>{v=clamp(v);return v*v*(3-2*v);};
const bell=(x,c,w)=>Math.exp(-(((x-c)/w)**2));
export function anatomicalSection({row,x,arm,legX,curve}){
 const ax=Math.abs(x),torso=1-smooth((ax-.88)/.55),head=1-smooth((row-.135)/.09),legs=smooth((row-.51)/.13);
 const core=(1-head)*(1-legs)*(1-arm)*torso,lower=(1-arm)*legs,upper=(1-arm)*head;
 const thorax=bell(row,.29,.105),waist=bell(row,.43,.065),pelvis=bell(row,.53,.075);
 const blades=bell(row,.29,.077)*bell(ax,.51,.25),spine=bell(row,.36,.17)*bell(ax,0,.12);
 const lumbar=bell(row,.45,.06)*bell(ax,0,.65),glutes=bell(row,.55,.065)*bell(ax,.48,.33);
 const pecs=bell(row,.28,.065)*bell(ax,.43,.28),abdomen=bell(row,.405,.075)*bell(ax,0,.66);
 const knee=bell(row,.74,.038),calf=bell(row,.82,.068),thigh=bell(row,.62,.08);
 const front=1+core*(.12*thorax-.15*waist+.13*pecs+.09*abdomen-.07*pelvis)+lower*(.08*thigh-.20*knee-.12*calf)+upper*(-.12*bell(row,.065,.045)+.11*bell(row,.115,.035));
 const back=1+core*(.10*thorax-.19*waist+.27*blades-.18*spine-.24*lumbar+.29*glutes)+lower*(.13*thigh-.22*knee+.25*calf*bell(legX,0,.66))+upper*(.13*bell(row,.065,.045)-.12*bell(row,.16,.035));
 const center=core*(.08*thorax-.14*pelvis+.13*waist)+lower*(.16*knee-.07*calf)+upper*(.12*bell(row,.12,.05));
 return {front:clamp(front,.58,1.55),back:clamp(back,.58,1.55),center:clamp(center,-.24,.24)*curve,flatness:core*.23};
}
export function rearTone({row,across,armWeight,leg,head}){
 const ax=Math.abs(2*across-1),body=(1-armWeight)*(1-head)*(1-leg);
 return clamp(1+body*(.035*bell(row,.29,.09)*bell(ax,.50,.27)-.035*bell(row,.45,.07)*bell(ax,0,.75)-.045*bell(row,.35,.16)*bell(ax,0,.085)+.025*bell(row,.55,.08)*bell(ax,.45,.35)),.90,1.08);
}
