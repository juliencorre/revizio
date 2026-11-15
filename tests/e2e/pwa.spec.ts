import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("revizo.mode", "demo"));
});

test("manifeste installable, guide et accès hors ligne en portrait et paysage", async ({
  page,
  context,
  browserName,
}, info) => {
  await page.goto("/");
  const card = page.getByTestId("pwa-install-card");
  await expect(card).toBeVisible();
  const manifestUrl = await page
    .locator('link[rel="manifest"]')
    .getAttribute("href");
  const response = await page.request.get(manifestUrl!);
  expect(response.ok()).toBe(true);
  expect(response.headers()["content-type"]).toContain(
    "application/manifest+json",
  );
  const manifest = await response.json();
  expect(manifest).toMatchObject({
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    lang: "fr",
    orientation: "any",
  });
  for (const icon of manifest.icons) {
    const response = await page.request.get(icon.src);
    expect(response.ok()).toBe(true);
    expect(response.headers()["content-type"]).toContain("image/png");
  }
  await expect(
    card.getByText("Interface disponible hors ligne", { exact: true }),
  ).toBeVisible({ timeout: 20_000 });
  if (browserName === "chromium") {
    const cdp = await context.newCDPSession(page);
    const result = await cdp.send("Page.getAppManifest");
    expect(result.errors).toEqual([]);
    expect(
      (await cdp.send("Page.getInstallabilityErrors")).installabilityErrors,
    ).toEqual([]);
    await cdp.detach();
  }
  const guide = card.getByTestId("pwa-guide");
  await guide.click();
  await expect(card.getByTestId("pwa-instructions")).toBeVisible();
  const bounds = await guide.boundingBox();
  expect(bounds!.height).toBeGreaterThanOrEqual(44);
  expect(bounds!.width).toBeGreaterThanOrEqual(44);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await card.screenshot({ path: info.outputPath("installation-revizo.png") });
  await guide.click();
  await expect(card.getByTestId("pwa-instructions")).toHaveCount(0);
});

for (const outcome of ["accepted", "dismissed", "error"] as const) {
  test(`installation : ${outcome}, invitation utilisée une seule fois`, async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByTestId("pwa-install-card")).toBeVisible();
    await page.evaluate((outcome) => {
      const event = new Event("beforeinstallprompt", { cancelable: true });
      let calls = 0;
      Object.assign(event, {
        prompt: async () => {
          if (++calls !== 1) throw new Error("Invitation réutilisée");
          if (outcome === "error") throw new Error("Installation impossible");
          return { outcome };
        },
      });
      window.dispatchEvent(event);
      if (!event.defaultPrevented) throw new Error("Invitation non capturée");
    }, outcome);
    const install = page.getByTestId("pwa-install");
    await expect(install).toBeVisible();
    await install.click();
    const feedback = page.getByTestId("pwa-install-feedback");
    await expect(feedback).toHaveText(
      outcome === "accepted"
        ? /Installation demandée/
        : outcome === "dismissed"
          ? /plus tard/
          : /n’a pas abouti/,
    );
    await expect(install).toHaveCount(0);
    if (outcome === "accepted") {
      // Browser acceptance alone must not be reported as a completed installation.
      await expect(page.getByTestId("pwa-install-card")).toBeVisible();
      await page.evaluate(() =>
        window.dispatchEvent(new Event("appinstalled")),
      );
      await expect(page.getByTestId("pwa-install-card")).toHaveCount(0);
    }
  });
}

test("guide Safari sur iPad avec une identité de Mac", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "userAgent", {
      get: () =>
        "Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15",
    });
    Object.defineProperty(navigator, "platform", { get: () => "MacIntel" });
    Object.defineProperty(navigator, "maxTouchPoints", { get: () => 5 });
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Installer sur mon iPad ou iPhone" })
    .click();
  const instructions = page.getByTestId("pwa-instructions");
  await expect(instructions).toContainText("Safari");
  await expect(instructions).toContainText("Partager");
  await expect(instructions).toContainText("Sur l’écran d’accueil");
  await expect(instructions).toContainText("Ouvrir comme app web");
});

test("application déjà ouverte en mode autonome : état visible dans Famille", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "standalone", { get: () => true });
  });
  await page.goto("/");
  await expect(page.getByTestId("profile-parent")).toBeVisible();
  await expect(page.getByTestId("pwa-install-card")).toHaveCount(0);
  await page.goto("/parent/settings");
  const card = page.getByTestId("pwa-install-card");
  await expect(card).toContainText("Révizo est ouverte comme une app");
  await expect(card.getByTestId("pwa-install")).toHaveCount(0);
  await expect(card.getByTestId("pwa-guide")).toHaveCount(0);
});

test("contexte non sécurisé : explication sans fausse promesse d’installation", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "isSecureContext", { get: () => false });
  });
  await page.goto("/");
  const card = page.getByTestId("pwa-install-card");
  await expect(card).toContainText("Ouvrez l’adresse HTTPS de Révizo");
  await expect(card.getByTestId("pwa-guide")).toHaveCount(0);
  await expect(card.getByText("Interface disponible hors ligne")).toHaveCount(
    0,
  );
});

test("échec du cache hors ligne : l’application reste utilisable", async ({
  page,
}) => {
  await page.addInitScript(() => {
    if ("serviceWorker" in navigator)
      Object.defineProperty(navigator.serviceWorker, "register", {
        value: async () => {
          throw new Error("Stockage indisponible");
        },
      });
  });
  await page.goto("/");
  await expect(page.getByTestId("pwa-install-card")).toContainText(
    "Accès hors ligne non préparé",
  );
  await page.getByTestId("profile-child").click();
  await expect(page.getByTestId("student-home")).toBeVisible();
});

test("mise à jour en attente : notification sans activation ni rechargement forcés", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("pwa-install-card")).toContainText(
    "Interface disponible hors ligne",
    { timeout: 20_000 },
  );
  const originalWorker = await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    return navigator.serviceWorker.controller!.scriptURL;
  });
  await page.getByTestId("pwa-guide").click();
  await page.evaluate(async () => {
    // A different script URL triggers a real update of the same root registration.
    // Its contents remain the exported worker served by the disposable backend.
    await navigator.serviceWorker.register("/sw.js?pwa-update-test=1", {
      scope: "/",
      updateViaCache: "none",
    });
  });
  await expect(page.getByTestId("pwa-update")).toContainText(
    "Une mise à jour est prête",
    { timeout: 20_000 },
  );
  await expect(page.getByTestId("pwa-instructions")).toBeVisible();
  const workers = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    return {
      active: navigator.serviceWorker.controller!.scriptURL,
      waiting: registration?.waiting?.scriptURL,
    };
  });
  expect(workers.active).toBe(originalWorker);
  expect(workers.waiting).toContain("pwa-update-test=1");
});
