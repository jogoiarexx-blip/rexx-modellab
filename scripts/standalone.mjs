import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
const base = new URL("../", import.meta.url);
const load = (name) => readFile(new URL(name, base), "utf8");
const thumbnails = {};
for (const key of ["caixa", "baliza", "celula", "placa"]) {
  const bytes = await readFile(new URL("assets/" + key + ".webp", base));
  thumbnails[key] = "data:image/webp;base64," + bytes.toString("base64");
}
const code = await load("assets/editor.js");
const credits = await Promise.all(["licenses/three.txt", "licenses/lucide.txt","licenses/jpeg-js.txt"].map(load));
const STYLE = await load("assets/style.css");
let html = (await load("index.html")).replace('<link rel="stylesheet" href="assets/style.css">', () => "<style>" + STYLE + "</style>").replace('<script defer src="assets/editor.js"><\/script>', "");
function scriptText(s) {
  return s.replace(/<\/script/gi, "<\\/script");
}
html = html.replace("</body>", () => '<script type="application/json" id="templateImages">' + JSON.stringify(thumbnails) + '<\/script><script type="text/plain" id="licencas">' + scriptText(credits.join("\n\n")) + "<\/script><script>" + scriptText(code) + "<\/script></body>");
const out = process.argv[2] ? resolve(process.argv[2]) : fileURLToPath(new URL("REXX_ModelLab.html", base));
await writeFile(out, html);
