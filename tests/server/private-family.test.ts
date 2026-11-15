import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { createApp } from "../../server/app";

let app: FastifyInstance;
let dir: string;
const password = "Parent-prive-test-42!";
const spousePassword = "Conjoint-prive-test-42!";
const setupInput = {
  parentName: "Parent",
  email: "parent@example.test",
  password,
  children: [
    { name: "Camille", pin: "426813" },
    { name: "Milo", pin: "579246" },
  ],
};
const bearer = (token: string) => ({ authorization: "Bearer " + token });
async function setup() {
  const response = await app.inject({
    method: "POST",
    url: "/api/setup",
    payload: setupInput,
  });
  expect(response.statusCode, response.body).toBe(200);
  return response.json() as {
    token: string;
    user: { familyId: string };
    profiles: { id: string; grade: string }[];
  };
}
const spouseInput = {
  name: "Conjoint",
  email: "conjoint@example.test",
  password: spousePassword,
  currentPassword: password,
};
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "revizo-private-family-"));
  app = await createApp({
    dataDir: dir,
    staticDir: join(dir, "no-static"),
    rateLimit: false,
    aiClient: { available: async () => false, json: async () => ({}) },
  });
});
afterEach(async () => {
  await app.close();
  await rm(dir, { recursive: true, force: true });
});

describe("foyer privé", () => {
  it("crée les deux enfants CM1/5e, masque les profils avant connexion et ferme la démonstration", async () => {
    const session = await setup();
    expect(session.profiles.map((p) => p.grade)).toEqual(["CM1", "5e"]);
    expect((await app.inject("/api/health")).json()).toMatchObject({
      demoAvailable: false,
      familyLimits: { parents: 2, children: 2 },
    });
    for (const url of [
      "/api/profiles",
      "/api/parents",
      "/api/data",
      "/api/backup",
    ])
      expect((await app.inject(url)).statusCode, url).toBe(401);
    const profiles = await app.inject({
      url: "/api/profiles",
      headers: bearer(session.token),
    });
    expect(profiles.json().profiles).toHaveLength(2);
    expect(profiles.body).not.toContain("pinHash");
    const denied = await app.inject({
      method: "POST",
      url: "/api/profiles",
      headers: bearer(session.token),
      payload: { name: "Troisième", pin: "123456", grade: "6e" },
    });
    expect(denied.statusCode).toBe(409);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/setup",
          payload: setupInput,
        })
      ).statusCode,
    ).toBe(409);
  });
  it("autorise le conjoint uniquement après authentification et confirmation du parent, puis bloque un troisième parent", async () => {
    const session = await setup();
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/parents",
          payload: spouseInput,
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/parents",
          headers: bearer(session.token),
          payload: { ...spouseInput, currentPassword: "incorrect" },
        })
      ).statusCode,
    ).toBe(401);
    const created = await app.inject({
      method: "POST",
      url: "/api/parents",
      headers: bearer(session.token),
      payload: spouseInput,
    });
    expect(created.statusCode, created.body).toBe(200);
    expect(created.json().parent).not.toHaveProperty("passwordHash");
    const login = await app.inject({
      method: "POST",
      url: "/api/login",
      payload: { email: spouseInput.email, password: spousePassword },
    });
    expect(login.statusCode, login.body).toBe(200);
    expect(login.json().user.familyId).toBe(session.user.familyId);
    expect(login.json().profiles).toEqual(session.profiles);
    expect(
      (
        await app.inject({
          url: "/api/parents",
          headers: bearer(login.json().token),
        })
      ).json().parents,
    ).toHaveLength(2);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/parents",
          headers: bearer(session.token),
          payload: { ...spouseInput, email: "tiers@example.test" },
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await app.inject({
          method: "PATCH",
          url: "/api/account",
          headers: bearer(session.token),
          payload: { email: spouseInput.email, currentPassword: password },
        })
      ).statusCode,
    ).toBe(409);
    const bytes = await readFile(join(dir, "family.sqlite"));
    expect(bytes.includes(Buffer.from(spousePassword))).toBe(false);
  });
  it("connecte un enfant par prénom et code sans dévoiler les données des autres ni ouvrir les actions parent", async () => {
    const session = await setup();
    for (const [childName, pin] of [
      ["Camille", "000000"],
      ["Inconnu", "426813"],
    ])
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/api/child-login",
            payload: { childName, pin },
          })
        ).statusCode,
      ).toBe(401);
    const login = await app.inject({
      method: "POST",
      url: "/api/child-login",
      payload: { childName: "  cAMILLE  ", pin: "426813" },
    });
    expect(login.statusCode, login.body).toBe(200);
    const headers = bearer(login.json().token);
    expect((await app.inject({ url: "/api/data", headers })).statusCode).toBe(
      200,
    );
    expect(
      (
        await app.inject({
          url: "/api/data?profileId=" + session.profiles[1].id,
          headers,
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (await app.inject({ url: "/api/parents", headers })).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/parents",
          headers,
          payload: spouseInput,
        })
      ).statusCode,
    ).toBe(403);
  });
  it("refuse une sauvegarde avec trois enfants et conserve les données en place", async () => {
    const session = await setup();
    const headers = bearer(session.token);
    const backup = (await app.inject({ url: "/api/backup", headers })).json();
    backup.profiles.push({
      ...backup.profiles[1],
      id: "third",
      name: "Troisième",
    });
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/backup/restore",
          headers,
          payload: { backup },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (await app.inject({ url: "/api/profiles", headers }))
        .json()
        .profiles.map((p: { id: string }) => p.id),
    ).toEqual(session.profiles.map((p) => p.id));
  });
  it("refuse les prénoms de connexion identiques sans créer une famille partielle", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/setup",
      payload: {
        ...setupInput,
        children: [
          { name: "Camille", pin: "123456" },
          { name: " CAMILLE ", pin: "654321" },
        ],
      },
    });
    expect(response.statusCode).toBe(400);
    expect((await app.inject("/api/health")).json().needsSetup).toBe(true);
  });
  it("restaure deux prénoms échangés en conservant les identifiants et les codes de chaque enfant", async () => {
    const session = await setup();
    const headers = bearer(session.token);
    const backup = (await app.inject({ url: "/api/backup", headers })).json();
    backup.profiles[0].name = "Milo";
    backup.profiles[1].name = "Camille";
    const response = await app.inject({
      method: "POST",
      url: "/api/backup/restore",
      headers,
      payload: { backup },
    });
    expect(response.statusCode, response.body).toBe(200);
    const login = await app.inject({
      method: "POST",
      url: "/api/child-login",
      payload: { childName: "Milo", pin: "426813" },
    });
    expect(login.statusCode).toBe(200);
    expect(login.json().user.profileId).toBe(session.profiles[0].id);
  });
  it("protège aussi l’installation locale lorsqu’un code est configuré", async () => {
    await app.close();
    app = await createApp({
      dataDir: dir,
      setupToken: "installation-test",
      rateLimit: false,
      aiClient: { available: async () => false, json: async () => ({}) },
    });
    expect((await app.inject("/api/health")).json().setupProtected).toBe(true);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/setup",
          payload: setupInput,
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/setup",
          payload: { ...setupInput, setupCode: "installation-test" },
        })
      ).statusCode,
    ).toBe(200);
  });
});
