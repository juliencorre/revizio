import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { createApp } from "./app";
async function main() {
  if (existsSync(".env")) process.loadEnvFile(".env");
  const app = await createApp({
    dataDir: process.env.REVIZIO_DATA_DIR,
    staticDir: process.env.REVIZIO_STATIC_DIR ?? resolve("dist"),
    logger: true,
  });
  const host = process.env.HOST ?? "127.0.0.1";
  const port = Number(process.env.PORT ?? 4173);
  await app.listen({ host, port });
  console.log(
    `Révizo : http://${host}:${port} — données privées dans ${resolve(process.env.REVIZIO_DATA_DIR ?? ".revizio")}`,
  );
  for (const signal of ["SIGINT", "SIGTERM"] as const)
    process.once(signal, () => {
      void app.close().then(() => process.exit(0));
    });
}
void main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Démarrage impossible.",
  );
  process.exitCode = 1;
});
