import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import {
  AnthropicClient,
  anthropicDefaults,
  ANTHROPIC_URL,
} from "../../server/anthropic";
import { createApp } from "../../server/app";
import { FamilyDatabase } from "../../server/database";

const key = "test-only-private-anthropic-key";
const settings = anthropicDefaults();
const schema = {
  type: "object",
  properties: { text: { type: "string" } },
  required: ["text"],
  additionalProperties: false,
};
const messages = [{ role: "user" as const, content: "Prépare une fiche." }];
function completion(value: unknown, stop_reason = "end_turn") {
  return Response.json({
    stop_reason,
    content: [{ type: "text", text: JSON.stringify(value) }],
  });
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("API Anthropic", () => {
  it("transmet le système, les images PNG et un schéma compatible sans modifier les contraintes d’origine", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(completion({ text: "Le cours" }));
    vi.stubGlobal("fetch", fetchMock);
    const bounded = {
      ...schema,
      properties: {
        questions: {
          type: "array",
          minItems: 5,
          maxItems: 5,
          items: {
            type: "object",
            properties: { index: { type: "integer", minimum: 0, maximum: 3 } },
            required: ["index"],
            additionalProperties: false,
          },
        },
      },
    };
    const original = structuredClone(bounded);
    const result = await new AnthropicClient(key).json(
      { ...settings, baseUrl: "https://untrusted.example" },
      [
        { role: "system", content: "Instructions parent" },
        { role: "user", content: "Transcris", images: ["image-png-base64"] },
      ],
      bounded,
    );
    expect(result).toEqual({ text: "Le cours" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${ANTHROPIC_URL}/v1/messages`);
    expect(init.redirect).toBe("error");
    expect(init.headers.Authorization).toBe(`Bearer ${key}`);
    expect(init.headers["anthropic-version"]).toBe("2026-10-21");
    const body = JSON.parse(init.body);
    expect(body.system).toBe("Instructions parent");
    expect(body.messages).toEqual([
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/png",
              data: "image-png-base64",
            },
          },
          { type: "text", text: "Transcris" },
        ],
      },
    ]);
    expect(body.output_config.format.type).toBe("json_schema");
    const questions = body.output_config.format.schema.properties.questions;
    expect(questions.minItems).toBeUndefined();
    expect(questions.maxItems).toBeUndefined();
    expect(questions.description).toContain("minItems=5");
    expect(questions.items.properties.index.minimum).toBeUndefined();
    expect(questions.items.properties.index.description).toContain("maximum=3");
    expect(bounded).toEqual(original);
    expect(init.body).not.toContain(key);
  });

  it("vérifie l’accès au modèle sans générer de contenu", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ id: settings.model }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await new AnthropicClient(key).available(settings)).toBe(true);
    expect(fetchMock.mock.calls[0][0]).toBe(
      `${ANTHROPIC_URL}/v1/models/${settings.model}`,
    );
    expect(fetchMock.mock.calls[0][1].body).toBeUndefined();
  });

  it("signale une clé manquante et ne contacte aucun fournisseur de secours", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const client = new AnthropicClient(" ");
    expect(await client.available(settings)).toBe(false);
    await expect(client.json(settings, messages, schema)).rejects.toThrow(
      "ANTHROPIC_API_KEY",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [401, "clé API"],
    [403, "autorisations"],
    [402, "crédit"],
    [404, "ANTHROPIC_MODEL"],
    [429, "limite"],
    [529, "529"],
  ])(
    "explique l’erreur HTTP %i sans recopier les données du fournisseur",
    async (status, expected) => {
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValue(
            new Response(`Données privées ${key}`, { status }),
          ),
      );
      const client = new AnthropicClient(key);
      await expect(client.json(settings, messages, schema)).rejects.toThrow(
        expected,
      );
      await expect(client.json(settings, messages, schema)).rejects.not.toThrow(
        key,
      );
      expect(await client.available(settings)).toBe(false);
    },
  );

  it.each(["max_tokens", "refusal", "tool_use", "pause_turn"])(
    "refuse un résultat arrêté pour %s même si son JSON paraît valide",
    async (reason) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(completion({ text: "partiel" }, reason)),
      );
      await expect(
        new AnthropicClient(key).json(settings, messages, schema),
      ).rejects.toThrow("JSON complet");
    },
  );

  it("refuse une réponse vide ou un JSON malformé", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ stop_reason: "end_turn", content: [] }),
      )
      .mockResolvedValueOnce(
        Response.json({
          stop_reason: "end_turn",
          content: [{ type: "text", text: "{incomplet" }],
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    for (let index = 0; index < 2; index++)
      await expect(
        new AnthropicClient(key).json(settings, messages, schema),
      ).rejects.toThrow("JSON complet");
  });

  it("conserve l’annulation et ne fait pas fuiter une erreur réseau", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error(`réseau ${key}`)),
    );
    const client = new AnthropicClient(key);
    await expect(client.json(settings, messages, schema)).rejects.toThrow(
      "indisponible",
    );
    expect(await client.available(settings)).toBe(false);
    await expect(
      client.json(settings, messages, schema, AbortSignal.abort()),
    ).rejects.toThrow("interrompue");
  });
});

describe("serveur configuré avec Anthropic", () => {
  it("utilise la configuration serveur pour une famille existante, ses jobs et ses réglages sans exposer la clé", async () => {
    vi.stubEnv("AI_PROVIDER", "ollama");
    const root = await mkdtemp(join(tmpdir(), "revizo-anthropic-"));
    let app: FastifyInstance | undefined;
    const sourceText =
      "Un nombre relatif est positif, négatif ou nul. Pour additionner deux nombres de même signe, on additionne les distances à zéro et on garde le signe.";
    try {
      app = await createApp({
        dataDir: root,
        staticDir: join(root, "absent"),
        rateLimit: false,
      });
      const setup = await app.inject({
        method: "POST",
        url: "/api/setup",
        payload: {
          parentName: "Parent",
          email: "parent@example.test",
          password: "Famille-test-42!",
          childName: "Camille",
          grade: "5e",
          pin: "4268",
        },
      });
      expect(setup.statusCode).toBe(200);
      const { token, profiles, user } = setup.json();
      const headers = { authorization: `Bearer ${token}` };
      await app.close();
      app = undefined;
      const db = new FamilyDatabase(root);
      db.saveSettings(user.familyId, {
        baseUrl: "http://old-ollama.invalid",
        model: "old-local-model",
      });
      db.close();
      const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
        if (!init.body) return Response.json({ id: "claude-test" });
        const request = JSON.parse(String(init.body));
        expect(request.model).toBe("claude-test");
        return completion({
          title: "Nombres relatifs",
          description: "Fiche à relire",
          sections: [
            {
              kind: "essential",
              title: "L’essentiel",
              content: sourceText,
              example: "",
              sourceRefs: [
                { sourceId: "texte-saisi", page: 1, excerpt: sourceText },
              ],
            },
          ],
        });
      });
      vi.stubGlobal("fetch", fetchMock);
      app = await createApp({
        dataDir: root,
        staticDir: join(root, "absent"),
        rateLimit: false,
        aiProvider: "anthropic",
        anthropicApiKey: key,
        anthropicModel: "claude-test",
      });
      const health = (await app.inject("/api/health")).json();
      expect(health.ai).toMatchObject({
        model: "claude-test",
        available: true,
      });
      const configured = (
        await app.inject({ url: "/api/settings", headers })
      ).json();
      expect(configured).toMatchObject({
        provider: "anthropic",
        baseUrl: ANTHROPIC_URL,
        model: "claude-test",
      });
      const patch = await app.inject({
        method: "PATCH",
        url: "/api/settings",
        headers,
        payload: {
          baseUrl: "https://untrusted.example",
          model: "untrusted-model",
          apiKey: "client-key",
        },
      });
      expect(patch.json()).toEqual(configured);
      const created = await app.inject({
        method: "POST",
        url: "/api/ai/course",
        headers,
        payload: {
          profileId: profiles[0].id,
          title: "Nombres relatifs",
          subjectId: "maths",
          sourceIds: [],
          sourceText,
        },
      });
      expect(created.statusCode, created.body).toBe(200);
      const id = created.json().job.id;
      await expect
        .poll(
          async () =>
            (await app!.inject({ url: `/api/jobs/${id}`, headers })).json().job
              .status,
        )
        .toBe("succeeded");
      const job = (await app.inject({ url: `/api/jobs/${id}`, headers })).json()
        .job;
      expect(job.result.course.status).toBe("draft");
      expect(job.result.course.sections[0].content).toBe(sourceText);
      expect(
        (await app.inject({ url: "/api/data", headers })).json().data.courses,
      ).toHaveLength(0);
      const backup = await app.inject({ url: "/api/backup", headers });
      for (const response of [
        JSON.stringify(health),
        JSON.stringify(configured),
        patch.body,
        JSON.stringify(job),
        backup.body,
      ])
        expect(response).not.toContain(key);
      expect(
        fetchMock.mock.calls.every(([url]) =>
          url.startsWith(ANTHROPIC_URL + "/"),
        ),
      ).toBe(true);
    } finally {
      await app?.close();
      await rm(root, { recursive: true, force: true });
    }
  });
});
