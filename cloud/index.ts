import { DurableObject } from "cloudflare:workers";
import { configureServerRoutes } from "../server/app-core";
import { CloudHttp } from "./http";
import { FamilyDatabase } from "../server/database";
import { JobQueue } from "../server/jobs";
import { CloudAi, cloudAiDefaults, cloudExtractor } from "./ai";
import { cloudImages } from "./images";
import { SqliteFiles, sqlDatabase } from "./storage";
import type { AiClient } from "../server/types";
import { AnthropicClient, anthropicDefaults } from "../server/anthropic";

export class FamilyServer extends DurableObject<Env> {
  private database: FamilyDatabase;
  private queue: JobQueue;
  private app: CloudHttp;
  private ready: Promise<void>;
  constructor(ctx: DurableObjectState, env: Env, aiClient?: AiClient) {
    super(ctx, env);
    // One coordination unit for this deployment's family, including profiles and sessions.
    const files = new SqliteFiles(ctx.storage);
    this.database = new FamilyDatabase("/famille", {
      db: sqlDatabase(ctx.storage),
      files,
      transaction: (fn) => ctx.storage.transactionSync(fn),
    });
    const provider = env.AI_PROVIDER ?? "workers-ai";
    if (provider !== "anthropic" && provider !== "workers-ai")
      throw new Error(
        "AI_PROVIDER doit être anthropic ou workers-ai sur Cloudflare.",
      );
    const defaults =
      provider === "anthropic"
        ? anthropicDefaults(env.ANTHROPIC_MODEL)
        : cloudAiDefaults;
    const ai =
      aiClient ??
      (provider === "anthropic"
        ? new AnthropicClient(env.ANTHROPIC_API_KEY)
        : new CloudAi(env.AI));
    this.queue = new JobQueue(this.database, ai, {
      extractUpload: cloudExtractor(files),
      alarmDriven: true,
      settings: defaults,
    });
    this.app = new CloudHttp(ctx.storage);
    this.ready = ctx.blockConcurrencyWhile(() =>
      configureServerRoutes(
        this.app,
        {
          database: this.database,
          ai,
          queue: this.queue,
          images: cloudImages,
          aiDefaults: defaults,
          aiProvider: provider,
          deployment: "cloudflare",
          setupToken: env.SETUP_TOKEN,
          backupLimitBytes: 12 * 1024 * 1024,
          backupBodyLimitBytes: 18 * 1024 * 1024,
        },
        { secureCookies: true },
      ),
    );
  }
  private pending() {
    return this.database
      .jobs()
      .some((job) => job.status === "queued" || job.status === "running");
  }
  async handle(request: Request): Promise<Response> {
    await this.ready;
    const response = await this.app.handle(request);
    // An alarm, persisted before responding, owns background work through client disconnects.
    if (this.pending() && (await this.ctx.storage.getAlarm()) === null)
      await this.ctx.storage.setAlarm(Date.now() + 100);
    return response;
  }

  async alarm(): Promise<void> {
    await this.ready;
    // If this isolate is evicted during AI I/O, construction requeues the interrupted job.
    await this.ctx.storage.setAlarm(Date.now() + 12 * 60 * 1000);
    await this.queue.runOne();
    if (this.pending()) await this.ctx.storage.setAlarm(Date.now() + 100);
    else await this.ctx.storage.deleteAlarm();
  }
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api" || url.pathname.startsWith("/api/"))
      return env.FAMILIES.getByName(env.FAMILY_ID, {
        locationHint: "weur",
      }).handle(request);
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
