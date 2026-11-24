import { Viewport } from "./viewport.js";
import * as T from "../vendor/engine.mjs";
import { SHAPES, MAX_BYTES, defaults, makePart, validate, below, metrics, buildScene, serializeProject } from "./model.js";
import { exportGLB, importGLB } from "./format.js";
import { createPhotoEditor } from "./photo-editor.js";
import sign from "../examples/placa.modellab.json";
import { icon } from "./icons.js";
import crate from "../examples/caixa.modellab.json";
import beacon from "../examples/baliza.modellab.json";
import cell from "../examples/celula.modellab.json";
const $ = (s) => document.querySelector(s), $$ = (s) => Array.from(document.querySelectorAll(s));
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const examples = { caixa: crate, baliza: beacon, celula: cell, placa: sign };
const shapeIcons = { box: "Box", case: "Cuboid", sphere: "Circle", cylinder: "Cylinder", cone: "Cone", torus: "Torus", group: "FolderOpen", mesh: "Component", profile: "ScanLine" };
const modes = { select: ["MousePointer2", "Selecionar", "Q"], translate: ["Move", "Mover", "W"], rotate: ["RotateCw", "Girar", "E"], scale: ["Scaling", "Escalar", "R"] };
const $dialog = $("#dialog"), menu = $("#menu"), cache = "rexx-modellab.draft.1";
let project = structuredClone(crate), selected = "corpo", vp, mode = "select", wire = false, grid = true, rootOpen = true, expanded = /* @__PURE__ */ new Set(), saved = false, restored = false;
let before = [], after = [], toastTimer, saveTimer, currentSource, lastFileSource;
try {
  const raw = localStorage.getItem(cache);
  if (raw) {
    project = validate(JSON.parse(raw));
    selected = project.parts[0]?.id;
    restored = true;
  }
} catch {
}
currentSource = JSON.stringify(project);
lastFileSource = restored ? null : currentSource;
$$("[data-ic]").forEach((el) => el.innerHTML = icon(el.dataset.ic, +(el.dataset.size || 16)));
function notify(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.hidden = true, 3700);
}
function modal(title, body, actions = []) {
  $("#modalContent").innerHTML = '<div class="dialoghead"><h2>' + esc(title) + '</h2><span class="push"></span><button class="icon close" aria-label="Fechar">' + icon("X") + '</button></div><div class="dialogbody">' + body + '</div><div class="dialogactions"></div>';
  $(".close").onclick = () => $dialog.close();
  for (const [name, run, style] of actions) {
    const b = document.createElement("button");
    b.textContent = name;
    b.className = style || "subtle";
    b.onclick = () => {
      $dialog.close();
      run?.();
    };
    $(".dialogactions").append(b);
  }
  if (!$dialog.open) $dialog.showModal();
}
function error(e) {
  modal("Não foi possível concluir", "<p>" + esc(e.message || e) + "</p>", [["Fechar"]]);
}
function download(filename, bytes, type) {
  const url = URL.createObjectURL(new Blob([bytes], { type })), a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3e4);
}
const slug = (name = project.name) => name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9_-]+/gi, "-").replace(/^-|-$/g, "").slice(0, 90).toLowerCase() || "modelo";
function save() {
  download(slug() + ".modellab.json", serializeProject(project), "application/json");
  lastFileSource = currentSource;
  saved = true;
  status();
  notify("Projeto editável salvo em JSON.");
}
function status() {
  const el = $("#saved");
  el.textContent = currentSource === lastFileSource ? saved ? "Projeto salvo" : "Projeto de exemplo" : restored ? "Rascunho recuperado" : "Alterações no projeto";
}
function draft() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      if (currentSource.length > 35e5) throw Error();
      localStorage.setItem(cache, currentSource);
    } catch {
      try {
        localStorage.removeItem(cache);
      } catch {
      }
      notify("Salve o arquivo JSON para guardar este projeto.");
    }
  }, 180);
}
function keep(list, s) {
  list.push(s);
  let size = list.reduce((a, b) => a + b.length, 0);
  while (list.length > 1 && (list.length > 45 || size > 14e6)) size -= list.shift().length;
}
function commit(change) {
  const old = currentSource, oldSelected = selected;
  try {
    change();
    validate(project);
    const next = serializeProject(project, false);
    if (next === old) return true;
    keep(before, old);
    after = [];
    currentSource = next;
    restored = false;
    draw(true);
    draft();
    return true;
  } catch (e) {
    project = JSON.parse(old);
    selected = oldSelected;
    currentSource = old;
    draw(true);
    error(e);
    return false;
  }
}
function timeTravel(undo) {
  const src = undo ? before : after, dst = undo ? after : before;
  if (!src.length) return;
  keep(dst, currentSource);
  currentSource = src.pop();
  project = JSON.parse(currentSource);
  restored = false;
  draw(true);
  draft();
}
function install(p, fromFile = false) {
  project = validate(p);
  selected = project.parts[0]?.id ?? null;
  rootOpen = true;
  expanded.clear();
  before = [];
  after = [];
  currentSource = JSON.stringify(project);
  lastFileSource = currentSource;
  saved = fromFile;
  restored = false;
  if (vp) vp.highlight = false;
  draw(true);
  vp?.setView("iso");
  $("#view").value = "iso";
  draft();
  closePanels();
}
function replace(run) {
  if (currentSource === lastFileSource) {
    run();
    return;
  }
  modal("Trocar de projeto?", "<p>O projeto atual tem edições. Você pode salvar uma cópia antes de abrir outra cena.</p>", [["Cancelar"], ["Trocar projeto", run], ["Salvar e trocar", () => {
    save();
    run();
  }, "primary"]]);
}
function emptyProject() {
  replace(() => install(defaults()));
}
function template(key) {
  replace(() => {
    install(structuredClone(examples[key]));
    tab("scene");
  });
}
const shapeBtn = (s) => '<button class="shape" data-shape="' + s + '">' + icon(shapeIcons[s], 19) + "<span>" + SHAPES[s] + "</span></button>";
$("#quickShapes").innerHTML = ["box", "cylinder", "sphere"].map(shapeBtn).join("");
$("#libraryShapes").innerHTML = ["box", "case", "cylinder", "sphere", "cone", "torus", "group"].map(shapeBtn).join("");
const thumbs = JSON.parse($("#templateImages")?.textContent || "{}");
$("#templateList").innerHTML = Object.entries(examples).map(([k, p]) => '<button class="asset" data-template="' + k + '"><img src="' + (thumbs[k] || "assets/" + k + ".webp") + '" alt=""><span>' + esc(p.name) + "<small>" + p.parts.filter((n) => n.shape !== "group").length + " malhas</small></span></button>").join("");
function tab(name) {
  $("#sceneTab").hidden = name !== "scene";
  $("#libraryTab").hidden = name !== "library";
  $$("[data-tab]").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
}
function closePanels() {
  $$(".panel").forEach((x) => x.classList.remove("open"));
}
$("#openLeft").onclick = () => {
  $("#rightPanel").classList.remove("open");
  $("#leftPanel").classList.toggle("open");
};
$("#openRight").onclick = () => {
  $("#leftPanel").classList.remove("open");
  $("#rightPanel").classList.toggle("open");
};
const part = () => project.parts.find((n) => n.id === selected);
function uid() {
  let id;
  do {
    id = "p-" + Math.random().toString(36).slice(2, 11);
  } while (project.parts.some((n) => n.id === id));
  return id;
}
function select(id, reveal = false) {
  selected = id;
  if (reveal) {
    const parents = new Map(project.parts.map((p) => [p.id, p.parent]));
    let a = parents.get(id);
    while (a) {
      expanded.add(a);
      a = parents.get(a);
    }
    rootOpen = true;
  }
  vp?.select(selected, true);
  drawTree();
  drawInspector();
}
function add(s) {
  commit(() => {
    const n = makePart(uid(), SHAPES[s] + " " + (project.parts.filter((x) => x.shape === s).length + 1), s, project.materials[0].id);
    n.size = [0.35, 0.35, 0.35];
    n.position = [0, 0.175, 0];
    if (project.parts.length && vp?.model) {
      const b = new T.Box3().setFromObject(vp.model.root, true);
      if (!b.isEmpty()) n.position = [b.max.x + 0.19, b.min.y + 0.175, 0];
    }
    if (s === "group") n.position = [0, 0, 0];
    project.parts.push(n);
    selected = n.id;
    rootOpen = true;
  });
  tab("scene");
  vp?.frame(false);
  notify(SHAPES[s] + " adicionado à cena.");
}
function pruneReferences(p){
  if(!p.references)return;
  const used=new Set(p.parts.filter(n=>n.shape==="profile").flatMap(n=>[n.profile.reference,n.profile.back?.reference,n.profile.side?.reference]));
  p.references=p.references.filter(r=>used.has(r.id));
  if(!p.references.length)delete p.references;
}
function storeReference(target,source){
  target.references??=[];
  let ref=target.references.find(r=>r.width===source.width && r.height===source.height && r.image===source.image);
  if(!ref){
    let id=source.id||"foto",i=1;
    while(target.references.some(r=>r.id===id))id="foto-"+i++;
    ref={...source,id};target.references.push(ref);
  }
  return ref.id;
}
function attachProfile(target,spec,old=null){
  const reference=storeReference(target,spec.reference);
  let n=old;
  const human=spec.profile.form==="humanoid";
  if(!n || human!==(n.profile.form==="humanoid")){
    const preset=human?{name:"Foto do personagem",color:"#ffffff",roughness:.85,metalness:0}:sign.materials[0];
    let material=target.materials.find(m=>!m.baseColorImage && m.color===preset.color && m.roughness===preset.roughness && m.metalness===preset.metalness);
    if(!material){
      let i=1;while(target.materials.some(m=>m.id==="perfil-"+i))i++;
      material={...preset,id:"perfil-"+i};target.materials.push(material);
    }
    if(n)n.material=material.id;else n=makePart(uid(),spec.name,"profile",material.id);
  }
  n.name=spec.name;n.profile={...spec.profile,reference};n.size=spec.size.slice();
  for(const key of ["back","side"]){
    if(spec.profile[key])n.profile[key].reference=storeReference(target,spec.auxiliary[key].ref);
  }
  if(!old){
    const bounds=target===project&&vp?.model?new T.Box3().setFromObject(vp.model.root,true):null;
    n.position=[bounds&&!bounds.isEmpty()?bounds.max.x+.06+n.size[0]/2:0,n.size[1]/2,0];
    target.parts.push(n);
  }
  pruneReferences(target);return n;
}
const openPhoto=createPhotoEditor((spec,close)=>{
  if(!spec.editing && spec.target==="new"){
    const p=defaults();p.name=spec.name;p.materials=structuredClone(sign.materials);attachProfile(p,spec);
    validate(p);serializeProject(p,false);
    replace(()=>{close();install(p);lastFileSource=null;status();notify("Peça criada. Salve o projeto para guardar a referência.");});
    return;
  }
  const ok=commit(()=>{
    const old=spec.editing?project.parts.find(p=>p.id===spec.editing):null;
    selected=attachProfile(project,spec,old).id;rootOpen=true;
  });
  if(ok){close();tab("scene");select(selected,true);vp?.frame(true);closePanels();notify("Perfil de foto atualizado.");}
});
function startPhoto(){openPhoto({dirty:currentSource!==lastFileSource});}
$("#photoOpen").onclick=startPhoto;
function editProfile(){
  const n=part();if(n?.shape!=="profile")return;
  openPhoto({part:n,reference:project.references.find(r=>r.id===n.profile.reference),auxiliary:Object.fromEntries(["back","side"].map(key=>[key,project.references.find(r=>r.id===n.profile[key]?.reference)])),color:project.materials.find(m=>m.id===n.material).color});
}
function duplicate() {
  if (!part()) return;
  commit(() => {
    const ids = below(project.parts, selected), map = /* @__PURE__ */ new Map(), original = selected;
    for (const n of project.parts.filter((n2) => ids.has(n2.id))) map.set(n.id, uid());
    const copies = project.parts.filter((x) => ids.has(x.id)).map((n) => {
      const c = structuredClone(n);
      c.id = map.get(n.id);
      c.parent = map.get(n.parent) || n.parent;
      if (n.id === original) {
        c.name = n.name.slice(0, 110) + " · cópia";
        c.position[0] += 0.12;
      }
      return c;
    });
    project.parts.push(...copies);
    selected = map.get(original);
  });
}
function remove() {
  if (!part()) return;
  commit(() => {
    const parent = part().parent, ids = below(project.parts, selected);
    project.parts = project.parts.filter((n) => !ids.has(n.id));
    pruneReferences(project);
    selected = parent || project.parts[0]?.id || null;
  });
}
function drawTree() {
  $("#sceneRoot").innerHTML = '<button class="tree-root" id="rootToggle" aria-expanded="' + rootOpen + '">' + icon(rootOpen ? "ChevronDown" : "ChevronRight", 13) + icon("PackageOpen", 16) + "<span>" + esc(project.name) + "</span></button>";
  const children = /* @__PURE__ */ new Map();
  for (const n of project.parts) {
    if (!children.has(n.parent)) children.set(n.parent, []);
    children.get(n.parent).push(n);
  }
  const rows = [];
  function render(parent, depth) {
    for (const n of children.get(parent) || []) {
      const kids = children.has(n.id), open = expanded.has(n.id);
      rows.push('<div tabindex="0" role="treeitem" aria-selected="' + (selected === n.id) + '" ' + (kids ? 'aria-expanded="' + open + '"' : "") + ' data-node="' + n.id + '" class="tree-row ' + (selected === n.id ? "selected" : "") + '" style="padding-left:' + Math.min(depth * 12 + 7, 112) + 'px"><button class="branch" ' + (kids ? 'data-branch="' + n.id + '" aria-label="' + (open ? "Recolher " : "Expandir ") + esc(n.name) + '"' : 'disabled tabindex="-1" aria-hidden="true"') + ">" + (kids ? icon(open ? "ChevronDown" : "ChevronRight", 11) : "") + "</button>" + icon(shapeIcons[n.shape], 14) + '<span class="nodename">' + esc(n.name) + "</span></div>");
      if (kids && open) render(n.id, depth + 1);
    }
  }
  if (rootOpen) render(null, 0);
  $("#tree").innerHTML = rows.join("") || (!project.parts.length ? '<div class="empty-note" style="padding:10px">Adicione uma forma para começar.</div>' : "");
}
const fmt = (n) => +(Math.abs(n) < 1e-7 ? 0 : n.toFixed(5));
function triple(label, key, unit, n) {
  return '<div class="fieldlabel">' + label + '<span class="unit">' + unit + '</span></div><div class="triplet">' + n[key].map((v, i) => '<label class="axisinput"><b class="axis' + i + '">' + "XYZ"[i] + '</b><input type="number" step="' + (key === "rotation" ? 1 : 0.01) + '" aria-label="' + label + " " + "XYZ"[i] + '" data-prop="' + key + '" data-index="' + i + '" value="' + fmt(v) + '"></label>').join("") + "</div>";
}
function section(title, ic, body) {
  return '<div class="ins-section"><h3>' + icon(ic, 14) + title + "</h3>" + body + "</div>";
}
function drawInspector() {
  const n = part(), el = $("#inspector");
  if (!n) {
    el.innerHTML = '<div class="empty">Selecione uma peça na cena ou na hierarquia para editar suas propriedades.</div>';
    return;
  }
  const m = project.materials.find((x) => x.id === n.material), others = below(project.parts, n.id);
  const body = '<div class="selection"><div class="selection-icon">' + icon(shapeIcons[n.shape], 21) + '</div><div class="selection-body"><input class="namefield" id="partName" aria-label="Nome da peça" maxlength="120" value="' + esc(n.name) + '"><small>' + SHAPES[n.shape] + "</small></div></div>";
  let fields = section("Transformação", "Move", triple("Posição", "position", "m", n) + triple("Rotação", "rotation", "graus", n) + triple("Escala", "scale", "×", n));
  if (n.shape !== "group") {
    if(n.shape==="profile"){
      fields+=section("Perfil da foto","ScanLine",'<div class="profile-inspector"><div>'+n.size.map(v=>Number(v.toPrecision(5))).join(' × ')+' m</div><p>'+n.profile.points.length+' pontos · '+(n.profile.form==='humanoid'?'personagem com foto':'profundidade uniforme')+'</p><button class="subtle" id="editProfile">'+icon("Pencil",14)+' Editar contorno e profundidade</button></div>');
    }else fields += section("Geometria", "Box", triple(n.shape === "mesh" ? "Fator da malha" : "Dimensões", "size", n.shape === "mesh" ? "×" : "m", n));
    const opts = project.materials.map((x) => '<option value="' + x.id + '" ' + (x.id === m.id ? "selected" : "") + ">" + esc(x.name) + "</option>").join("");
    const range = (label, k) => '<label class="fieldlabel" for="' + k + '">' + label + '<span class="n" id="' + k + 'Val">' + m[k].toFixed(2) + '</span></label><input class="meter" id="' + k + '" type="range" min="0" max="1" step=".01" value="' + m[k] + '">';
    fields += section("Material", "Palette", '<div class="matline"><input class="swatch" type="color" id="color" title="Cor do material" aria-label="Cor do material" value="' + m.color + '"><select class="drop" id="material" aria-label="Material da peça">' + opts + "</select></div>" + range("Rugosidade", "roughness") + range("Metalicidade", "metalness") + '<p class="mat-note">Material usado em ' + project.parts.filter((x) => x.shape !== "group" && x.material === m.id).length + " peça(s).</p>" + (project.parts.filter((x) => x.shape !== "group" && x.material === m.id).length > 1 ? '<button class="plain small" id="uniqueMat">' + icon("Copy", 12) + " Tornar exclusivo desta peça</button>" : ""));
  }
  fields += section("Hierarquia", "ListTree", '<label class="fieldlabel" for="parent">Peça pai</label><select class="drop" id="parent"><option value="">Raiz do projeto</option>' + project.parts.filter((x) => !others.has(x.id)).map((x) => '<option value="' + x.id + '" ' + (n.parent === x.id ? "selected" : "") + ">" + esc(x.name) + "</option>").join("") + "</select>");
  el.innerHTML = body + fields + '<div class="ins-actions"><button class="subtle" id="duplicate">' + icon("Copy", 13) + ' Duplicar</button><button class="subtle" id="delete">' + icon("Trash2", 13) + " Excluir</button></div>";
}
function drawTools() {
  const btn = (id, ic, label, on, cl = "on") => '<button class="icon ' + (on ? cl : "") + '" data-tool="' + id + '" aria-pressed="' + !!on + '" aria-label="' + label + '" title="' + label + '">' + icon(ic, 17) + "</button>";
  $("#tools").innerHTML = Object.entries(modes).map(([id, [ic, name, key]]) => btn(id, ic, name + " (" + key + ")", id === mode)).join("") + '<span class="vrule"></span>' + btn("grid", "Grid2X2", "Grade (G)", grid, "toggle-on") + btn("wire", "Scan", "Aramado (Z)", wire, "toggle-on");
}
function draw(reload) {
  if (!project.parts.some((n) => n.id === selected)) selected = project.parts[0]?.id || null;
  if (reload) {
    let info;
    if (vp) {
      info = vp.load(project);
      vp.select(selected);
    } else {
      const m = buildScene(project);
      info = metrics(m.root);
      m.dispose();
    }
    $("#stats").textContent = info.meshes + " malhas · " + info.triangles.toLocaleString("pt-BR") + " tris";
  }
  $("#undo").disabled = !before.length;
  $("#redo").disabled = !after.length;
  $("#projectTitle").textContent = project.name;
  drawTree();
  drawInspector();
  drawTools();
  status();
}
function tool(id) {
  if (modes[id]) {
    mode = id;
    vp?.setMode(id);
  }
  if (id === "grid") {
    grid = !grid;
    vp?.setGrid(grid);
  }
  if (id === "wire") {
    wire = !wire;
    vp?.setWire(wire);
  }
  drawTools();
}
function menuAt(anchor, items) {
  menu.innerHTML = "";
  for (const [label, ic, run, shortcut, disabled] of items) {
    const b = document.createElement("button");
    b.disabled = !!disabled;
    b.innerHTML = icon(ic, 15) + "<span>" + esc(label) + "</span><small>" + esc(shortcut || "") + "</small>";
    b.onclick = () => {
      menu.hidden = true;
      run();
    };
    menu.appendChild(b);
  }
  const box = anchor.getBoundingClientRect();
  menu.hidden = false;
  menu.style.top = Math.min(box.bottom + 5, innerHeight - menu.offsetHeight - 7) + "px";
  menu.style.left = Math.max(5, Math.min(box.left, innerWidth - menu.offsetWidth - 8)) + "px";
}
function rename() {
  modal("Renomear projeto", '<label>Nome do projeto<input id="newName" class="textin" maxlength="120" value="' + esc(project.name) + '"></label>', [["Cancelar"], ["Aplicar", () => {
    const value = $("#newName").value.trim();
    commit(() => {
      project.name = value;
    });
  }, "primary"]]);
  $("#newName").select();
}
function openFile() {
  $("#openFile").value = "";
  $("#openFile").click();
}
$("#fileMenu").onclick = (e) => menuAt(e.currentTarget, [
  ["Novo projeto", "FilePlus2", emptyProject],
  ["Foto para 3D", "ScanLine", startPhoto],
  ["Abrir JSON ou GLB", "FolderOpen", openFile, "Ctrl+O"],
  ["Salvar projeto", "Save", save, "Ctrl+S"],
  ["Renomear projeto", "Pencil", rename],
  ["Desfazer", "Undo2", () => timeTravel(true), "Ctrl+Z", !before.length],
  ["Refazer", "Redo2", () => timeTravel(false), "Ctrl+Y", !after.length]
]);
$("#add").onclick = (e) => menuAt(e.currentTarget, ["box", "case", "cylinder", "sphere", "cone", "torus", "group"].map((s) => [SHAPES[s], shapeIcons[s], () => add(s)]));
document.addEventListener("pointerdown", (e) => {
  if (!menu.hidden && !menu.contains(e.target) && !e.target.closest?.("#fileMenu,#add")) menu.hidden = true;
});
$("#openFile").onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    if (file.size > MAX_BYTES) throw Error("O limite por arquivo é 24 MiB.");
    const isGLB = /\.glb$/i.test(file.name), p = isGLB ? await importGLB(await file.arrayBuffer(), file.name.replace(/\.glb$/i, "")) : validate(JSON.parse(await file.text()));
    replace(() => {
      install(p, true);
      if (isGLB) notify("GLB importado como malhas rígidas editáveis.");
    });
  } catch (e2) {
    error(e2);
  }
};
async function output(downloadGLB) {
  const button = $(downloadGLB ? "#export" : "#validate");
  button.disabled = true;
  try {
    const snap = JSON.parse(currentSource);
    const { buffer, report } = await exportGLB(snap);
    if (downloadGLB) {
      download(slug(snap.name) + ".glb", buffer, "model/gltf-binary");
      notify("GLB exportado e reimportado com sucesso.");
    } else modal("Modelo validado", "<p>O GLB foi gerado e reimportado em memória.</p><pre>" + report.meshes + " malhas · " + report.triangles.toLocaleString("pt-BR") + " triângulos\nDimensões XYZ  " + report.dimensions.map((n) => n.toFixed(3)).join(" × ") + " m\nArquivo  " + Math.round(report.bytes / 1024) + " KiB</pre>", [["Fechar"], ["Salvar relatório", () => download(slug(snap.name) + ".validation.json", JSON.stringify(report, null, 2), "application/json"), "primary"]]);
  } catch (e) {
    error(e);
  } finally {
    button.disabled = false;
  }
}
$("#undo").onclick = () => timeTravel(true);
$("#redo").onclick = () => timeTravel(false);
$("#save").onclick = save;
$("#export").onclick = () => output(true);
$("#validate").onclick = () => output(false);
$("#view").onchange = (e) => vp?.setView(e.target.value);
$("#frame").onclick = () => vp?.frame(false);
$("#help").onclick = () => modal("Atalhos do editor", [
  ["Selecionar / mover / girar / escalar", "Q / W / E / R"],
  ["Enquadrar peça / cena", "F / Home"],
  ["Grade / aramado", "G / Z"],
  ["Duplicar / excluir", "Ctrl+D / Delete"],
  ["Desfazer / refazer", "Ctrl+Z / Ctrl+Y"],
  ["Abrir / salvar", "Ctrl+O / Ctrl+S"],
  ["Orbitar / deslocar", "Arrastar / botão direito"],
  ["Zoom", "Roda ou pinça"]
].map(([l, r]) => '<div class="kbdrow"><span>' + l + "</span><kbd>" + r + "</kbd></div>").join(""), [["Fechar"]]);
document.addEventListener("click", (e) => {
  let t = e.target.closest?.("[data-closepanel],[data-tab],[data-shape],[data-template],[data-branch],[data-node],[data-tool],#rootToggle,#duplicate,#delete,#uniqueMat,#editProfile");
  if (!t) return;
  if (t.hasAttribute("data-closepanel")) return closePanels();
  if (t.dataset.tab) return tab(t.dataset.tab);
  if (t.dataset.shape) return add(t.dataset.shape);
  if (t.dataset.template) return template(t.dataset.template);
  if (t.dataset.branch) {
    const id = t.dataset.branch;
    expanded.has(id) ? expanded.delete(id) : expanded.add(id);
    return drawTree();
  }
  if (t.dataset.node) return select(t.dataset.node);
  if (t.dataset.tool) return tool(t.dataset.tool);
  if (t.id === "rootToggle") {
    rootOpen = !rootOpen;
    drawTree();
  }
  if (t.id === "editProfile") return editProfile();
  if (t.id === "uniqueMat") {
    commit(() => {
      const n = part(), m = project.materials.find((m2) => m2.id === n.material);
      let i = 1;
      while (project.materials.some((x) => x.id === "local-" + i)) i++;
      const own = { ...m, id: "local-" + i, name: (m.name + " · " + n.name).slice(0, 120) };
      project.materials.push(own);
      n.material = own.id;
    });
  }
  if (t.id === "duplicate") duplicate();
  if (t.id === "delete") remove();
});
$("#inspector").addEventListener("input", (e) => {
  if (["roughness", "metalness"].includes(e.target.id)) $("#" + e.target.id + "Val").textContent = (+e.target.value).toFixed(2);
});
$("#inspector").addEventListener("change", (e) => {
  const t = e.target, n = part();
  if (!n) return;
  commit(() => {
    if (t.id === "partName") n.name = t.value.trim();
    else if (t.dataset.prop) n[t.dataset.prop][+t.dataset.index] = t.valueAsNumber;
    else if (t.id === "material") n.material = t.value;
    else if (t.id === "parent") {
      const parent = t.value || null;
      const temp = vp?.model || buildScene(project);
      try {
        const o = temp.objects.get(n.id), base = (temp.objects.get(parent) || temp.root).matrixWorld;
        const local = base.clone().invert().multiply(o.matrixWorld), pos = new T.Vector3(), q = new T.Quaternion(), scale = new T.Vector3();
        local.decompose(pos, q, scale);
        const check = new T.Matrix4().compose(pos, q, scale);
        if (local.elements.some((v, i) => Math.abs(v - check.elements[i]) > Math.max(1e-6, Math.abs(v) * 1e-6))) throw Error("Esta combinação de rotação e escala causaria cisalhamento. Uniformize a escala do pai antes de mover a peça.");
        n.parent = parent;
        n.position = pos.toArray();
        n.rotation = new T.Euler().setFromQuaternion(q).toArray().slice(0, 3).map(T.MathUtils.radToDeg);
        n.scale = scale.toArray();
        if (parent) expanded.add(parent);
      } finally {
        if (!vp) temp.dispose();
      }
    } else {
      const m = project.materials.find((x) => x.id === n.material);
      if (t.id === "color") m.color = t.value;
      if (["roughness", "metalness"].includes(t.id)) m[t.id] = +t.value;
    }
  });
});
document.addEventListener("keydown", (e) => {
  if($("#photoDialog").open)return;
  if (e.key === "Escape") {
    menu.hidden = true;
    closePanels();
    return;
  }
  if ($dialog.open || e.target.closest?.("input,select,textarea,[contenteditable]")) return;
  if (e.target.closest?.("[data-node]") && e.key === "Enter") {
    select(e.target.closest?.("[data-node]").dataset.node);
    return;
  }
  const key = e.key.toLowerCase();
  let fn;
  if (e.ctrlKey || e.metaKey) fn = { s: save, o: openFile, z: () => timeTravel(!e.shiftKey), y: () => timeTravel(false), d: duplicate }[key];
  else fn = { q: () => tool("select"), w: () => tool("translate"), e: () => tool("rotate"), r: () => tool("scale"), g: () => tool("grid"), z: () => tool("wire"), f: () => vp?.frame(true), home: () => vp?.frame(false), delete: remove }[key];
  if (fn) {
    e.preventDefault();
    fn();
  }
});
try {
  vp = new Viewport($("#canvas"), { pick: (id) => select(id, true), commitTransform: (id, tr) => commit(() => {
    const n = project.parts.find((x) => x.id === id);
    if (n) Object.assign(n, tr);
  }), updateTransform: (id, tr) => {
    for (const k of Object.keys(tr)) for (let i = 0; i < 3; i++) {
      const input = $('[data-prop="' + k + '"][data-index="' + i + '"]');
      if (input) input.value = fmt(tr[k][i]);
    }
  } });
  const coords = [new T.Vector3(1, 0, 0), new T.Vector3(0, 1, 0), new T.Vector3(0, 0, 1)];
  vp.axisUpdate = (cam) => {
    const inv = cam.quaternion.clone().invert();
    coords.forEach((v, i) => {
      const p = v.clone().applyQuaternion(inv), dx = p.x * 21, dy = -p.y * 21, el = $("#axis" + "XYZ"[i]);
      el.style.transform = "translate(calc(-50% + " + dx + "px), calc(-50% + " + dy + "px))";
      el.style.zIndex = String(Math.round(p.z * 3) + 4);
      el.style.setProperty("--axislength", Math.hypot(dx, dy) + "px");
      el.style.setProperty("--axisangle", Math.atan2(dy, dx) + "rad");
    });
  };
} catch (e) {
  console.error("Falha ao iniciar o viewport 3D.", e);
  $("#gpuFail").hidden = false;
  $("#gpuFail").textContent = "A visualização precisa de WebGL 2. Ative a aceleração gráfica do navegador. O projeto ainda pode ser editado no inspetor e exportado.";
}
draw(true);
vp?.setView("iso");
