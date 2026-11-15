import type { FastifyInstance } from "fastify";

/** The HTTP surface used by the shared routes; implemented by Fastify and Workers. */
export interface ApiRequest {
  method: string;
  url: string;
  protocol: string;
  id: string;
  headers: {
    host?: string;
    origin?: string;
    authorization?: string;
    [key: string]: string | string[] | undefined;
  };
  cookies: Record<string, string | undefined>;
  body: unknown;
  params: unknown;
  query: unknown;
  file(): Promise<
    | { filename: string; mimetype: string; toBuffer(): Promise<Buffer> }
    | undefined
  >;
}
export interface ApiReply {
  header(name: string, value: string): ApiReply;
  code(status: number): ApiReply;
  type(value: string): ApiReply;
  send(value?: unknown): unknown;
  setCookie(
    name: string,
    value: string,
    options: {
      httpOnly?: boolean;
      sameSite?: "strict";
      secure?: boolean;
      path?: string;
      maxAge?: number;
    },
  ): ApiReply;
  clearCookie(name: string, options: { path?: string }): ApiReply;
}
export type ApiHandler = (
  request: ApiRequest,
  reply: ApiReply,
) => unknown | Promise<unknown>;
export type ApiRouteOptions = {
  bodyLimit?: number;
  config?: { rateLimit?: { max: number; timeWindow: string } };
};
export interface ApiRoutes {
  get(path: string, handler: ApiHandler): void;
  post(path: string, handler: ApiHandler): void;
  post(path: string, options: ApiRouteOptions, handler: ApiHandler): void;
  put(path: string, handler: ApiHandler): void;
  patch(path: string, handler: ApiHandler): void;
  delete(path: string, handler: ApiHandler): void;
  onRequest(handler: ApiHandler): void;
  onSend(
    handler: <T>(
      request: ApiRequest,
      reply: ApiReply,
      payload: T,
    ) => Promise<T>,
  ): void;
  onClose(handler: () => Promise<void>): void;
  setErrorHandler(
    handler: (error: Error, request: ApiRequest, reply: ApiReply) => unknown,
  ): void;
  log: { error(details: object, message: string): void };
}
export function fastifyRoutes(app: FastifyInstance): ApiRoutes {
  const route = (
    method: "get" | "put" | "patch" | "delete",
    path: string,
    handler: ApiHandler,
  ) => {
    app[method](path, async (request, reply) => handler(request, reply));
  };
  return {
    get: (path, handler) => route("get", path, handler),
    put: (path, handler) => route("put", path, handler),
    patch: (path, handler) => route("patch", path, handler),
    delete: (path, handler) => route("delete", path, handler),
    post(
      path: string,
      options: ApiRouteOptions | ApiHandler,
      handler?: ApiHandler,
    ) {
      if (typeof options === "function")
        app.post(path, async (request, reply) => options(request, reply));
      else
        app.post(path, options, async (request, reply) =>
          handler!(request, reply),
        );
    },
    onRequest: (handler) => {
      app.addHook("onRequest", async (request, reply) =>
        handler(request, reply),
      );
    },
    onSend: (handler) => {
      app.addHook("onSend", async (request, reply, payload) =>
        handler(request, reply, payload),
      );
    },
    onClose: (handler) => {
      app.addHook("onClose", async () => handler());
    },
    setErrorHandler: (handler) => {
      app.setErrorHandler((error, request, reply) =>
        handler(
          error instanceof Error ? error : new Error(String(error)),
          request,
          reply,
        ),
      );
    },
    log: { error: (details, message) => app.log.error(details, message) },
  };
}
