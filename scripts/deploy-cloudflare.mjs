import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const credentialPath = resolve(root, ".cloudflare/installation-code");
await mkdir(dirname(credentialPath), { recursive: true, mode: 0o700 });
let code;
try {
  code = (await readFile(credentialPath, "utf8")).trim();
} catch (error) {
  if (error.code !== "ENOENT") throw error;
  code = randomBytes(24).toString("hex");
  await writeFile(credentialPath, code + "\n", { mode: 0o600, flag: "wx" });
}
if (!/^[a-f0-9]{48}$/.test(code))
  throw new Error("Le fichier du code d’installation est invalide.");
const cli = resolve(root, "node_modules/wrangler/bin/wrangler.js");
async function run(args, input) {
  await new Promise((accept, reject) => {
    const child = spawn(process.execPath, [cli, ...args], {
      cwd: root,
      // The hosted web app calls its API on the same HTTPS origin.
      env: { ...process.env, EXPO_PUBLIC_API_URL: "" },
      stdio: [input === undefined ? "inherit" : "pipe", "inherit", "inherit"],
    });
    child.once("error", reject);
    child.once("exit", (status) =>
      status === 0
        ? accept()
        : reject(new Error(`Wrangler s’est arrêté (${status}).`)),
    );
    if (input !== undefined) child.stdin.end(input);
  });
}
// Without its secret the cloud API refuses setup, including during this first deployment.
await run(["deploy", "--config", "wrangler.jsonc"]);
await run(
  ["secret", "put", "SETUP_TOKEN", "--config", "wrangler.jsonc"],
  code + "\n",
);
console.log(
  `Code d’installation conservé dans ${credentialPath}. Ouvrez l’adresse HTTPS, choisissez Parent et créez votre espace avec ce code.`,
);
