#!/usr/bin/env node
import { readFile, writeFile, rename, mkdir, stat, rm } from "node:fs/promises";
import { resolve, dirname, basename, extname } from "node:path";
import { randomUUID } from "node:crypto";
import { exportGLB, importGLB, verifyGLB } from "../src/format.js";
import { validate, MAX_BYTES, serializeProject } from "../src/model.js";
import { createProject, photoProject, applyOperations, inspectProject } from "../src/automation.js";
import { renderViews } from "../src/render.js";
import { encodePNG } from "./png.js";
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
const help = `REXX ModelLab 0.8 · CLI
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
  if (!["init", "build", "validate", "import", "new", "photo", "edit", "inspect", "render"].includes(command)) throw Error("Comando desconhecido. Use --help.");
  let size=512, views;
  let input, out, report, name, height=1.8, depth, contour, ops, template = "caixa", dry = false;
  const allowed = { init: ["--template", "--out"], build: ["--out", "--report", "--dry-run"], validate: ["--report"], import: ["--out"], new:["--out","--name"], photo:["--out","--name","--height","--depth","--contour"], edit:["--out","--ops"], inspect:["--report"],render:["--out","--size","--views"] }[command];
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
  }
  if (!["init","new"].includes(command) && !input) throw Error("Informe o arquivo de entrada.");
  if (["init","new"].includes(command) && input) throw Error("Use --out para indicar o projeto de saída.");
  if (!out && !["validate","inspect"].includes(command) && !dry) throw Error("Informe --out.");
  const paths = [input, out, report, ops, contour].filter(Boolean).map(resolvePath);
  if (new Set(paths).size !== paths.length) throw Error("Entrada, relatório e saída precisam ter caminhos diferentes.");
  if(command==="new"||command==="photo"||command==="edit"){
    let p;
    if(command==="new")p=createProject(name);
    if(command==="photo")p=photoProject({image:jpegURI(await read(input)),name,height,depth,points:contour?JSON.parse((await read(contour)).toString("utf8")):undefined});
    if(command==="edit"){
      if(!ops)throw Error("Informe --ops.");
      p=applyOperations(JSON.parse((await read(input)).toString("utf8")),JSON.parse((await read(ops)).toString("utf8")));
    }
    await atomic(out,serializeProject(p));log({ok:true,project:out,parts:p.parts.length});return;
  }
  if(command==="render"){
    const p=JSON.parse((await read(input)).toString("utf8"));
    const result=renderViews(p,{size,views});
    const targets=[...Object.keys(result.images).map(v=>resolve(out,v+".png")),resolve(out,"report.json")];
    if(targets.some(t=>resolvePath(t)===resolvePath(input)))throw Error("Saída coincide com entrada.");
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
  if (command === "validate" && extname(input).toLowerCase() === ".glb") result = await verifyGLB(buffer);
  else {
    const p = validate(JSON.parse(data.toString("utf8")));
    const built = await exportGLB(p);
    result = built.report;
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
