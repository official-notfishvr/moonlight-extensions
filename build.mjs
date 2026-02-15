import fs from "node:fs";
import path from "node:path";
import { watchExt, buildExt } from "@moonlight-mod/esbuild-config";

const esm = [];

const watch = process.argv.includes("--watch");
const clean = process.argv.includes("--clean");

if (clean) {
  fs.rmSync("./dist", { recursive: true, force: true });
} else {
  const exts = fs.readdirSync("./src");

  for (const ext of exts) {
    /** @type {import("@moonlight-mod/esbuild-config").ESBuildFactoryOptions} */
    const cfg = {
      ext,
      entry: path.resolve(path.join("src", ext)),
      output: path.resolve(path.join("dist", ext)),
      esm: esm.includes(ext)
    };

    if (watch) {
      await watchExt(cfg);
    } else {
      await buildExt(cfg);
    }

    const srcDir = path.join("src", ext);
    const outDir = path.join("dist", ext);
    if (fs.existsSync(srcDir) && fs.existsSync(outDir)) {
      const entries = fs.readdirSync(srcDir, { withFileTypes: true });
      for (const e of entries) {
        if (e.isFile() && e.name.endsWith(".css")) {
          fs.copyFileSync(path.join(srcDir, e.name), path.join(outDir, e.name));
        }
      }
    }
  }
}
