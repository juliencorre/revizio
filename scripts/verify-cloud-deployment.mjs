import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const origin = new URL(process.argv[2] ?? "https://cours.gofel.fr");
if (!["http:", "https:"].includes(origin.protocol))
  throw new Error("L’adresse de vérification doit utiliser HTTP ou HTTPS.");
const output = resolve(root, "dist");
const expectedWorker = await readFile(resolve(output, "sw.js"));
const paths = JSON.parse(
  expectedWorker.toString().match(/const FILES = (\[[^\n]+\]);/)?.[1] ?? "null",
);
if (!Array.isArray(paths) || !paths.includes("/index.html"))
  throw new Error("L’export PWA local est absent ou incomplet.");
const digest = (body) => createHash("sha256").update(body).digest("hex");
// Cloudflare JavaScript Detections adds a dynamic protection script to HTML.
// Compare the exported HTML after removing only this identified CDN addition.
function comparableBody(path, body) {
  if (!path.endsWith(".html")) return body;
  return Buffer.from(
    body
      .toString()
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, (script) =>
        script.includes("window.__CF$cv$params") &&
        script.includes("/cdn-cgi/challenge-platform/")
          ? ""
          : script,
      ),
  );
}

const headers = {
  "User-Agent": "Mozilla/5.0 (compatible; RevizoDeploymentCheck/1.0)",
  "Cache-Control": "no-cache",
};
async function fetchBody(path) {
  const url = new URL(path, origin);
  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`${path} : HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}
async function verify() {
  const health = JSON.parse((await fetchBody("/api/health")).toString());
  if (
    health.deployment !== "cloudflare" ||
    typeof health.needsSetup !== "boolean" ||
    health.setupProtected !== true ||
    typeof health.version !== "string"
  )
    throw new Error("L’API ne confirme pas son bon fonctionnement.");
  const actualWorker = await fetchBody("/sw.js");
  if (digest(actualWorker) !== digest(expectedWorker))
    throw new Error(
      "La version PWA publiée ne correspond pas à l’export local.",
    );
  const remaining = [...paths];
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      while (remaining.length) {
        const path = remaining.shift();
        if (
          typeof path !== "string" ||
          !path.startsWith("/") ||
          path.includes("..")
        )
          throw new Error("Chemin de fichier PWA invalide.");
        const local = await readFile(resolve(output, "." + path));
        const remote = await fetchBody(path);
        if (
          digest(comparableBody(path, local)) !==
          digest(comparableBody(path, remote))
        )
          throw new Error(
            `${path} : le contenu publié diffère de l’export vérifié.`,
          );
      }
    }),
  );
  console.log(
    `Révizo vérifié sur ${origin.origin} : API disponible, version PWA et ${paths.length} fichiers conformes à l’export local.`,
  );
}
let lastError;
for (let attempt = 0; attempt < 4; attempt++) {
  try {
    await verify();
    process.exit(0);
  } catch (error) {
    lastError = error;
    console.error(`Vérification ${attempt + 1}/4 : ${error.message}`);
    if (attempt < 3) await new Promise((accept) => setTimeout(accept, 3000));
  }
}
throw lastError;
