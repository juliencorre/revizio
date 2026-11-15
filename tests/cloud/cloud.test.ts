import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createTestHarness, type TestHarness } from "wrangler";
import { resolve, join } from "node:path";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { PNG } from "pngjs";
import { initialData } from "../../src/domain/fixtures";
import { clone } from "../../src/domain/learning";
import type { AiJob, CourseSource, LearningData } from "../../src/domain/model";
import { cloudImages } from "../../cloud/images";
import { CloudAi, CLOUD_MODEL } from "../../cloud/ai";

function textPdf(pages: string[]): Buffer {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pages.map((_, index) => `${4 + index * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  for (const [index, text] of pages.entries()) {
    const content = `BT /F1 10 Tf 50 760 Td (${text}) Tj ET`;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + index * 2} 0 R >>`,
      `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
    );
  }
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf +=
    `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
    offsets
      .slice(1)
      .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
      .join("");
  return Buffer.from(
    pdf +
      `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`,
  );
}

type SessionSnapshot = { token: string; profiles: { id: string }[] };
const code = "installation-cloud-test";
let server: TestHarness;
let root: string;
afterEach(({ task }) => {
  if (task.result?.state === "fail") server?.debug();
});
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "revizo-cloud-tests-"));
  const configPath = join(root, "wrangler.json");
  await writeFile(
    configPath,
    JSON.stringify({
      name: "revizo-test",
      main: resolve("tests/cloud/fixtures/worker.ts"),
      compatibility_date: "2026-11-15",
      durable_objects: {
        bindings: [{ name: "FAMILIES", class_name: "FamilyServer" }],
      },
      migrations: [{ tag: "v1", new_sqlite_classes: ["FamilyServer"] }],
      vars: { FAMILY_ID: "cloud-test" },
    }),
  );
  server = createTestHarness({
    root,
    workers: [{ configPath, secrets: { SETUP_TOKEN: code } }],
  });
  await server.listen();
}, 60000);
afterAll(async () => {
  await server?.close();
  if (root) await rm(root, { recursive: true, force: true });
}, 30000);

describe("installation Cloudflare dans workerd", () => {
  it("conserve comptes, brouillons privés, publication, sauvegardes et jobs après éviction", async () => {
    const origin = "https://revizo.example.test";
    const request = (
      path: string,
      method = "GET",
      payload?: unknown,
      token?: string,
    ) =>
      server.fetch(origin + path, {
        method,
        headers: {
          origin,
          ...(payload === undefined
            ? {}
            : { "Content-Type": "application/json" }),
          ...(token ? { Authorization: "Bearer " + token } : {}),
        },
        body: payload === undefined ? undefined : JSON.stringify(payload),
      });
    expect(
      (
        (await (await request("/api/health")).json()) as {
          setupProtected: boolean;
        }
      ).setupProtected,
    ).toBe(true);
    const setup = {
      parentName: "Parent de test",
      email: "cloud@example.test",
      password: "Cloudflare-test-42!",
      childName: "Camille",
      grade: "5e",
      pin: "4268",
    };
    expect((await request("/api/setup", "POST", setup)).status).toBe(403);
    const created = await request("/api/setup", "POST", {
      ...setup,
      setupCode: code,
    });
    expect(created.status, await created.clone().text()).toBe(200);
    expect(created.headers.get("set-cookie")).toMatch(/Secure/);
    expect(created.headers.get("set-cookie")).toMatch(/HttpOnly/);
    const parent = (await created.json()) as SessionSnapshot;
    const profileId = parent.profiles[0].id;
    const health = await (await request("/api/health")).json();
    expect(health).toMatchObject({
      demoAvailable: false,
      familyLimits: { parents: 2, children: 2 },
    });
    expect((await request("/api/profiles")).status).toBe(401);
    expect((await request("/api/parents")).status).toBe(401);
    const spouse = {
      name: "Conjoint de test",
      email: "conjoint-cloud@example.test",
      password: "Conjoint-test-42!",
      currentPassword: setup.password,
    };
    expect((await request("/api/parents", "POST", spouse)).status).toBe(401);
    expect(
      (await request("/api/parents", "POST", spouse, parent.token)).status,
    ).toBe(200);
    expect(
      (
        await request(
          "/api/parents",
          "POST",
          { ...spouse, email: "tiers@example.test" },
          parent.token,
        )
      ).status,
    ).toBe(409);
    const spouseLogin = await request("/api/login", "POST", {
      email: spouse.email,
      password: spouse.password,
    });
    expect(spouseLogin.status).toBe(200);
    expect(((await spouseLogin.json()) as SessionSnapshot).profiles).toEqual(
      parent.profiles,
    );
    expect(
      (
        await request(
          "/api/profiles",
          "POST",
          { name: "Milo", grade: "CM1", pin: "579246" },
          parent.token,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await request(
          "/api/profiles",
          "POST",
          { name: "Autre", grade: "CM2", pin: "123456" },
          parent.token,
        )
      ).status,
    ).toBe(409);
    expect(
      (await request("/api/setup", "POST", { ...setup, setupCode: code }))
        .status,
    ).toBe(409);
    const child = (await (
      await request("/api/child-login", "POST", {
        childName: "Camille",
        pin: "4268",
      })
    ).json()) as SessionSnapshot;
    expect(
      (await request("/api/parents", "POST", spouse, child.token)).status,
    ).toBe(403);
    const png = new PNG({ width: 60, height: 90 });
    png.data.fill(255);
    const boundary = "revizo-cloud-boundary";
    const multipart = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="cours.png"\r\nContent-Type: image/png\r\n\r\n`,
      ),
      PNG.sync.write(png),
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const imported = await server.fetch(
      origin + "/api/uploads?profileId=" + profileId,
      {
        method: "POST",
        headers: {
          origin,
          Authorization: "Bearer " + parent.token,
          "Content-Type": "multipart/form-data; boundary=" + boundary,
        },
        body: multipart,
      },
    );
    expect(imported.status, await imported.clone().text()).toBe(200);
    const source = (await imported.json()) as CourseSource;
    expect(
      (await request(source.uri!, "GET", undefined, child.token)).status,
    ).toBe(404);
    const rotated = await request(
      "/api/uploads/" + source.id,
      "PATCH",
      { rotation: 90 },
      parent.token,
    );
    expect(rotated.status, await rotated.clone().text()).toBe(200);
    const image = await request(source.uri!, "GET", undefined, parent.token);
    const normalized = PNG.sync.read(Buffer.from(await image.arrayBuffer()));
    expect([normalized.width, normalized.height]).toEqual([90, 60]);
    const data = clone(initialData);
    data.series = [];
    data.attempts = [];
    data.plans = [];
    data.courses[0].sources = [source];
    data.courses[0].status = "draft";
    expect(
      (
        await request(
          "/api/data",
          "PUT",
          { profileId, data, revision: 0 },
          parent.token,
        )
      ).status,
    ).toBe(200);
    expect(
      (await request(source.uri!, "GET", undefined, child.token)).status,
    ).toBe(404);
    data.courses[0].status = "published";
    expect(
      (
        await request(
          "/api/data",
          "PUT",
          { profileId, data, revision: 1 },
          parent.token,
        )
      ).status,
    ).toBe(200);
    expect(
      (await request(source.uri!, "GET", undefined, child.token)).status,
    ).toBe(200);
    expect(
      (
        await request(
          "/api/data",
          "PUT",
          { profileId, data, revision: 1 },
          parent.token,
        )
      ).status,
    ).toBe(409);
    const denied = await server.fetch(origin + "/api/login", {
      method: "POST",
      headers: {
        origin: "https://unknown.example.test",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(setup),
    });
    expect(denied.status).toBe(403);
    const backupResponse = await request(
      "/api/backup",
      "GET",
      undefined,
      parent.token,
    );
    expect(backupResponse.headers.get("cache-control")).toBe("no-store");
    const backup = (await backupResponse.json()) as { uploads: unknown[] };
    expect(backup.uploads).toHaveLength(1);
    expect(
      (await request("/api/backup/restore", "POST", { backup }, parent.token))
        .status,
    ).toBe(200);
    expect(
      (await request("/api/session", "GET", undefined, child.token)).status,
    ).toBe(401);
    const jobResponse = await request(
      "/api/ai/course",
      "POST",
      {
        profileId,
        subjectId: "maths",
        title: "Les nombres",
        sourceIds: [source.id],
      },
      parent.token,
    );
    expect(jobResponse.status, await jobResponse.clone().text()).toBe(200);
    const { job } = (await jobResponse.json()) as { job: AiJob };
    await server
      .getWorker()
      .evictDurableObject("FamilyServer", { name: "cloud-test" });
    const loggedIn = await request("/api/login", "POST", {
      email: setup.email,
      password: setup.password,
    });
    expect(loggedIn.status).toBe(200);
    const finished = await vi.waitFor(
      async () => {
        const response = await request(
          "/api/jobs/" + job.id,
          "GET",
          undefined,
          parent.token,
        );
        const current = ((await response.json()) as { job: AiJob }).job;
        expect(["succeeded", "failed"]).toContain(current.status);
        return current;
      },
      { timeout: 20000, interval: 250 },
    );
    expect(finished.error).toBeUndefined();
    expect(finished).toMatchObject({
      status: "succeeded",
      result: { course: { status: "draft" } },
    });
    expect(
      (await request(source.uri!, "GET", undefined, parent.token)).status,
    ).toBe(200);
    const current = (await (
      await request("/api/data", "GET", undefined, parent.token)
    ).json()) as { data: LearningData };
    expect(current.data.courses).toHaveLength(data.courses.length);
    expect(
      current.data.courses.some(
        (course: { generationJobId?: string }) =>
          course.generationJobId === job.id,
      ),
    ).toBe(false);
    const pdfBytes = textPdf([
      "Un nombre relatif est positif, negatif ou nul. On conserve son signe dans les calculs du cours.",
      "Une temperature negative est inferieure a zero. La temperature positive est superieure a zero.",
    ]);
    const pdfForm = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="cours.pdf"\r\nContent-Type: application/pdf\r\n\r\n`,
      ),
      pdfBytes,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const pdfUpload = await server.fetch(
      origin + "/api/uploads?profileId=" + profileId,
      {
        method: "POST",
        headers: {
          origin,
          Authorization: "Bearer " + parent.token,
          "Content-Type": "multipart/form-data; boundary=" + boundary,
        },
        body: pdfForm,
      },
    );
    expect(pdfUpload.status).toBe(200);
    const pdfSource = (await pdfUpload.json()) as CourseSource;
    const pdfJob = (await (
      await request(
        "/api/ai/course",
        "POST",
        {
          profileId,
          subjectId: "maths",
          title: "Le PDF",
          sourceIds: [pdfSource.id],
        },
        parent.token,
      )
    ).json()) as { job: AiJob };
    const extracted = await vi.waitFor(
      async () => {
        const response = await request(
          "/api/jobs/" + pdfJob.job.id,
          "GET",
          undefined,
          parent.token,
        );
        const job = ((await response.json()) as { job: AiJob }).job;
        expect(["succeeded", "failed"]).toContain(job.status);
        return job;
      },
      { timeout: 20000, interval: 250 },
    );
    expect(extracted.error).toBeUndefined();
    expect(
      extracted.result?.course?.sources?.map((source) => source.page),
    ).toEqual([1, 2]);
  }, 60000);
  it("refuse les fichiers invalides avant de les transformer et applique les rotations", async () => {
    await expect(
      cloudImages.normalize(Buffer.from("not an image")),
    ).rejects.toThrow();
    const png = new PNG({ width: 2, height: 1 });
    png.data.set([255, 0, 0, 255, 0, 0, 255, 255]);
    const image = PNG.sync.read(
      await cloudImages.normalize(PNG.sync.write(png), 90),
    );
    expect([image.width, image.height]).toEqual([1, 2]);
    expect([...image.data]).toEqual([255, 0, 0, 255, 0, 0, 255, 255]);
  });
  it("lit le contrat structuré du modèle Cloudflare et refuse un résultat tronqué", async () => {
    const client = new CloudAi({
      run: async (model, input, options) => {
        expect(model).toBe(CLOUD_MODEL);
        expect(input.response_format).toMatchObject({ type: "json_schema" });
        expect(options?.signal).toBeDefined();
        return {
          id: "test",
          object: "chat.completion",
          created: 0,
          model,
          choices: [
            {
              index: 0,
              logprobs: null,
              finish_reason: "stop",
              message: {
                role: "assistant",
                refusal: null,
                content: '{"result":5}',
              },
            },
          ],
        };
      },
    });
    await expect(
      client.json(
        { baseUrl: "", model: "" },
        [{ role: "user", content: "2+3" }],
        { type: "object" },
      ),
    ).resolves.toEqual({ result: 5 });
    const truncated = new CloudAi({
      run: async () => ({
        id: "test",
        object: "chat.completion",
        created: 0,
        model: CLOUD_MODEL,
        choices: [
          {
            index: 0,
            logprobs: null,
            finish_reason: "length",
            message: {
              role: "assistant",
              refusal: null,
              content: '{"result":',
            },
          },
        ],
      }),
    });
    await expect(
      truncated.json({ baseUrl: "", model: "" }, [], {}),
    ).rejects.toThrow(/résultat exploitable/);
  });
  it("évite le décodage contraint bloquant des exercices et transmet leur schéma au modèle", async () => {
    const schema = {
      type: "object",
      properties: { questions: { type: "array", minItems: 5, maxItems: 5 } },
    };
    const client = new CloudAi({
      run: async (model, input) => {
        expect(input.response_format).toEqual({ type: "json_object" });
        expect(input.messages[0]).toMatchObject({
          role: "system",
          content: expect.stringContaining(JSON.stringify(schema)),
        });
        return {
          id: "test",
          object: "chat.completion",
          created: 0,
          model,
          choices: [
            {
              index: 0,
              logprobs: null,
              finish_reason: "stop",
              message: {
                role: "assistant",
                refusal: null,
                content: '{"questions":[]}',
              },
            },
          ],
        };
      },
    });
    await expect(
      client.json(
        { baseUrl: "", model: "" },
        [{ role: "user", content: "Prépare les exercices." }],
        schema,
      ),
    ).resolves.toEqual({ questions: [] });
  });
});
