import { createHash } from "node:crypto";
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(process.argv[2] ?? join(root, "dist"));
await mkdir(join(output, "pwa"), { recursive: true });
for (const file of [
  "manifest.webmanifest",
  "pwa/icon-192.png",
  "pwa/icon-512.png",
  "pwa/apple-touch-icon.png",
])
  await copyFile(join(root, "public", file), join(output, file));
const indexPath = join(output, "index.html");
let html = await readFile(indexPath, "utf8");
const tags = [
  '<link rel="manifest" href="/manifest.webmanifest" />',
  '<link rel="apple-touch-icon" sizes="180x180" href="/pwa/apple-touch-icon.png" />',
  '<meta name="apple-mobile-web-app-capable" content="yes" />',
  '<meta name="apple-mobile-web-app-title" content="Révizo" />',
  '<meta name="apple-mobile-web-app-status-bar-style" content="default" />',
].filter((tag) => !html.includes(tag));
if (tags.length) html = html.replace("</head>", tags.join("\n") + "\n</head>");
await writeFile(indexPath, html);

async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) =>
      entry.isDirectory()
        ? files(join(directory, entry.name))
        : [join(directory, entry.name)],
    ),
  );
  return nested.flat();
}
const paths = (await files(output))
  .map((file) => "/" + relative(output, file).split("\\").join("/"))
  .filter(
    (path) =>
      path !== "/sw.js" &&
      !path.endsWith(".map") &&
      !path.startsWith("/api/") &&
      !path.startsWith("/uploads/") &&
      !path.startsWith("/metadata.json"),
  )
  .sort();
const hash = createHash("sha256");
for (const path of paths) {
  hash.update(path);
  hash.update(await readFile(join(output, path)));
}
const version = hash.digest("hex").slice(0, 16);
const worker = `/* Révizo: generated static shell only; no API or private document caching. */
const CACHE = "revizio-shell-${version}";
const FILES = ${JSON.stringify(paths)};
const ALLOWED = new Set(FILES);
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(Promise.all([
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("revizio-shell-") && key !== CACHE).map((key) => caches.delete(key)))),
    self.clients.claim(),
  ]));
});
self.addEventListener("fetch", (event) => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || request.headers.has("Authorization") || url.pathname === "/api" || url.pathname.startsWith("/api/") || url.pathname.startsWith("/uploads/")) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).then(async (response) => response.status >= 500 ? (await caches.match("/index.html")) ?? response : response).catch(async () => (await caches.match("/index.html")) ?? Response.error()));
  } else if (ALLOWED.has(url.pathname)) {
    event.respondWith(caches.match(url.pathname).then((cached) => cached ?? fetch(request)));
  }
});
`;
await writeFile(join(output, "sw.js"), worker);
console.log(
  `PWA Révizo : ${paths.length} fichiers statiques, version ${version}. API et documents privés exclus.`,
);
