import { build } from "esbuild";
import { fileURLToPath } from "node:url";
process.chdir(fileURLToPath(new URL("..", import.meta.url)));
await build({ entryPoints: ["scripts/engine-entry.js"], bundle: true, minify: true, format: "esm", outfile: "vendor/engine.mjs", legalComments: "eof" });
await build({ entryPoints: ["src/app.js"], bundle: true, minify: true, format: "iife", outfile: "assets/editor.js", legalComments: "eof", target: "es2022" });
