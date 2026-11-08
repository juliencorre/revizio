// A disposable real backend for browser tests. Never imported by the production server.
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createApp } from "../server/app";
async function main() {
  const root = await mkdtemp(join(tmpdir(), "revizio-playwright-"));
  let dataDir = join(root, "family");
  const make = () =>
    createApp({ dataDir, staticDir: resolve("dist"), rateLimit: false });
  let app = await make();
  await app.ready();
  let resetting: Promise<void> | null = null;
  const server = createServer(async (request, response) => {
    if (request.url === "/__test/reset" && request.method === "POST") {
      if (!resetting)
        resetting = (async () => {
          await app.close();
          await rm(dataDir, { recursive: true, force: true });
          app = await make();
          await app.ready();
        })().finally(() => {
          resetting = null;
        });
      await resetting;
      response.writeHead(200, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      response.end('{"ok":true}');
      return;
    }
    if (resetting) await resetting;
    app.routing(request, response);
  });
  server.listen(4183, "127.0.0.1", () =>
    console.log("Révizo browser tests: http://127.0.0.1:4183"),
  );
  for (const signal of ["SIGTERM", "SIGINT"] as const)
    process.once(signal, () => {
      server.close(() => {
        void app
          .close()
          .then(() => rm(root, { recursive: true, force: true }))
          .then(() => process.exit(0));
      });
    });
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
