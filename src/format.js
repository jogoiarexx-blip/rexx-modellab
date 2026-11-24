import * as T from "../vendor/engine.mjs";
import {jpegBytes,jpegURI} from "./raster.js";
import { imageMap, buildScene, defaults, makePart, metrics, validate, MAX_BYTES, serializeProject } from "./model.js";
const unsupported = (reason) => {
  throw Error("GLB fora do perfil rígido desta versão. " + reason);
};
function header(buffer) {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 32 || buffer.byteLength > MAX_BYTES) throw Error("GLB vazio, incompleto ou maior que 24 MiB.");
  const v = new DataView(buffer);
  if (v.getUint32(0, true) !== 1179937895 || v.getUint32(4, true) !== 2 || v.getUint32(8, true) !== buffer.byteLength || v.getUint32(16, true) !== 1313821514) throw Error("Cabeçalho GLB 2.0 inválido.");
  const len = v.getUint32(12, true), next = 20 + len;
  if (len % 4 || next + 8 > buffer.byteLength || v.getUint32(next + 4, true) !== 5130562 || next + 8 + v.getUint32(next, true) !== buffer.byteLength) throw Error("Blocos JSON/BIN inválidos.");
  const j = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, len)));
  if (j.asset?.version !== "2.0") throw Error("Versão glTF incompatível.");
  if (j.scenes?.length !== 1 || (j.scene ?? 0) !== 0) unsupported("Importe um arquivo com uma única cena.");
  if (j.animations?.length || j.skins?.length || j.cameras?.length || j.extensionsUsed?.length || j.extensionsRequired?.length) unsupported("Câmeras, extensões, rigs e animações exigem outro perfil.");
  if (j.buffers?.length !== 1 || j.buffers[0].uri != null || j.buffers[0].byteLength > v.getUint32(next, true)) unsupported("Somente o buffer binário incorporado é aceito.");
  for(const im of j.images??[])if(im.uri!=null||im.mimeType!=="image/jpeg"||!Number.isInteger(im.bufferView)||!j.bufferViews?.[im.bufferView])unsupported("Use imagens JPEG incorporadas.");
  for(const tex of j.textures??[]){
    if(!j.images?.[tex.source])unsupported("Imagem de textura ausente.");
    const s=j.samplers?.[tex.sampler];
    if(!s||s.wrapS!==33071||s.wrapT!==33071||s.magFilter!==9729||s.minFilter!==9729)unsupported("Use textura JPEG com filtro linear e bordas limitadas.");
  }
  if (!j.nodes?.length || j.nodes.length > 1500 || !j.meshes?.length) unsupported("São necessárias malhas em uma hierarquia de até 1.500 nós.");
  const visit = /* @__PURE__ */ new Set();
  function walk(i, depth) {
    if (!Number.isInteger(i) || !j.nodes[i] || visit.has(i) || depth > 96) throw Error("Hierarquia GLB inválida.");
    visit.add(i);
    for (const child of j.nodes[i].children ?? []) walk(child, depth + 1);
  }
  for (const i of j.scenes[0].nodes ?? []) walk(i, 0);
  if (visit.size !== j.nodes.length) unsupported("Há nós fora da cena principal.");
  for (const m of j.materials ?? []) {
    const colorMap=m.pbrMetallicRoughness?.baseColorTexture;
    if(m.normalTexture||m.occlusionTexture||m.emissiveTexture||m.pbrMetallicRoughness?.metallicRoughnessTexture||colorMap&&(!j.textures?.[colorMap.index]||(colorMap.texCoord??0)!==0))unsupported("Use apenas uma textura de cor em UV0.");
    if (m.alphaMode && m.alphaMode !== "OPAQUE" || m.doubleSided || m.emissiveFactor?.some((x) => x !== 0) || m.pbrMetallicRoughness?.baseColorFactor?.[3] < 1) unsupported("Somente materiais PBR opacos, de um lado e sem emissão.");
  }
  let verts = 0, tri = 0;
  for (const n of j.nodes) if (n.mesh != null) {
    const mesh = j.meshes[n.mesh];
    if (!mesh) throw Error("Referência de malha inválida.");
    for (const p of mesh.primitives) {
      if ((p.mode ?? 4) !== 4 || p.targets?.length || !Object.keys(p.attributes).every((a2) => ["POSITION", "NORMAL", "TEXCOORD_0"].includes(a2))) unsupported("Use triângulos com posição, normais e UV0.");
      if(j.materials?.[p.material]?.pbrMetallicRoughness?.baseColorTexture && p.attributes.TEXCOORD_0==null)unsupported("A textura precisa de UV0.");
      const a = j.accessors?.[p.attributes.POSITION];
      if (!a) throw Error("Posições ausentes.");
      verts += a.count;
      tri += (p.indices != null ? j.accessors[p.indices]?.count : a.count) / 3;
    }
  }
  if (!Number.isFinite(verts + tri) || verts > 6e5 || tri > 1e6) unsupported("O arquivo excede o orçamento de geometria.");
  for (const a of j.accessors ?? []) if (a.sparse || !Number.isInteger(a.count) || a.count < 1 || a.count > 3e6 || a.bufferView == null) unsupported("Accessor fora do perfil suportado.");
  for (const b of j.bufferViews ?? []) if (b.buffer !== 0 || !(b.byteLength > 0) || (b.byteOffset ?? 0) < 0 || (b.byteOffset ?? 0) + b.byteLength > j.buffers[0].byteLength) throw Error("Intervalo de dados GLB inválido.");
  return j;
}
async function readScene(buffer) {
  const json = header(buffer);
  const gltf = await new T.GLTFLoader().register(parser=>({name:"ModelLabJPEG",
    async loadTexture(i){
      const im=json.images[json.textures[i].source],data=await parser.getDependency("bufferView",im.bufferView);
      return imageMap(jpegURI(new Uint8Array(data)));
    }
  })).parseAsync(buffer, "");
  return { scene: gltf.scene, json };
}
function free(scene) {
  const gs = /* @__PURE__ */ new Set(), ms = /* @__PURE__ */ new Set();
  scene.traverse((n) => {
    if (n.isMesh) {
      gs.add(n.geometry);
      ms.add(n.material);
    }
  });
  gs.forEach((g) => g.dispose());
  ms.forEach((m) => {m.map?.dispose();m.dispose();});
}
function compareScene(source, loaded) {
  const expected = /* @__PURE__ */ new Map();
  source.traverse((n) => {
    if (n.userData.partId) expected.set(n.userData.partId, n);
  });
  loaded.traverse((n) => {
    if (n === loaded) return;
    const id = n.userData.partId, o = expected.get(id);
    if (!o || o.parent?.userData.partId !== n.parent?.userData.partId || !!o.isMesh !== !!n.isMesh) throw Error("Hierarquia alterada na exportação.");
    if (o.matrixWorld.elements.some((v, i) => Math.abs(v - n.matrixWorld.elements[i]) > Math.max(1e-5, Math.abs(v) * 1e-5))) throw Error("Transformação alterada em " + o.name + ".");
    if (o.isMesh) {
      const a = o.material, b = n.material;
      if(a.modelLabImage!==b.map?.modelLabImage)throw Error("Textura alterada em "+o.name+".");
      if (["r", "g", "b"].some((k) => Math.abs(a.color[k] - b.color[k]) > 1e-5)) throw Error("Cor alterada em " + o.name + ".");
      if (Math.abs(a.metalness - b.metalness) > 1e-5 || Math.abs(a.roughness - b.roughness) > 1e-5) throw Error("Material alterado em " + o.name + ".");
      for (const k of ["position", "normal", "uv"]) if (o.geometry.attributes[k]?.count !== n.geometry.attributes[k]?.count) throw Error("Atributo de malha alterado em " + o.name + ".");
    }
    expected.delete(id);
  });
  if (expected.size) throw Error("Há peças ausentes no GLB.");
}
export async function verifyGLB(buffer, source = null) {
  const { scene,json } = await readScene(buffer);
  try {
    const info = metrics(scene);
    if (!info.meshes || !info.triangles || !info.dimensions.every(Number.isFinite)) throw Error("GLB sem geometria válida.");
    scene.traverse((n) => {
      if (!n.isMesh) return;
      const p = n.geometry.attributes.position, idx = n.geometry.index;
      for (let i = 0; i < p.count; i++) if (!Number.isFinite(p.getX(i) + p.getY(i) + p.getZ(i))) throw Error("Vértice não finito.");
      if (idx) {
        for (let i = 0; i < idx.count; i++) if (idx.getX(i) >= p.count) throw Error("Índice fora da malha.");
      }
    });
    if (source) {
      source.updateMatrixWorld(true);
      scene.updateMatrixWorld(true);
      compareScene(source, scene);
    }
    const inferredSurfaces = [];
    scene.traverse(n => {
      if(n.userData.modelLabConstruction==="two-view-humanoid")inferredSurfaces.push({partId:n.userData.partId,surfaces:["laterais"],method:n.userData.modelLabSideCalibrated?"volume ajustado pelo contorno de perfil, com fotos projetadas na frente e nas costas":"volume estimado pelo contorno frontal, com fotos projetadas na frente e nas costas"});
      if(n.userData.modelLabConstruction==="single-view-humanoid")inferredSurfaces.push({partId:n.userData.partId,surfaces:["laterais","traseira"],method:n.userData.modelLabSideCalibrated?"volume ajustado pelo contorno de perfil, com foto projetada na frente":"volume estimado por região corporal, com foto projetada na frente"});
      if(n.userData.modelLabConstruction === "single-view-extrusion")
        inferredSurfaces.push({partId:n.userData.partId, surfaces:["laterais","traseira"], method:"extrusão de profundidade uniforme a partir de uma vista"});
    });
    return { ...(inferredSurfaces.length ? {inferredSurfaces} : {}), textures:json.textures?.length??0, ok: true, format: "glTF 2.0 / GLB", profile: "rigid-pbr", reimported: true, ...info, bytes: buffer.byteLength };
  } finally {
    free(scene);
  }
}
export async function exportGLB(project) {
  validate(project, { empty: false });
  const model = buildScene(project,{textures:false});
  try {
    const scene = new T.Scene();
    scene.name = project.name;
    for (const child of [...model.root.children]) scene.add(child);
    const info = metrics(scene);
    const buffer = await new T.GLTFExporter().register(writer=>{
      const cache=new Map();
      return {name:"ModelLabJPEG", async writeMaterialAsync(m,def){
        const uri=m.modelLabImage;if(!uri)return;
        const j=writer.json;
        j.textures??=[];j.images??=[];j.samplers??=[{wrapS:33071,wrapT:33071,minFilter:9729,magFilter:9729}];
        if(!cache.has(uri)){
          const bytes=jpegBytes(uri),view=await writer.processBufferViewImage(new Blob([bytes],{type:"image/jpeg"}));
          j.bufferViews[view].byteLength=bytes.length;
          const source=j.images.push({bufferView:view,mimeType:"image/jpeg"})-1;
          cache.set(uri,j.textures.push({source,sampler:0})-1);
        }
        def.pbrMetallicRoughness.baseColorTexture={index:cache.get(uri)};
      }};
    }).parseAsync(scene, { binary: true, trs: true, onlyVisible: false });
    const report = await verifyGLB(buffer, scene);
    if (info.meshes !== report.meshes || info.triangles !== report.triangles || info.dimensions.some((n, i) => Math.abs(n - report.dimensions[i]) > Math.max(1e-5, Math.abs(n) * 1e-5))) throw Error("Divergência na reimportação do GLB.");
    return { buffer, report };
  } finally {
    model.dispose();
  }
}
function unpack(attr) {
  const out = [];
  for (let i = 0; i < attr.count; i++) {
    out.push(attr.getX(i), attr.getY(i));
    if (attr.itemSize === 3) out.push(attr.getZ(i));
  }
  return out;
}
export async function importGLB(buffer, name) {
  const { scene, json } = await readScene(buffer);
  try {
    let material = function(m) {
      if (!m) {
        if (!p.materials.length) p.materials.push(defaults().materials[0]);
        return p.materials[0].id;
      }
      if (mats.has(m)) return mats.get(m);
      const id = "mat-" + (p.materials.length + 1);
      mats.set(m, id);
      p.materials.push({ id, name: (m.name || "Material " + p.materials.length).slice(0, 120), color: "#" + m.color.getHexString(), metalness: m.metalness, roughness: m.roughness, ...(m.map?.modelLabImage?{baseColorImage:m.map.modelLabImage}:{}) });
      return id;
    }, add = function(o, parent) {
      const original = o.userData.partId;
      let id = typeof original === "string" && /^[a-zA-Z0-9_-]{1,96}$/.test(original) && !usedIds.has(original) ? original : "node-" + (p.parts.length + 1);
      while (usedIds.has(id)) id += "x";
      usedIds.add(id);
      const n = makePart(id, (o.userData.name || o.name || "Peça").slice(0, 120), o.isMesh ? "mesh" : "group", material(o.material));
      if(o.isMesh && ["two-view-humanoid","single-view-humanoid","single-view-extrusion"].includes(o.userData.modelLabConstruction)) n.origin=o.userData.modelLabConstruction;
      if(o.isMesh&&o.userData.modelLabSideCalibrated===true)n.sideCalibrated=true;
      n.parent = parent;
      n.position = o.position.toArray();
      n.rotation = [o.rotation.x, o.rotation.y, o.rotation.z].map(T.MathUtils.radToDeg);
      n.scale = o.scale.toArray();
      if (o.isMesh) {
        const g = o.geometry;
        n.geometry = { positions: unpack(g.attributes.position) };
        if (g.attributes.normal) n.geometry.normals = unpack(g.attributes.normal);
        if (g.attributes.uv) n.geometry.uv = unpack(g.attributes.uv);
        if (g.index) n.geometry.indices = Array.from(g.index.array);
      }
      p.parts.push(n);
      for (const c of o.children) add(c, id);
    };
    const p = defaults();
    p.name = (name || scene.name || "Modelo importado").slice(0, 120);
    p.materials = [];
    const mats = /* @__PURE__ */ new Map(), usedIds = /* @__PURE__ */ new Set();
    for (const o of scene.children) add(o, null);
    for (const n of json.nodes) if (n.matrix) {
      const m = new T.Matrix4().fromArray(n.matrix), pos = new T.Vector3(), q = new T.Quaternion(), s = new T.Vector3();
      m.decompose(pos, q, s);
      const restored = new T.Matrix4().compose(pos, q, s);
      if (m.elements.some((v, i) => Math.abs(v - restored.elements[i]) > 1e-5)) unsupported("Transformação com cisalhamento não editável.");
    }
    validate(p, { empty: false });
    serializeProject(p, false);
    return p;
  } finally {
    free(scene);
  }
}
