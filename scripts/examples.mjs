import { writeFileSync } from "node:fs";
import { defaults, makePart, validate } from "../src/model.js";
const palette = [
  ["olive", "Oliva industrial", "#849258", 0.29, 0.49],
  ["armor", "Grafite moldado", "#343d39", 0.27, 0.57],
  ["rubber", "Borracha", "#1e2322", 0.02, 0.78],
  ["steel", "Aço escovado", "#b5b9ac", 0.78, 0.33],
  ["ink", "Marfim", "#dedfbd", 0.13, 0.66],
  ["signal", "Amarelo sinal", "#ded956", 0.22, 0.45],
  ["inset", "Oliva escuro", "#566344", 0.27, 0.54],
  ["orange", "Laranja de segurança", "#e77f42", 0.21, 0.46]
].map(([id, name, color, metalness, roughness]) => ({ id, name, color, metalness, roughness }));
let p, origins, seq;
function start(name) {
  p = defaults();
  p.name = name;
  p.materials = structuredClone(palette);
  origins = /* @__PURE__ */ new Map();
  seq = 0;
}
function part(id, name, shape, mat, xyz, size, parent = null, rotation = [0, 0, 0]) {
  const n = makePart(id || "p-" + ++seq, name, shape, mat), base = origins.get(parent) || [0, 0, 0];
  n.parent = parent;
  n.position = xyz.map((v, i) => +(v - base[i]).toFixed(6));
  n.size = size;
  n.rotation = rotation;
  origins.set(n.id, xyz);
  p.parts.push(n);
  return n;
}
const box = (...args) => part(null, args[0], "box", ...args.slice(1));
const shell = (...args) => part(null, args[0], "case", ...args.slice(1));
const cyl = (...args) => part(null, args[0], "cylinder", ...args.slice(1));
const group = (id, name, pos) => part(id, name, "group", "armor", pos, [1, 1, 1]);
function save(key) {
  p.materials = p.materials.filter((m) => p.parts.some((n) => n.material === m.id));
  validate(p);
  writeFileSync(new URL("../examples/" + key + ".modellab.json", import.meta.url), JSON.stringify(p, null, 2) + "\n");
}
start("Caixa de suprimentos");
part("corpo", "Carcaça principal", "case", "olive", [0, 0.405, 0], [1.69, 0.62, 0.96]);
part("tampa", "Tampa superior", "case", "olive", [0, 0.787, 0], [1.735, 0.16, 0.986]);
group("travas", "Fechos frontais", [0, 0.69, 0.495]);
group("alcas", "Alças laterais", [0, 0.43, 0]);
group("base", "Chassi e proteções", [0, 0.1, 0]);
group("grafismos", "Identificação", [0, 0.41, 0.482]);
shell("Vedação contínua", "rubber", [0, 0.703, 0], [1.725, 0.052, 0.985], "tampa");
shell("Reforço da tampa", "inset", [0, 0.864, 0], [1.55, 0.026, 0.83], "tampa");
shell("Painel central", "olive", [0, 0.89, 0], [1.13, 0.038, 0.69], "tampa");
for (const x of [-0.736, 0.736]) {
  shell("Proteção longitudinal", "armor", [x, 0.865, 0], [0.16, 0.115, 0.985], "tampa");
  for (const z of [-0.33, 0.33]) box("Inserto antiderrapante", "rubber", [x, 0.925, z], [0.116, 0.012, 0.19], "tampa");
}
for (const x of [-0.51, -0.34, 0, 0.34, 0.51]) shell("Nervura superior", "olive", [x, 0.918, 0], [0.048, 0.042, 0.57], "tampa");
for (const z of [-0.501, 0.501]) {
  for (const x of [-0.72, 0.72]) box("Canto da tampa", "armor", [x, 0.78, z], [0.205, 0.14, 0.038], "tampa");
  box("Faixa do vedante", "rubber", [0, 0.704, z * 0.979], [1.44, 0.026, 0.021], "tampa");
}
shell("Base reforçada", "armor", [0, 0.111, 0], [1.745, 0.122, 0.99], "base");
for (const x of [-0.695, 0.695]) {
  shell("Pé de apoio", "rubber", [x, 0.046, 0], [0.247, 0.09, 0.98], "base");
  for (const z of [-0.447, 0.447]) {
    shell("Protetor de canto", "armor", [x, 0.375, z], [0.213, 0.5, 0.118], "base");
    box("Aresta protetora", "inset", [x, 0.4, z * 1.115], [0.094, 0.39, 0.028], "base");
    box("Sapata externa", "armor", [x, 0.146, z * 1.09], [0.26, 0.116, 0.061], "base");
  }
}
for (const side of [-1, 1]) {
  const z = side * 0.484;
  box("Painel rebaixado", "inset", [0, 0.409, z], [0.69, 0.294, 0.017], "corpo");
  box("Face central", "olive", [0, 0.415, z + side * 0.012], [0.637, 0.242, 0.016], "corpo");
  for (const x of [-0.535, 0.535]) {
    box("Coluna de proteção", "inset", [x, 0.397, z], [0.068, 0.408, 0.027], "corpo");
  }
  for (const x of [-0.373, 0.373]) {
    box("Reforço vertical", "olive", [x, 0.376, z], [0.046, 0.311, 0.039], "corpo");
  }
}
for (const x of [-0.503, 0.503]) {
  const side = x < 0 ? "esquerdo" : "direito";
  const anchor = part("fecho-" + (x < 0 ? "e" : "d"), "Fecho " + side, "case", "rubber", [x, 0.64, 0.514], [0.195, 0.3, 0.047], "travas").id;
  box("Placa de aço", "steel", [x, 0.65, 0.542], [0.153, 0.247, 0.036], anchor);
  box("Abertura do fecho", "rubber", [x, 0.657, 0.564], [0.09, 0.146, 0.018], anchor);
  box("Lingueta basculante", "steel", [x, 0.624, 0.583], [0.116, 0.127, 0.032], anchor, [-8, 0, 0]);
  box("Pegador de pressão", "armor", [x, 0.597, 0.602], [0.091, 0.048, 0.021], anchor);
  cyl("Pino articulado", "steel", [x, 0.736, 0.571], [0.047, 0.17, 0.047], anchor, [0, 0, 90]);
}
for (const x of [-0.854, 0.854]) {
  const s = Math.sign(x);
  box("Rebaixo da alça", "rubber", [x, 0.48, 0], [0.025, 0.242, 0.495], "alcas");
  for (const z of [-0.203, 0.203]) {
    box("Suporte da alça", "armor", [x + s * 0.03, 0.476, z], [0.123, 0.164, 0.077], "alcas");
  }
  box("Pegador lateral", "armor", [x + s * 0.086, 0.459, 0], [0.068, 0.079, 0.408], "alcas");
  for (const z of [-0.195, 0.195]) cyl("Eixo da alça", "steel", [x + s * 0.092, 0.51, z], [0.036, 0.019, 0.036], "alcas", [0, 0, 90]);
  for (const z of [-0.29, 0, 0.29]) box("Nervura lateral", "inset", [x, 0.244, z], [0.027, 0.102, 0.052], "corpo");
}
/*! Letras feitas de traços triangulados na face frontal. */
const glyphs = { R: [[0, 0, 0, 1], [0, 1, 0.65, 1], [0.65, 1, 0.8, 0.8], [0.8, 0.8, 0.8, 0.62], [0.8, 0.62, 0.65, 0.5], [0.65, 0.5, 0, 0.5], [0.4, 0.49, 0.85, 0]], X: [[0, 1, 0.8, 0], [0.8, 1, 0, 0]], "-": [[0.05, 0.5, 0.5, 0.5]], "0": [[0.12, 0, 0.68, 0], [0.68, 0, 0.8, 0.12], [0.8, 0.12, 0.8, 0.88], [0.8, 0.88, 0.68, 1], [0.68, 1, 0.12, 1], [0.12, 1, 0, 0.88], [0, 0.88, 0, 0.12], [0, 0.12, 0.12, 0]], "4": [[0.6, 0, 0.6, 1], [0.6, 1, 0, 0.36], [0, 0.36, 0.83, 0.36]] };
const stencil = part("rx-id", "Inscrição RX-04", "mesh", "ink", [-0.206, 0.373, 0.507], [1, 1, 1], "grafismos");
const positions = [], indices = [], normals = [];
let offset = 0;
for (const c of "RX-04") {
  for (const [x, y, X, Y] of glyphs[c]) {
    const dx = X - x, dy = Y - y, len = Math.hypot(dx, dy), nx = -dy / len * 0.063, ny = dx / len * 0.063, i = positions.length / 3;
    for (const [a, b] of [[x - nx, y - ny], [X - nx, Y - ny], [X + nx, Y + ny], [x + nx, y + ny]]) {
      positions.push((offset + a) * 0.082, b * 0.089, 0);
      normals.push(0, 0, 1);
    }
    indices.push(i, i + 1, i + 2, i, i + 2, i + 3);
  }
  offset += c === "-" ? 0.76 : 1.15;
}
stencil.geometry = { positions, normals, indices };
for (let i = 0; i < 4; i++) box("Marca de sinalização", "signal", [-0.123 + i * 0.045, 0.809, 0.497], [0.024, 0.077, 8e-3], "tampa", [0, 0, -29]);
for (const x of [-0.289, 0.289]) for (const y of [0.313, 0.513]) cyl("Rebite de fixação", "steel", [x, y, 0.507], [0.019, 9e-3, 0.019], "grafismos", [90, 0, 0]);
for (let i = 0; i < 5; i++) box("Código de identificação", "ink", [0.14 + i * 0.019, 0.337, 0.506], [i % 2 ? 0.012 : 6e-3, 0.031, 3e-3], "grafismos");
for (const x of [-0.56, 0.56]) for (const z of [-0.302, 0.302]) cyl("Parafuso da tampa", "steel", [x, 0.888, z], [0.03, 0.014, 0.03], "tampa");
save("caixa");
start("Baliza de sinalização");
part("base", "Plataforma", "case", "armor", [0, 0.055, 0], [0.5, 0.11, 0.5]);
part("torre", "Coluna", "cylinder", "orange", [0, 0.46, 0], [0.15, 0.76, 0.15]);
cyl("Colar inferior", "rubber", [0, 0.145, 0], [0.235, 0.12, 0.235], "base");
cyl("Faixa refletiva", "ink", [0, 0.51, 0], [0.156, 0.12, 0.156], "torre");
cyl("Faixa refletiva superior", "ink", [0, 0.735, 0], [0.156, 0.1, 0.156], "torre");
part("cabeca", "Sinalizador", "sphere", "signal", [0, 0.94, 0], [0.26, 0.23, 0.26]);
cyl("Anel do sinalizador", "armor", [0, 0.85, 0], [0.26, 0.064, 0.26], "cabeca");
save("baliza");
start("Célula de energia");
part("nucleo", "Reservatório", "cylinder", "inset", [0, 0.51, 0], [0.58, 0.84, 0.58]);
for (const [id, y] of [["pe", 0.09], ["tampa", 0.95]]) part(id, id === "pe" ? "Base octogonal" : "Cobertura", "case", "armor", [0, y, 0], [0.71, 0.17, 0.71]);
for (let i = 0; i < 8; i++) {
  const a = i * Math.PI / 4;
  cyl("Haste externa", "steel", [Math.cos(a) * 0.29, 0.52, Math.sin(a) * 0.29], [0.031, 0.79, 0.031], "nucleo");
}
for (const y of [0.34, 0.53, 0.72]) cyl("Anel de carga", "signal", [0, y, 0], [0.592, 0.053, 0.592], "nucleo");
cyl("Terminal", "steel", [0, 1.065, 0], [0.31, 0.075, 0.31], "tampa");
save("celula");
