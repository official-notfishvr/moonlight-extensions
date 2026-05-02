import asar from "@electron/asar";
import fs from "fs";
import path from "path";

const repoDir = path.resolve("./repo");
const repoUrl = process.env.REPO_URL ?? "http://127.0.0.1:27182";
const distDir = path.resolve("./dist");

fs.mkdirSync(repoDir, { recursive: true });

function sanitizeManifest(manifest, extension) {
  const sanitized = structuredClone(manifest);

  delete sanitized.$schema;

  sanitized.meta ??= {};
  sanitized.meta.source = `${repoUrl}/repo.json#${extension}`;

  function scrubGithubUrls(value) {
    if (typeof value === "string") {
      return value
        .replace(/\[([^\]]+)\]\(https:\/\/github\.com\/[^)]+\)/g, "$1")
        .replace(/https:\/\/github\.com\/\S+/g, `${repoUrl}/repo.json`);
    }

    if (Array.isArray(value)) {
      return value.map(scrubGithubUrls);
    }

    if (value && typeof value === "object") {
      for (const key of Object.keys(value)) {
        value[key] = scrubGithubUrls(value[key]);
      }
    }

    return value;
  }

  scrubGithubUrls(sanitized);
  sanitized.download = `${repoUrl}/${extension}.asar`;
  return sanitized;
}

const extensions = fs
  .readdirSync(distDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort((a, b) => a.localeCompare(b));

const repo = [];
for (const extension of extensions) {
  await asar.createPackage(path.join(distDir, extension), path.join(repoDir, `${extension}.asar`));

  const manifest = JSON.parse(fs.readFileSync(path.join(distDir, extension, "manifest.json"), "utf-8"));
  repo.push(sanitizeManifest(manifest, extension));
}

fs.writeFileSync(path.join(repoDir, "repo.json"), JSON.stringify(repo, null, 2));
