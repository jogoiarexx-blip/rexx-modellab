import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { defaults, makePart, validate, serializeProject } from "../src/model.js";
import { exportGLB, importGLB, verifyGLB } from "../src/format.js";
import { GLTFLoader } from "../vendor/engine.mjs";
globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((b) => {
      this.result = b;
      this.onloadend();
    });
  }
};
const example = async (key) => JSON.parse(await readFile(new URL("../examples/" + key + ".modellab.json", import.meta.url)));
test("Os três exemplos exportam e reimportam com geometria real", async () => {
  for (const [name, count] of [["caixa", 97], ["baliza", 7], ["celula", 15]]) {
    const p = await example(name), original = JSON.stringify(p);
    const a = await exportGLB(p);
    assert.equal(a.report.meshes, count);
    assert.ok(a.report.triangles > 0);
    assert.ok(a.report.dimensions.every((n) => n > 0));
    assert.equal(JSON.stringify(p), original);
    const b = await exportGLB(await importGLB(a.buffer, p.name));
    assert.deepEqual(a.report.dimensions, b.report.dimensions);
    assert.equal(a.report.triangles, b.report.triangles);
  }
});
test("Edição do fecho e material local da tampa sobrevivem à leitura do projeto salvo", async () => {
  const p = await example("caixa"), n = p.parts.find((x) => x.id === "fecho-e"), lid = p.parts.find((x) => x.id === "tampa");
  n.position[0] = -0.422;
  p.materials.push({ ...p.materials.find((m) => m.id === lid.material), id: "azul-local", name: "Tampa azul", color: "#839eba" });
  lid.material = "azul-local";
  const a = await exportGLB(p), b = await exportGLB(JSON.parse(serializeProject(p)));
  assert.deepEqual(Buffer.from(a.buffer), Buffer.from(b.buffer));
  const loaded = await new GLTFLoader().parseAsync(a.buffer, "");
  const parts = /* @__PURE__ */ new Map();
  loaded.scene.traverse((o) => parts.set(o.userData.partId, o));
  assert.equal(parts.get(n.id).position.x, -0.422);
  assert.equal(parts.get(n.id).parent.userData.partId, "travas");
  assert.equal(parts.get(lid.id).material.color.getHexString(), "839eba");
  assert.notEqual(parts.get("corpo").material.color.getHexString(), "839eba");
});
test("Cada primitiva gera triângulos, inclusive no projeto de uma única peça", async () => {
  for (const shape of ["box", "case", "cylinder", "sphere", "cone", "torus"]) {
    const p = defaults();
    p.parts.push(makePart("id", "Objeto", shape, "neutral"));
    const { report } = await exportGLB(p);
    assert.equal(report.meshes, 1);
    assert.ok(report.triangles >= 12);
  }
});
test("Recusa ciclos, materiais ausentes, IDs repetidos e arquivos vazios ou inválidos", async () => {
  const p = await example("baliza");
  const bad = structuredClone(p);
  bad.parts[0].parent = bad.parts[0].id;
  assert.throws(() => validate(bad), /Ciclo/);
  p.parts[0].material = "ausente";
  assert.throws(() => validate(p), /material/);
  p.parts.push(p.parts[1]);
  assert.throws(() => validate(p), /duplicado/);
  await assert.rejects(() => exportGLB(defaults()), /geometria/);
  await assert.rejects(() => verifyGLB(new ArrayBuffer(8)), /GLB/);
});
test("Arquivos com animações são recusados antes da conversão para malha rígida", async () => {
  const { buffer } = await exportGLB(await example("baliza"));
  const u = new Uint8Array(buffer), v = new DataView(buffer), n = v.getUint32(12, true);
  const j = JSON.parse(new TextDecoder().decode(u.slice(20, 20 + n)));
  j.animations = [{ name: "Walk", samplers: [], channels: [] }];
  const txt = new TextEncoder().encode(JSON.stringify(j)), len = Math.ceil(txt.length / 4) * 4;
  const edited = new Uint8Array(buffer.byteLength + len - n);
  edited.set(u.slice(0, 20));
  edited.fill(32, 20, 20 + len);
  edited.set(txt, 20);
  edited.set(u.slice(20 + n), 20 + len);
  new DataView(edited.buffer).setUint32(8, edited.length, true);
  new DataView(edited.buffer).setUint32(12, len, true);
  await assert.rejects(() => importGLB(edited.buffer, "Animado"), /animações/);
});
test("CLI executa init, build, validate e import e protege o arquivo de origem", async () => {
  const dir = await mkdtemp(join(tmpdir(), "rexx-")), cli = fileURLToPath(new URL("../cli/modellab.js", import.meta.url));
  const run = (...args) => spawnSync(process.execPath, [cli, ...args], { cwd: dir, encoding: "utf8" });
  try {
    assert.equal(run("init", "--out", "case.json").status, 0);
    const original = await readFile(join(dir, "case.json"));
    assert.equal(run("build", "case.json", "--out", "case.json").status, 1);
    assert.equal(run("build", "case.json", "--dry-run", "--out", "skip.glb").status, 0);
    await assert.rejects(() => readFile(join(dir, "skip.glb")));
    assert.equal(run("build", "case.json", "--out", "out/case.glb", "--report", "out/result.json").status, 0);
    assert.equal(JSON.parse(run("validate", "out/case.glb").stdout).meshes, 97);
    assert.equal(run("import", "out/case.glb", "--out", "readback.json").status, 0);
    assert.deepEqual(original, await readFile(join(dir, "case.json")));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
