import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
const { version } = JSON.parse(await readFile("package.json", "utf8"));
const output = "releases";
await mkdir(output, { recursive: true });
const name = `revizio-${version}-serveur.tar.gz`;
execFileSync("tar", [
  "-czf",
  join(output, name),
  "dist",
  "dist-server",
  "package.json",
  "package-lock.json",
  ".env.example",
  "README.md",
  "LICENSE",
  "docs/backend.md",
  "docs/ipad-offline.md",
  "docs/validation.md",
  "docs/installation-release.md",
]);
const bytes = await readFile(join(output, name));
await writeFile(
  join(output, "SHA256SUMS"),
  createHash("sha256").update(bytes).digest("hex") + "  " + name + "\n",
);
console.log(join(output, name));
