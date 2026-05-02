import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const host = process.env.REPO_HOST ?? "127.0.0.1";
const port = Number.parseInt(process.env.REPO_PORT ?? "27182", 10);
const repoDir = path.join(__dirname, "repo");
const repoUrl = process.env.REPO_URL ?? `http://${host}:${port}`;

function contentType(filePath) {
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  if (filePath.endsWith(".asar")) return "application/octet-stream";
  return "text/plain; charset=utf-8";
}

function ensureRepo() {
  const repoJsonPath = path.join(repoDir, "repo.json");
  if (fs.existsSync(repoJsonPath)) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      REPO_URL: repoUrl
    };

    const child = spawn(process.execPath, ["repo.mjs"], {
      cwd: __dirname,
      env,
      stdio: "inherit"
    });

    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`repo.mjs exited with code ${code ?? -1}`));
    });
    child.on("error", reject);
  });
}

function send(res, statusCode, body, headers = {}) {
  res.writeHead(statusCode, headers);
  res.end(body);
}

await ensureRepo();

const server = http.createServer((req, res) => {
  const reqUrl = new URL(req.url ?? "/", `http://${host}:${port}`);
  let reqPath = decodeURIComponent(reqUrl.pathname);

  if (reqPath === "/") reqPath = "/repo.json";
  const resolvedPath = path.resolve(repoDir, "." + reqPath);

  if (!resolvedPath.startsWith(repoDir + path.sep) && resolvedPath !== path.join(repoDir, "repo.json")) {
    send(res, 403, "Forbidden");
    return;
  }

  if (!fs.existsSync(resolvedPath) || fs.statSync(resolvedPath).isDirectory()) {
    send(res, 404, "Not found");
    return;
  }

  res.writeHead(200, {
    "Content-Type": contentType(resolvedPath),
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-cache"
  });

  fs.createReadStream(resolvedPath).pipe(res);
});

server.listen(port, host, () => {
  console.log(`Moonlight local repo available at ${repoUrl}/repo.json`);
});
