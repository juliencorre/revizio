import { Buffer } from "node:buffer";
import { randomUUID, createHash } from "node:crypto";
import type {
  ApiHandler,
  ApiReply,
  ApiRequest,
  ApiRouteOptions,
  ApiRoutes,
} from "../server/http";
import { HttpError } from "../server/types";

class CloudReply implements ApiReply {
  headers = new Headers();
  status = 200;
  sent = false;
  payload: unknown;
  header(name: string, value: string) {
    this.headers.set(name, value);
    return this;
  }
  code(status: number) {
    this.status = status;
    return this;
  }
  type(value: string) {
    return this.header("Content-Type", value);
  }
  send(value?: unknown) {
    this.payload = value;
    this.sent = true;
    return this;
  }
  setCookie(
    name: string,
    value: string,
    options: Parameters<ApiReply["setCookie"]>[2],
  ) {
    const parts = [
      `${encodeURIComponent(name)}=${encodeURIComponent(value)}`,
      `Path=${options.path ?? "/"}`,
    ];
    if (options.maxAge !== undefined)
      parts.push(`Max-Age=${Math.floor(options.maxAge)}`);
    if (options.httpOnly) parts.push("HttpOnly");
    if (options.secure) parts.push("Secure");
    if (options.sameSite === "strict") parts.push("SameSite=Strict");
    this.headers.append("Set-Cookie", parts.join("; "));
    return this;
  }
  clearCookie(name: string, options: { path?: string }) {
    return this.setCookie(name, "", {
      ...options,
      maxAge: 0,
      httpOnly: true,
      secure: true,
      sameSite: "strict",
    });
  }
}
type Route = {
  method: string;
  parts: string[];
  handler: ApiHandler;
  options: ApiRouteOptions;
};

/** Small native-Request adapter: no dynamic code generation and no Node HTTP server. */
export class CloudHttp implements ApiRoutes {
  private routes: Route[] = [];
  private before: ApiHandler[] = [];
  private after: Array<
    (request: ApiRequest, reply: ApiReply, payload: unknown) => Promise<unknown>
  > = [];
  private onError?: (
    error: Error,
    request: ApiRequest,
    reply: ApiReply,
  ) => unknown;
  log = {
    error: (details: object, message: string) =>
      console.error(message, details),
  };
  constructor(private storage: DurableObjectStorage) {
    storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS rate_limits (bucket TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL); CREATE INDEX IF NOT EXISTS rate_limits_expiry ON rate_limits(expires)",
    );
  }
  private add(
    method: string,
    path: string,
    handler: ApiHandler,
    options: ApiRouteOptions = {},
  ) {
    this.routes.push({ method, parts: path.split("/"), handler, options });
  }
  get(path: string, handler: ApiHandler) {
    this.add("GET", path, handler);
  }
  put(path: string, handler: ApiHandler) {
    this.add("PUT", path, handler);
  }
  patch(path: string, handler: ApiHandler) {
    this.add("PATCH", path, handler);
  }
  delete(path: string, handler: ApiHandler) {
    this.add("DELETE", path, handler);
  }
  post(
    path: string,
    options: ApiRouteOptions | ApiHandler,
    handler?: ApiHandler,
  ) {
    if (typeof options === "function") this.add("POST", path, options);
    else this.add("POST", path, handler!, options);
  }
  onRequest(handler: ApiHandler) {
    this.before.push(handler);
  }
  onSend(
    handler: <T>(
      request: ApiRequest,
      reply: ApiReply,
      payload: T,
    ) => Promise<T>,
  ) {
    this.after.push(handler);
  }
  onClose(_handler: () => Promise<void>) {
    /* DO lifecycle owns storage and alarm work. */
  }
  setErrorHandler(
    handler: (error: Error, request: ApiRequest, reply: ApiReply) => unknown,
  ) {
    this.onError = handler;
  }
  private rateLimit(ip: string, name: string, max: number) {
    const now = Date.now(),
      minute = Math.floor(now / 60000);
    const bucket = createHash("sha256")
      .update(`${ip}:${name}:${minute}`)
      .digest("hex");
    this.storage.sql.exec("DELETE FROM rate_limits WHERE expires<?", now);
    const { count } = this.storage.sql
      .exec<{ count: number }>(
        "INSERT INTO rate_limits VALUES (?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1 RETURNING count",
        bucket,
        (minute + 1) * 60000,
      )
      .one();
    if (count > max)
      throw new HttpError(
        429,
        "Trop de tentatives. Patientez un instant avant de réessayer.",
      );
  }
  async handle(native: Request): Promise<Response> {
    const url = new URL(native.url),
      parts = url.pathname.split("/");
    const method = native.method === "HEAD" ? "GET" : native.method;
    const route = this.routes.find(
      (candidate) =>
        candidate.method === method &&
        candidate.parts.length === parts.length &&
        candidate.parts.every(
          (part, index) => part.startsWith(":") || part === parts[index],
        ),
    );
    const reply = new CloudReply();
    const headers = Object.fromEntries(native.headers);
    headers.host = url.host;
    const cookies = Object.fromEntries(
      (native.headers.get("cookie") ?? "").split(";").flatMap((part) => {
        const equal = part.indexOf("=");
        if (equal < 0) return [];
        try {
          return [
            [
              decodeURIComponent(part.slice(0, equal).trim()),
              decodeURIComponent(part.slice(equal + 1)),
            ],
          ];
        } catch {
          return [];
        }
      }),
    );
    let form: Promise<FormData> | undefined;
    let bounded = native;
    const request: ApiRequest = {
      method: native.method,
      url: url.pathname + url.search,
      protocol: url.protocol.slice(0, -1),
      id: randomUUID(),
      headers,
      cookies,
      params: {},
      query: Object.fromEntries(url.searchParams),
      body: undefined,
      async file() {
        form ??= bounded.formData();
        let data: FormData;
        try {
          data = await form;
        } catch (error) {
          if (error instanceof HttpError) throw error;
          throw new HttpError(
            400,
            "Le transfert du document est invalide. Choisissez à nouveau le fichier.",
          );
        }
        const entries = [...data.values()];
        const files = entries.filter(
          (entry): entry is File => typeof entry !== "string",
        );
        if (files.length > 1 || entries.length > 5)
          throw new HttpError(400, "Importez un seul document à la fois.");
        const file = files[0];
        if (!file) return undefined;
        if (file.size > 25 * 1024 * 1024)
          throw new HttpError(
            413,
            "Chaque document doit peser au maximum 25 Mo.",
          );
        return {
          filename: file.name,
          mimetype: file.type,
          toBuffer: async () => Buffer.from(await file.arrayBuffer()),
        };
      },
    };
    try {
      const maxBody = route?.options.bodyLimit ?? 8 * 1024 * 1024;
      const multipart = native.headers
        .get("content-type")
        ?.startsWith("multipart/form-data");
      const bodyLimit = multipart ? 26 * 1024 * 1024 : maxBody;
      if (Number(native.headers.get("content-length")) > bodyLimit)
        throw new HttpError(
          413,
          "Ces données sont trop volumineuses pour l’installation cloud.",
        );
      if (native.body) {
        let received = 0;
        const limiter = new TransformStream<Uint8Array, Uint8Array>({
          transform(chunk, controller) {
            received += chunk.byteLength;
            if (received > bodyLimit)
              throw new HttpError(
                413,
                "Ces données sont trop volumineuses pour l’installation cloud.",
              );
            controller.enqueue(chunk);
          },
        });
        bounded = new Request(native, {
          body: native.body.pipeThrough(limiter),
        });
      }
      for (const hook of this.before) {
        await hook(request, reply);
        if (reply.sent) break;
      }
      if (!reply.sent) {
        this.rateLimit(
          native.headers.get("cf-connecting-ip") ?? "local",
          "global",
          300,
        );
        if (!route)
          throw new HttpError(404, "Cette ressource est introuvable.");
        if (route.options.config?.rateLimit)
          this.rateLimit(
            native.headers.get("cf-connecting-ip") ?? "local",
            url.pathname,
            route.options.config.rateLimit.max,
          );
        request.params = Object.fromEntries(
          route.parts.flatMap((part, index) =>
            part.startsWith(":")
              ? [[part.slice(1), decodeURIComponent(parts[index])]]
              : [],
          ),
        );
        if (native.body && !multipart) {
          const bytes = await bounded.arrayBuffer();
          if (bytes.byteLength > maxBody)
            throw new HttpError(
              413,
              "Ces données sont trop volumineuses pour l’installation cloud.",
            );
          try {
            request.body = JSON.parse(new TextDecoder().decode(bytes));
          } catch {
            throw new HttpError(
              400,
              "Les données envoyées ne sont pas valides.",
            );
          }
        }
        const value = await route.handler(request, reply);
        if (!reply.sent) reply.send(value);
      }
    } catch (caught) {
      const error =
        caught instanceof Error ? caught : new Error(String(caught));
      if (this.onError) this.onError(error, request, reply);
      else
        reply
          .code(500)
          .send({ error: "Le serveur n’a pas pu terminer cette action." });
    }
    for (const hook of this.after)
      reply.payload = await hook(request, reply, reply.payload);
    const empty =
      native.method === "HEAD" || reply.status === 204 || reply.status === 304;
    if (empty)
      return new Response(null, {
        status: reply.status,
        headers: reply.headers,
      });
    const value = reply.payload;
    let body: BodyInit;
    if (value instanceof Uint8Array) body = Uint8Array.from(value);
    else if (typeof value === "string") {
      body = value;
      if (!reply.headers.has("Content-Type"))
        reply.type("text/plain; charset=utf-8");
    } else {
      body = JSON.stringify(value ?? null);
      if (!reply.headers.has("Content-Type"))
        reply.type("application/json; charset=utf-8");
    }
    return new Response(body, { status: reply.status, headers: reply.headers });
  }
}
