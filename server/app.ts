import { existsSync } from "node:fs";
import { resolve, join } from "node:path";
import staticPlugin from "@fastify/static";
import { FamilyDatabase } from "./database";
import { OllamaClient, extractUpload } from "./ai";
import { JobQueue } from "./jobs";
import { nodeImages } from "./images-node";
import { configureServerRoutes } from "./app-core";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import { fastifyRoutes } from "./http";
import type { ServerOptions } from "./types";
export async function createApp(options: ServerOptions = {}) {
  const database = new FamilyDatabase(
    resolve(options.dataDir ?? process.env.REVIZIO_DATA_DIR ?? ".revizio"),
  );
  const ai = options.aiClient ?? new OllamaClient();
  const queue = new JobQueue(database, ai, { extractUpload });
  const app = Fastify({
    logger: options.logger ?? false,
    bodyLimit: 8 * 1024 * 1024,
    requestTimeout: 120000,
    trustProxy: false,
  });
  await app.register(cookie);
  await app.register(multipart, {
    limits: { fileSize: 25 * 1024 * 1024, files: 1, fields: 4, parts: 5 },
  });
  if (options.rateLimit !== false)
    await app.register(rateLimit, { max: 300, timeWindow: "1 minute" });
  await configureServerRoutes(
    fastifyRoutes(app),
    {
      database,
      ai,
      queue,
      images: nodeImages,
      aiDefaults: {
        baseUrl: (
          options.ollamaUrl ??
          process.env.OLLAMA_BASE_URL ??
          "http://127.0.0.1:11434"
        ).replace(/\/$/, ""),
        model:
          options.ollamaModel ?? process.env.OLLAMA_MODEL ?? "ministral-3:8b",
      },
    },
    options,
  );

  const staticDir = resolve(options.staticDir ?? "dist");
  if (existsSync(join(staticDir, "index.html"))) {
    await app.register(staticPlugin, {
      root: staticDir,
      prefix: "/",
      wildcard: false,
    });
    app.setNotFoundHandler((request, reply) => {
      if (
        request.url.startsWith("/api/") ||
        /\.[a-z0-9]+(?:\?|$)/i.test(request.url)
      )
        return reply
          .code(404)
          .send({ error: "Cette ressource est introuvable." });
      return reply.sendFile("index.html");
    });
  }
  await app.ready();
  return app;
}
