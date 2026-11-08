import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

let output: string;
const script = fileURLToPath(
  new URL("../../scripts/prepare-pwa.mjs", import.meta.url),
);
beforeEach(async () => {
  output = await mkdtemp(join(tmpdir(), "revizio-shell-"));
  for (const directory of ["assets", "api", "uploads"])
    await mkdir(join(output, directory));
  await Promise.all([
    writeFile(
      join(output, "index.html"),
      '<!doctype html><html lang="fr"><head></head><body>Révizo</body></html>',
    ),
    writeFile(join(output, "assets/app.js"), "console.log('Révizo')"),
    writeFile(join(output, "api/private.json"), "private"),
    writeFile(join(output, "uploads/photo.png"), "private"),
    writeFile(join(output, "assets/app.js.map"), "{}"),
  ]);
});
afterEach(async () => {
  await rm(output, { recursive: true, force: true });
});
const build = () =>
  execFileSync(process.execPath, [script, output], { encoding: "utf8" });

describe("shell PWA privé par construction", () => {
  it("génère un manifeste iPad, les icônes et un cache stable versionné par le contenu", async () => {
    build();
    const manifest = JSON.parse(
      await readFile(join(output, "manifest.webmanifest"), "utf8"),
    );
    expect(manifest.display).toBe("standalone");
    expect(manifest.lang).toBe("fr");
    expect(manifest.icons.map((icon: { sizes: string }) => icon.sizes)).toEqual(
      ["192x192", "512x512"],
    );
    const html = await readFile(join(output, "index.html"), "utf8");
    expect(html).toContain('rel="apple-touch-icon"');
    expect(html).toContain("/manifest.webmanifest");
    const first = await readFile(join(output, "sw.js"), "utf8");
    build();
    expect(await readFile(join(output, "sw.js"), "utf8")).toBe(first);
    expect(
      (await readFile(join(output, "index.html"), "utf8")).match(
        /rel="manifest"/g,
      ),
    ).toHaveLength(1);
    await writeFile(
      join(output, "assets/app.js"),
      "console.log('nouvelle version')",
    );
    build();
    expect(await readFile(join(output, "sw.js"), "utf8")).not.toBe(first);
  });
  it("recharge le shell hors ligne et laisse API, documents, mutations et authentification au réseau", async () => {
    build();
    const listeners = new Map<string, (event: any) => void>();
    const addAll = vi.fn(async (_paths: string[]) => undefined),
      fetchMock = vi.fn(async () => {
        throw new Error("offline");
      });
    const cacheMatch = vi.fn(async (path: string) =>
      path === "/index.html"
        ? new Response("cached shell")
        : path === "/assets/app.js"
          ? new Response("cached script")
          : undefined,
    );
    runInNewContext(await readFile(join(output, "sw.js"), "utf8"), {
      self: {
        location: { origin: "https://revizio.test" },
        clients: { claim: async () => undefined },
        addEventListener: (name: string, listener: (event: any) => void) =>
          listeners.set(name, listener),
      },
      caches: {
        open: async () => ({ addAll }),
        match: cacheMatch,
        keys: async () => [],
        delete: async () => true,
      },
      URL,
      Response,
      fetch: fetchMock,
    });
    let installing: Promise<unknown> | undefined;
    listeners.get("install")!({
      waitUntil: (promise: Promise<unknown>) => {
        installing = promise;
      },
    });
    await installing;
    const files = addAll.mock.calls[0][0] as string[];
    expect(files).toContain("/index.html");
    expect(files).toContain("/assets/app.js");
    expect(files.some((path) => /\/api\/|\/uploads\/|\.map$/.test(path))).toBe(
      false,
    );
    function dispatch(
      path: string,
      mode = "cors",
      method = "GET",
      headers = new Headers(),
    ) {
      let result: Promise<Response> | undefined;
      listeners.get("fetch")!({
        request: {
          url: new URL(path, "https://revizio.test").href,
          mode,
          method,
          headers,
        },
        respondWith: (promise: Promise<Response>) => {
          result = promise;
        },
      });
      return result;
    }
    expect(
      await (await dispatch("/enfant/mes-cours", "navigate"))!.text(),
    ).toBe("cached shell");
    expect(await (await dispatch("/assets/app.js"))!.text()).toBe(
      "cached script",
    );
    for (const path of [
      "/api/data",
      "/api/uploads/file-id",
      "/api",
      "/uploads/photo.png",
      "https://other.test/assets/app.js",
      "/private-document.json",
    ])
      expect(dispatch(path)).toBeUndefined();
    expect(dispatch("/api/data", "navigate")).toBeUndefined();
    expect(dispatch("/assets/app.js", "cors", "POST")).toBeUndefined();
    expect(
      dispatch(
        "/assets/app.js",
        "cors",
        "GET",
        new Headers({ Authorization: "Bearer test" }),
      ),
    ).toBeUndefined();
  });
});
