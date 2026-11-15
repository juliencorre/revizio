import { expect, test, type Page } from "@playwright/test";

const password = "Famille-privee-2026!";
const spousePassword = "Conjoint-prive-2026!";
test.beforeEach(async ({ page }) => {
  expect((await page.request.post("/__test/reset")).ok()).toBe(true);
  // Exercise the private deployment UI; the disposable server alone enables demo for legacy tests.
  await page.route("**/api/health", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      json: { ...(await response.json()), demoAvailable: false },
    });
  });
});
async function noServerConfiguration(page: Page) {
  await expect(
    page.getByText("Configurer la connexion", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByTestId("auth-server")).toHaveCount(0);
  await expect(page.getByTestId("settings-server")).toHaveCount(0);
  await expect(
    page.getByText("Essayer la démonstration", { exact: true }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}

test("connexion automatique malgré une ancienne adresse, sans démonstration ni profils publics", async ({
  page,
  request,
}) => {
  expect(
    (
      await request.post("/api/setup", {
        data: {
          parentName: "Parent",
          email: "parent@example.test",
          password,
          children: [
            { name: "Camille", pin: "426813" },
            { name: "Milo", pin: "579246" },
          ],
        },
      })
    ).ok(),
  ).toBe(true);
  await page.addInitScript(() => {
    localStorage.setItem(
      "revizo.api-url",
      "https://adresse-invalide.example/api",
    );
    localStorage.setItem("revizo.mode", "demo");
    localStorage.setItem("revizo.demo-allowed", "1");
  });
  await page.goto("/");
  await expect(page.getByTestId("profile-child")).toHaveText(/Enfant/);
  await expect(page.getByText("Alex", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Camille", { exact: true })).toHaveCount(0);
  expect((await page.request.get("/api/profiles")).status()).toBe(401);
  await noServerConfiguration(page);
  await page.getByTestId("profile-child").click();
  await expect(page.getByTestId("auth-child-name")).toBeVisible();
  await page.getByTestId("auth-child-name").fill("Camille");
  await page.getByTestId("auth-pin").fill("426813");
  await page.getByTestId("auth-submit").click();
  await expect(page.getByTestId("student-home")).toBeVisible();
  expect((await page.request.get("/api/settings")).status()).toBe(403);
});

test("invitation privée, deux enfants et compte conjoint sans réglage technique", async ({
  page,
  browser,
  baseURL,
}, info) => {
  await page.route("**/api/health", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      json: {
        ...(await response.json()),
        demoAvailable: false,
        setupProtected: true,
      },
    });
  });
  await page.goto("/auth#invitation=invitation-test&cm1=Camille");
  await expect(page.getByTestId("auth-parent-name")).toBeVisible();
  await expect(page.getByTestId("auth-setup-code")).toHaveCount(0);
  expect(page.url()).not.toContain("invitation=");
  await expect(page.getByTestId("auth-child-name")).toHaveValue("Camille");
  await noServerConfiguration(page);
  await page.getByTestId("auth-parent-name").fill("Parent de test");
  await page.getByTestId("auth-email").fill("parent@example.test");
  await page.getByTestId("auth-password").fill(password);
  await page.getByTestId("auth-password-confirm").fill(password);
  await page.getByTestId("auth-pin").fill("426813");
  await page.getByTestId("auth-second-child-name").fill("Milo");
  await page.getByTestId("auth-second-pin").fill("579246");
  await page.screenshot({
    path: info.outputPath("invitation-famille.png"),
    fullPage: true,
  });
  await page.getByTestId("auth-submit").click();
  await expect(page.getByTestId("parent-dashboard")).toBeVisible();
  const profiles = (await (await page.request.get("/api/profiles")).json())
    .profiles;
  expect(profiles.map((p: { grade: string }) => p.grade)).toEqual([
    "CM1",
    "5e",
  ]);
  await page.goto("/parent/settings");
  await expect(
    page.getByText("Vos deux profils enfants sont prêts"),
  ).toBeVisible();
  await page.getByTestId("settings-spouse-name").fill("Conjoint de test");
  await page.getByTestId("settings-spouse-email").fill("conjoint@example.test");
  await page.getByTestId("settings-spouse-password").fill(spousePassword);
  await page.getByTestId("settings-spouse-confirm").fill(spousePassword);
  await page.getByTestId("settings-spouse-current-password").fill(password);
  await page.getByTestId("settings-spouse-save").click();
  await expect(page.getByTestId("settings-parents-feedback")).toContainText(
    "Le compte de votre conjoint est prêt",
  );
  await expect(page.getByTestId("settings-spouse-save")).toHaveCount(0);
  await noServerConfiguration(page);
  await page.screenshot({
    path: info.outputPath("famille-privee.png"),
    fullPage: true,
  });
  const context = await browser.newContext({
    baseURL,
    viewport: page.viewportSize(),
  });
  try {
    const spouse = await context.newPage();
    await spouse.goto("/auth?target=parent");
    await spouse.getByTestId("auth-email").fill("conjoint@example.test");
    await spouse.getByTestId("auth-password").fill(spousePassword);
    await spouse.getByTestId("auth-submit").click();
    await expect(spouse.getByTestId("parent-dashboard")).toBeVisible();
    expect(
      (await (await spouse.request.get("/api/profiles")).json()).profiles,
    ).toEqual(profiles);
  } finally {
    await context.close();
  }
});

test("panne de connexion : réessayer sans demander une adresse de serveur", async ({
  page,
}, info) => {
  await page.route("**/api/**", (route) => route.abort("failed"));
  await page.goto("/auth?target=parent");
  await expect(
    page.getByText(/connexion est momentanément indisponible/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Réessayer", exact: true }),
  ).toBeVisible();
  await noServerConfiguration(page);
  await page.screenshot({
    path: info.outputPath("connexion-indisponible.png"),
    fullPage: true,
  });
});
