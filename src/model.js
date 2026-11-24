import * as T from "../vendor/engine.mjs";
import { profileGeometry, validateProfile, validateReference } from "./profile.js";
import { characterGeometry, characterJPEG } from "./character.js";
import { pixels } from "./raster.js";
export const VERSION = "1.0";
export const MAX_BYTES = 24 * 1024 * 1024;
export const SHAPES = { box: "Cubo", case: "Bloco chanfrado", cylinder: "Cilindro", sphere: "Esfera", cone: "Cone", torus: "Anel", group: "Grupo", mesh: "Malha", profile: "Perfil de foto" };
export const defaults = () => ({ schemaVersion: VERSION, name: "Sem título", units: "meters", materials: [{ id: "neutral", name: "Cerâmica", color: "#a7b1b0", roughness: 0.62, metalness: 0.12 }], parts: [] });
export const makePart = (id, name, shape, material) => ({ id, name, shape, material, parent: null, position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], size: [1, 1, 1] });
const fail = (path, msg) => {
  throw Error(path + " — " + msg);
};
const finite = (n, min = -1e6, max = 1e6) => typeof n === "number" && Number.isFinite(n) && n >= min && n <= max;
const validName = (s) => typeof s === "string" && s.trim().length && s.length <= 120;
const vec = (a, min, max) => Array.isArray(a) && a.length === 3 && a.every((n) => finite(n, min, max));
function ids(items, path) {
  const known = /* @__PURE__ */ new Set();
  items.forEach((x, i) => {
    if (!x || typeof x.id !== "string" || !/^[a-zA-Z0-9_-]{1,96}$/.test(x.id) || known.has(x.id)) fail(path + "[" + i + "].id", "Identificador inválido ou duplicado.");
    if (!validName(x.name)) fail(path + "[" + i + "].name", "Nome vazio ou muito longo.");
    known.add(x.id);
  });
  return known;
}
export function validate(p, { empty = true } = {}) {
  if (!p || p.schemaVersion !== VERSION || p.units !== "meters") fail("projeto", "Use schemaVersion 1.0 e units meters.");
  if (!validName(p.name)) fail("name", "Informe um nome com até 120 caracteres.");
  if (!Array.isArray(p.parts) || p.parts.length > 1500 || !empty && !p.parts.length) fail("parts", "Use até 1.500 peças e inclua geometria para exportar.");
  if (!Array.isArray(p.materials) || !p.materials.length || p.materials.length > 512) fail("materials", "Use de 1 a 512 materiais.");
  const refs = p.references ?? [];
  if (!Array.isArray(refs) || refs.length > 128) fail("references","Use até 128 referências por projeto.");
  ids(refs,"references");
  refs.forEach(validateReference);
  const byRef = new Map(refs.map(r => [r.id,r]));
  const materials = ids(p.materials, "materials"), parts = ids(p.parts, "parts"), parents = /* @__PURE__ */ new Map();
  for (const m of p.materials) if (!/^#[0-9a-f]{6}$/i.test(m.color) || !finite(m.roughness, 0, 1) || !finite(m.metalness, 0, 1)) fail(m.id, "Material PBR inválido.");
  for (const m of p.materials) if(m.baseColorImage!=null) pixels(m.baseColorImage);
  let vertices = 0, triangles = 0;
  for (const n of p.parts) {
    const id = n.id;
    if (!Object.hasOwn(SHAPES, n.shape) || !materials.has(n.material)) fail(id, "Forma ou material desconhecido.");
    if (n.parent !== null && !parts.has(n.parent)) fail(id + ".parent", "Peça pai inexistente.");
    if (!vec(n.position) || !vec(n.rotation) || !vec(n.size, 1e-5, 1e4) || !vec(n.scale, 1e-5, 1e4)) fail(id, "Posição, rotação, escala ou dimensão inválida.");
    parents.set(id, n.parent);
    if(n.shape === "profile") validateProfile(n,byRef.get(n.profile?.reference),byRef.get(n.profile?.back?.reference),byRef.get(n.profile?.side?.reference));
    if (n.shape === "mesh") {
      const g = n.geometry, a = g?.positions;
      if (!Array.isArray(a) || a.length < 9 || a.length % 3 || !a.every((x) => finite(x))) fail(id, "Vértices inválidos.");
      vertices += a.length / 3;
      if (vertices > 6e5) fail(id, "Limite de 600 mil vértices excedido.");
      for (const [key, len] of [["normals", a.length], ["uv", a.length / 3 * 2]]) if (g[key] != null && (!Array.isArray(g[key]) || g[key].length !== len || !g[key].every((x) => finite(x)))) fail(id, key + " inválido.");
      if (g.indices != null && (!Array.isArray(g.indices) || !g.indices.length || g.indices.length % 3 || !g.indices.every((x) => Number.isInteger(x) && x >= 0 && x < a.length / 3))) fail(id, "Índices inválidos.");
      if (g.indices == null && a.length % 9) fail(id, "Triângulo incompleto.");
      triangles += (g.indices?.length ?? a.length / 3) / 3;
      if (triangles > 1e6) fail(id, "Limite de triângulos excedido.");
    }
  }
  for (const n of p.parts) {
    let id = n.id, depth = 0;
    while (id !== null) {
      if (++depth > 96) fail(n.id + ".parent", "Ciclo ou hierarquia acima de 96 níveis.");
      id = parents.get(id);
    }
  }
  if (!empty && !p.parts.some((n) => n.shape !== "group")) fail("parts", "A cena precisa conter ao menos uma malha.");
  return p;
}
/*! A lateral recortada e os dois aros inclinados fazem parte da malha exportada. */
function chamferedBox(w, h, d) {
  const arr = [], uv = [], x = w / 2, z = d / 2, y = h / 2, c = Math.min(w, d) * 0.105, b = Math.min(h * 0.15, c * 0.4);
  function ring(inset, level) {
    const X = x - inset, Z = z - inset, C = c - inset * 0.45;
    return [[-X + C, level, -Z], [-X, level, -Z + C], [-X, level, Z - C], [-X + C, level, Z], [X - C, level, Z], [X, level, Z - C], [X, level, -Z + C], [X - C, level, -Z]];
  }
  const rings = [ring(b, -y), ring(0, -y + b), ring(0, y - b), ring(b, y)];
  function tri(a, b2, c2, coords) {
    arr.push(...a, ...b2, ...c2);
    uv.push(...coords);
  }
  for (let i = 0; i < 8; i++) {
    const j = (i + 1) % 8;
    for (let k = 0; k < 3; k++) {
      const lo = rings[k], hi = rings[k + 1];
      tri(lo[i], lo[j], hi[j], [0, 0, 1, 0, 1, 1]);
      tri(lo[i], hi[j], hi[i], [0, 0, 1, 1, 0, 1]);
    }
    for (const [r, top] of [[rings[0], false], [rings[3], true]]) {
      const a = top ? r[i] : r[j], bb = top ? r[j] : r[i];
      tri([0, a[1], 0], a, bb, [0.5, 0.5, a[0] / w + 0.5, a[2] / d + 0.5, bb[0] / w + 0.5, bb[2] / d + 0.5]);
    }
  }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(arr, 3));
  g.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}
export function geometry(n,ref) {
  const [w, h, d] = n.size;
  if (n.shape === "profile") return n.profile.form==="humanoid"?characterGeometry(n.profile.points,n.size,n.profile.side,ref,n.profile.detail):profileGeometry(n.profile.points,n.size);
  if (n.shape === "case") return chamferedBox(w, h, d);
  if (n.shape === "box") return new T.BoxGeometry(w, h, d);
  if (n.shape === "mesh") {
    const a = n.geometry, g2 = new T.BufferGeometry();
    g2.setAttribute("position", new T.Float32BufferAttribute(a.positions, 3));
    if (a.indices != null) g2.setIndex(a.indices);
    if (a.normals) g2.setAttribute("normal", new T.Float32BufferAttribute(a.normals, 3));
    else g2.computeVertexNormals();
    if (a.uv) g2.setAttribute("uv", new T.Float32BufferAttribute(a.uv, 2));
    return g2.scale(w, h, d);
  }
  let g;
  if (n.shape === "sphere") g = new T.SphereGeometry(0.5, 24, 16);
  else if (n.shape === "torus") g = new T.TorusGeometry(0.39, 0.11, 12, 32).scale(1, 1, 1 / 0.22);
  else g = new T.CylinderGeometry(n.shape === "cone" ? 0 : 0.5, 0.5, 1, 24);
  return g.scale(w, h, d);
}
export function imageMap(uri) {
  const {data,width,height}=pixels(uri);
  const map=new T.DataTexture(data,width,height);
  map.flipY=false;map.colorSpace=T.SRGBColorSpace;
  map.minFilter=map.magFilter=T.LinearFilter;map.needsUpdate=true;
  map.modelLabImage=uri;
  return map;
}
export function buildScene(project,{textures=true}={}) {
  validate(project);
  const root = new T.Group(), objects = /* @__PURE__ */ new Map(), materials = /* @__PURE__ */ new Map(), geometries = /* @__PURE__ */ new Map();
  const maps=new Map(),refs=new Map((project.references||[]).map(r=>[r.id,r]));
  function setImage(m,uri){
    m.modelLabImage=uri;
    if(textures){if(!maps.has(uri))maps.set(uri,imageMap(uri));m.map=maps.get(uri);}
  }
  for (const m of project.materials){
    const material=new T.MeshStandardMaterial({name:m.name,color:m.color,metalness:m.metalness,roughness:m.roughness});
    materials.set(m.id,material);
    if(m.baseColorImage)setImage(material,m.baseColorImage);
  }
  for (const n of project.parts) {
    let o;
    if (n.shape === "group") o = new T.Group();
    else {
      const key = ["mesh","profile"].includes(n.shape) ? n.id : n.shape + "/" + n.size.join("/");
      const ref=refs.get(n.profile?.reference);
      if (!geometries.has(key)) geometries.set(key, geometry(n,ref));
      let material=materials.get(n.material);
      if(n.shape==="profile"&&n.profile.form==="humanoid"){
        material=material.clone();
        const back=n.profile.back;
        const side=n.profile.side;
        const lateral=side?{geometry:geometries.get(key),size:n.size,detail:n.profile.detail,side:{...side,ref:refs.get(side.reference)}}:undefined;
        setImage(material,characterJPEG(ref,n.profile.points,back?{ref:refs.get(back.reference),points:back.points,alignment:back.alignment}:undefined,lateral));materials.set("photo/"+n.id,material);
      }
      o = new T.Mesh(geometries.get(key), material);
      o.castShadow = o.receiveShadow = true;
    }
    o.name = n.name;
    o.userData.partId = n.id;
    if(n.shape==="profile")o.userData.modelLabConstruction=n.profile.form==="humanoid"?(n.profile.back?"two-view-humanoid":"single-view-humanoid"):"single-view-extrusion";
    else if(["two-view-humanoid","single-view-humanoid","single-view-extrusion"].includes(n.origin))o.userData.modelLabConstruction=n.origin;
    if(n.profile?.side||n.sideCalibrated===true)o.userData.modelLabSideCalibrated=true;
    o.position.fromArray(n.position);
    o.rotation.set(...n.rotation.map(T.MathUtils.degToRad));
    o.scale.fromArray(n.scale);
    objects.set(n.id, o);
  }
  for (const n of project.parts) (objects.get(n.parent) ?? root).add(objects.get(n.id));
  root.updateMatrixWorld(true);
  return { root, objects, dispose() {
    for(const map of maps.values())map.dispose();
    for (const g of geometries.values()) g.dispose();
    for (const m of materials.values()) m.dispose();
  } };
}
export function metrics(root) {
  let meshes = 0, triangles = 0;
  root.traverse((o) => {
    if (o.isMesh) {
      meshes++;
      triangles += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3;
    }
  });
  const box = new T.Box3().setFromObject(root, true);
  return { meshes, triangles, dimensions: box.getSize(new T.Vector3()).toArray().map((x) => +x.toFixed(6)) };
}
export function below(parts, id) {
  const out = /* @__PURE__ */ new Set([id]);
  for (let old = -1; old !== out.size; ) {
    old = out.size;
    for (const n of parts) if (out.has(n.parent)) out.add(n.id);
  }
  return out;
}
export function serializeProject(project, pretty = true) {
  const compact = JSON.stringify(project);
  const byteLength = (s) => new TextEncoder().encode(s).length;
  if (byteLength(compact) > MAX_BYTES) throw Error("O projeto editável ultrapassa 24 MiB. Reduza a quantidade de geometria.");
  if (!pretty || compact.length > MAX_BYTES / 3) return compact;
  const formatted = JSON.stringify(project, null, 2) + "\n";
  return byteLength(formatted) <= MAX_BYTES ? formatted : compact;
}
