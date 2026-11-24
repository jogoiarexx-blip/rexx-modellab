#!/usr/bin/env node
import { readFile, writeFile, rename, mkdir, stat, rm } from "node:fs/promises";
import { resolve, dirname, basename, extname } from "node:path";
import { randomUUID } from "node:crypto";
import { exportGLB, importGLB, verifyGLB } from "../src/format.js";
import { validate, MAX_BYTES, serializeProject } from "../src/model.js";
import { createProject, photoProject, applyOperations, inspectProject } from "../src/automation.js";
import { animationNames, getClip, exportAnimatedGLB, exportAnimationClips, previewAnimation } from "../src/animation.js";
import { exportSkinnedGLB, verifySkinnedGLB, hasSkin, previewPose } from "../src/skin.js";
import { autoRig, adjustRig, previewRig } from "../src/rig.js";
import { parseMotionFBX } from "./fbx-motion.js";
import { retargetMotion } from "../src/retarget.js";
import { auditViews } from "../src/view-audit.js";
import { optimizeProject } from "../src/mesh-optimization.js";
import { buildHandMesh, gripPose } from "../src/hand-mesh.js";
import { trainClothing } from "../src/clothing-training.js";
import { refineCharacter } from "../src/refine.js";
import { renderViews } from "../src/render.js";
import { auditUV, editTextures, materialMaps } from "../src/texture.js";
import { encodePNG } from "./png.js";
import { inspectReferenceGLB, photoTrainingOptions } from "../src/reference-training.js";
import { jpegURI } from "../src/raster.js";
if (!globalThis.FileReader) globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((value) => {
      this.result = value;
      this.onloadend?.();
    }, (e) => {
      this.error = e;
      this.onerror?.(e);
    });
  }
};
const help = `REXX ModelLab 0.14 · CLI
  node cli/modellab.js clothing personagem.modellab.json --out vestido.modellab.json [--id character] [--ops roupa.json] [--report roupa-report.json]
  node cli/modellab.js uv-audit projeto.modellab.json [--report uv.json]
  node cli/modellab.js texture projeto.modellab.json --out otimizado.modellab.json [--preset mobile|balanced|cinematic] [--ops textura.json] [--report textura-report.json]
  node cli/modellab.js material-maps textura.jpg --out mapas [--size 512]
  node cli/modellab.js animations
  node cli/modellab.js build personagem.modellab.json --rig personagem.rig.json --animations all --out personagem.glb
  node cli/modellab.js animation-preview personagem.modellab.json --rig personagem.rig.json --clip walk --time .25 --out revisao
  node cli/modellab.js build personagem.modellab.json --rig personagem.rig.json --out personagem.glb
  node cli/modellab.js pose-preview personagem.modellab.json --rig personagem.rig.json --ops pose.json --out revisao
  node cli/modellab.js rig personagem.modellab.json --id character --out personagem.rig.json [--ops joints.json] [--hands basic|detailed]
  node cli/modellab.js rig-edit personagem.rig.json --ops joints.json --out corrigido.rig.json
  node cli/modellab.js rig-preview personagem.modellab.json --rig personagem.rig.json --out revisao [--size 512] [--views front,left,iso]
  node cli/modellab.js photo frente.jpg --back costas.jpg --side lateral.jpg --facing left --out personagem.modellab.json
  node cli/modellab.js refine personagem.modellab.json --id character --ops fatores.json --out refinado.modellab.json
  node cli/modellab.js render projeto.modellab.json --out pasta [--size 512] [--views front,back,left,right,iso]
  node cli/modellab.js new --out projeto.modellab.json [--name Nome]
  node cli/modellab.js photo foto.jpg --out personagem.modellab.json [--height 1.8] [--depth .25] [--contour pontos.json] [--name Nome]
  node cli/modellab.js edit projeto.modellab.json --ops operacoes.json --out ajustado.modellab.json
  node cli/modellab.js inspect projeto.modellab.json [--report relatorio.json]
  node cli/modellab.js init --template caixa|baliza|celula|placa --out projeto.modellab.json
  node cli/modellab.js build projeto.modellab.json --out modelo.glb [--report validacao.json] [--dry-run]
  node cli/modellab.js validate modelo.glb [--report validacao.json]
  node cli/modellab.js validate projeto.modellab.json [--report validacao.json]
  node cli/modellab.js import modelo.glb --out projeto.modellab.json
  node cli/modellab.js reference modelo.glb [--preset mobile|balanced|cinematic] [--report referencia.json]
  photo e build aceitam --preset mobile|balanced|cinematic.
  node cli/modellab.js hands-mesh refinado.modellab.json --rig personagem.rig.json --out maos.modellab.json [--ops maos.json] [--report maos-report.json]
  node cli/modellab.js grip personagem.rig.json --out pose.json [--strength 0.8]
  node cli/modellab.js optimize projeto.modellab.json --out leve.modellab.json [--id character] [--preset mobile] [--rig personagem.rig.json] [--ops otimizacao.json] [--report mesh-report.json]
  node cli/modellab.js retarget corrida.fbx --rig personagem.rig.json --out corrida.clip.json [--report retarget.json] [--fps 30] [--yaw 0]
  build aceita --motion corrida.clip.json (com --rig e opcionalmente --animations).
  node cli/modellab.js view-audit personagem.modellab.json [--id character] [--report vistas.json]
  photo aceita --alignment alinhamento.json.
  node cli/modellab.js --help

Caminhos são relativos ao diretório atual. O projeto fonte é preservado.
O relatório JSON também é impresso no terminal. Código 0 indica sucesso, 1 indica erro.
`;
const log = (value) => console.log(JSON.stringify(value, null, 2));
const json = (value) => JSON.stringify(value, null, 2) + "\n";
async function read(path) {
  if ((await stat(path)).size > MAX_BYTES) throw Error("Arquivo maior que 24 MiB.");
  const b = await readFile(path);
  return b;
}
async function atomic(path, bytes) {
  await mkdir(dirname(resolve(path)), { recursive: true });
  const tmp = resolve(dirname(path), ".modellab-" + randomUUID() + ".tmp");
  try {
    await writeFile(tmp, bytes, { flag: "wx" });
    await rename(tmp, path);
  } finally {
    await rm(tmp, { force: true });
  }
}
async function run() {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === "--help" || command === "-h" || args.includes("--help")) {
    console.log(help);
    return;
  }
  if (!["init", "build", "validate", "import", "new", "photo", "edit", "inspect", "render", "refine", "rig", "rig-edit", "rig-preview", "pose-preview", "animation-preview", "animations", "reference", "uv-audit", "texture", "material-maps", "hands-mesh", "grip", "optimize", "retarget", "clothing", "view-audit"].includes(command)) throw Error("Comando desconhecido. Use --help.");
  if(command==="animations"){if(args.length)throw Error("animations não aceita argumentos.");log(animationNames().map(name=>{const c=getClip(name);return {name,loop:c.loop,duration:c.frames.at(-1).time};}));return;}
  let alignmentFile, motionFile, fps=30, yaw=0, optimizeId, strength=1,hands='basic', preset, explicitDetail, animationList, clip="walk", time=0, rigFile, size=512, views, back, side, facing, backContour, sideContour, volume=1, detail=.16, id='character';
  let input, out, report, name, height=1.8, depth, contour, ops, template = "caixa", dry = false;
  const allowed = { "view-audit":["--id","--report"], clothing:["--out","--id","--ops","--report"],retarget:["--rig","--out","--report","--fps","--yaw","--name"], optimize:["--id","--preset","--rig","--out","--ops","--report"], "hands-mesh":["--rig","--out","--ops","--report"],grip:["--out","--strength"], init: ["--template", "--out"], build: ["--out", "--report", "--dry-run", "--rig", "--animations","--preset","--motion"], reference:["--preset","--report"],"uv-audit":["--report"],texture:["--out","--preset","--ops","--report"],"material-maps":["--out","--size"], validate: ["--report"], import: ["--out"], new:["--out","--name"], photo:["--out","--name","--height","--depth","--contour","--back","--side","--facing","--back-contour","--side-contour","--volume","--detail","--preset","--alignment"], edit:["--out","--ops"], inspect:["--report"],render:["--out","--size","--views"],refine:["--out","--id","--ops"],rig:["--out","--id","--ops","--hands"],"rig-edit":["--out","--ops"],"rig-preview":["--out","--rig","--size","--views"],"pose-preview":["--out","--rig","--ops","--size","--views"],"animation-preview":["--out","--rig","--clip","--time","--size","--views"] }[command];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a.startsWith("--") && !input) {
      input = a;
      continue;
    }
    if (!allowed.includes(a)) throw Error("Argumento inválido: " + a);
    if (a === "--dry-run") {
      dry = true;
      continue;
    }
    const v = args[++i];
    if (!v || v.startsWith("--")) throw Error("Valor ausente para " + a);
    if (a === "--out") out = v;
    if (a === "--report") report = v;
    if (a === "--template") template = v;
    if(a==="--name")name=v;
    if(a==="--height")height=Number(v);
    if(a==="--depth")depth=Number(v);
    if(a==="--contour")contour=v;
    if(a==="--ops")ops=v;
    if(a==="--size")size=Number(v);
    if(a==="--views")views=v.split(",");
    if(a==="--back")back=v;
    if(a==="--side")side=v;
    if(a==="--facing")facing=v;
    if(a==="--back-contour")backContour=v;
    if(a==="--side-contour")sideContour=v;
    if(a==="--volume")volume=Number(v);
    if(a==="--detail"){detail=Number(v);explicitDetail=detail;}
    if(a==="--preset")preset=v;
    if(a==="--id"){id=v;optimizeId=v;}
    if(a==="--hands")hands=v;
    if(a==="--strength")strength=Number(v);
    if(a==="--rig")rigFile=v;
    if(a==="--alignment")alignmentFile=v;
    if(a==="--motion")motionFile=v;
    if(a==="--fps")fps=Number(v);
    if(a==="--yaw")yaw=Number(v);
    if(a==="--animations")animationList=v==="all"?animationNames():v.split(",");
    if(a==="--clip")clip=v;
    if(a==="--time")time=Number(v);
  }
  if (!["init","new"].includes(command) && !input) throw Error("Informe o arquivo de entrada.");
  if (["init","new"].includes(command) && input) throw Error("Use --out para indicar o projeto de saída.");
  if (!out && !["validate","inspect","reference","uv-audit","view-audit"].includes(command) && !dry) throw Error("Informe --out.");
  const paths = [input, out, report, ops, contour, back, side, backContour, sideContour, rigFile, motionFile, alignmentFile].filter(Boolean).map(resolvePath);
  if (new Set(paths).size !== paths.length) throw Error("Entrada, relatório e saída precisam ter caminhos diferentes.");
  if(command==="clothing"){
    const p=JSON.parse((await read(input)).toString("utf8")),options=ops?JSON.parse((await read(ops)).toString("utf8")):{};
    const result=trainClothing(p,id,options);
    await atomic(out,serializeProject(result.project));if(report)await atomic(report,json(result.report));log(result.report);return;
  }
  if(command==="view-audit"){
    const result=auditViews(JSON.parse((await read(input)).toString("utf8")),id);if(report)await atomic(report,json(result));log(result);return;
  }
  if(command==="retarget"){
    if(!rigFile)throw Error("Informe --rig.");
    if((await stat(input)).size>128*1024*1024)throw Error("FBX maior que 128 MiB.");
    const motion=parseMotionFBX(await readFile(input));
    const {report:details,...clip}=retargetMotion(motion,JSON.parse((await read(rigFile)).toString("utf8")),{fps,yaw,name});
    await atomic(out,json(clip));const result={...details,sourceStats:motion.stats};if(report)await atomic(report,json(result));log(result);return;
  }
  if(command==="optimize"){
    const p=JSON.parse((await read(input)).toString("utf8")),options=ops?JSON.parse((await read(ops)).toString("utf8")):{};
    const rig=rigFile?JSON.parse((await read(rigFile)).toString("utf8")):undefined;
    const result=optimizeProject(p,{...options,...(optimizeId?{id:optimizeId}:{}),...(preset?{preset}:{}),...(rig?{rig}:{})});
    await atomic(out,serializeProject(result.project));if(report)await atomic(report,json(result.report));log(result.report);return;
  }
  if(command==="grip"){
    const pose=gripPose(JSON.parse((await read(input)).toString("utf8")),strength);
    await atomic(out,json(pose));log({ok:true,joints:Object.keys(pose).length,output:out});return;
  }
  if(command==="hands-mesh"){
    if(!rigFile)throw Error("Informe --rig.");
    const result=buildHandMesh(JSON.parse((await read(input)).toString("utf8")),JSON.parse((await read(rigFile)).toString("utf8")),ops?JSON.parse((await read(ops)).toString("utf8")):{});
    await atomic(out,serializeProject(result.project));if(report)await atomic(report,json(result.report));log(result.report);return;
  }
  if(command==="uv-audit"){
    const result=auditUV(JSON.parse((await read(input)).toString("utf8")));
    if(report)await atomic(report,json(result));log(result);return;
  }
  if(command==="texture"){
    const p=JSON.parse((await read(input)).toString("utf8")),options=ops?JSON.parse((await read(ops)).toString("utf8")):{};
    const result=editTextures(p,{...options,...(preset?{preset}:{})});
    await atomic(out,serializeProject(result.project));if(report)await atomic(report,json(result.report));log(result.report);return;
  }
  if(command==="material-maps"){
    const maps=materialMaps(jpegURI(await read(input)),{maxSide:size});
    if(Object.keys(maps).some(k=>resolvePath(resolve(out,k+".png"))===resolvePath(input)))throw Error("Saída coincide com entrada.");
    for(const [k,im] of Object.entries(maps))await atomic(resolve(out,k+".png"),encodePNG(im));
    log({ok:true,maps:Object.keys(maps),output:out});return;
  }
  if(command==="reference"){
    if((await stat(input)).size>128*1024*1024)throw Error("Referência maior que 128 MiB.");
    const result=inspectReferenceGLB(await readFile(input),{preset});
    if(report)await atomic(report,json(result));log(result);return;
  }
  if(command==="new"||command==="photo"||command==="edit"){
    let p;
    if(command==="new")p=createProject(name);
    if(command==="photo"){
      if(preset)detail=photoTrainingOptions(preset,explicitDetail).detail;
      const view=async(path,pointsPath)=>path?{image:jpegURI(await read(path)),points:pointsPath?JSON.parse((await read(pointsPath)).toString("utf8")):undefined}:undefined;
      const lateral=await view(side,sideContour),rear=await view(back,backContour);
      const alignment=alignmentFile?JSON.parse((await read(alignmentFile)).toString("utf8")):{};
      if(!alignment||typeof alignment!=="object"||Array.isArray(alignment)||Object.keys(alignment).some(k=>!["back","side"].includes(k))||(alignment.side!==undefined&&!lateral)||(alignment.back!==undefined&&!rear))throw Error("Alinhamento sem vista correspondente ou inválido.");
      if(lateral){lateral.facing=facing;if(alignment.side!==undefined)lateral.alignment=alignment.side;}
      if(rear&&alignment.back!==undefined)rear.alignment=alignment.back;
      p=photoProject({image:jpegURI(await read(input)),name,height,depth,volume,detail,points:contour?JSON.parse((await read(contour)).toString("utf8")):undefined,back:rear,side:lateral});
    }
    if(command==="edit"){
      if(!ops)throw Error("Informe --ops.");
      p=applyOperations(JSON.parse((await read(input)).toString("utf8")),JSON.parse((await read(ops)).toString("utf8")));
    }
    await atomic(out,serializeProject(p));log({ok:true,project:out,parts:p.parts.length});return;
  }
  if(command==="refine"){
    const p=refineCharacter(JSON.parse((await read(input)).toString("utf8")),id,ops?JSON.parse((await read(ops)).toString("utf8")):{});
    await atomic(out,serializeProject(p));log({ok:true,project:out});return;
  }
  if(command==="rig"||command==="rig-edit"){
    const source=JSON.parse((await read(input)).toString("utf8"));
    if(command==="rig-edit"&&!ops)throw Error("Informe --ops.");
    const joints=ops?JSON.parse((await read(ops)).toString("utf8")):{};
    const rig=command==="rig"?autoRig(source,id,{joints,hands}):adjustRig(source,joints);
    await atomic(out,json(rig));log({ok:true,bones:rig.bones.length,output:out,warnings:rig.warnings});return;
  }
  if(command==="render"||command==="rig-preview"||command==="pose-preview"||command==="animation-preview"){
    const p=JSON.parse((await read(input)).toString("utf8"));
    if(command!=="render"&&!rigFile)throw Error("Informe --rig.");
    const rig=rigFile?JSON.parse((await read(rigFile)).toString("utf8")):null;
    const result=command==="animation-preview"?previewAnimation(p,rig,clip,time,{size,views}):command==="pose-preview"?previewPose(p,rig,ops?JSON.parse((await read(ops)).toString("utf8")):{},{size,views}):command==="rig-preview"?previewRig(p,rig,{size,views}):renderViews(p,{size,views});
    const targets=[...Object.keys(result.images).map(v=>resolve(out,v+".png")),resolve(out,"report.json")];
    if(targets.some(t=>[input,rigFile,ops].filter(Boolean).some(s=>resolvePath(t)===resolvePath(s))))throw Error("Saída coincide com entrada.");
    for(const [v,image] of Object.entries(result.images))await atomic(resolve(out,v+".png"),encodePNG(image));
    await atomic(resolve(out,"report.json"),json(result.report));log(result.report);return;
  }
  if(command==="inspect"){
    const result=inspectProject(JSON.parse((await read(input)).toString("utf8")));
    if(report)await atomic(report,json(result));log(result);return;
  }
  if (command === "init") {
    if (!["caixa", "baliza", "celula", "placa"].includes(template)) throw Error("Template desconhecido.");
    const p = validate(JSON.parse(await readFile(new URL("../examples/" + template + ".modellab.json", import.meta.url), "utf8")));
    await atomic(out, serializeProject(p));
    log({ ok: true, project: out });
    return;
  }
  const data = await read(input), buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  if (command === "import") {
    const p = await importGLB(buffer, basename(input, extname(input)));
    await atomic(out, serializeProject(p));
    log({ ok: true, project: out });
    return;
  }
  let result;
  if (command === "validate" && extname(input).toLowerCase() === ".glb") result = hasSkin(buffer)?await verifySkinnedGLB(buffer):await verifyGLB(buffer);
  else {
    const p = validate(JSON.parse(data.toString("utf8")));
    if((animationList||motionFile)&&!rigFile)throw Error("Animações exigem --rig.");
    const rig=rigFile?JSON.parse((await read(rigFile)).toString("utf8")):null;
    const built = motionFile?await exportAnimationClips(p,rig,[...(animationList??[]).map(getClip),JSON.parse((await read(motionFile)).toString("utf8"))]):animationList?await exportAnimatedGLB(p,rig,animationList):rig?await exportSkinnedGLB(p,rig):await exportGLB(p);
    result = built.report;
    if(preset&&command==="build")result.trainingBudget=inspectReferenceGLB(built.buffer,{preset}).budget;
    if (command === "build" && !dry) {
      await atomic(out, new Uint8Array(built.buffer));
      result.output = out;
    }
  }
  if (report && !dry) await atomic(report, json(result));
  log(result);
}
function resolvePath(p) {
  const normalized = resolve(p);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}
run().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: e.message }));
  process.exitCode = 1;
});
