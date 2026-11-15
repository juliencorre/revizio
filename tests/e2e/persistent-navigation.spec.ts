import { expect, test, type Page, type ElementHandle } from "@playwright/test";

// Control route-chunk latency without the installed PWA cache serving it first.
test.use({ serviceWorkers: "block" });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("revizo.mode", "demo"));
});
async function menu(page: Page) {
  return page.getByRole("navigation", { name: "Navigation principale" });
}
async function remainsMounted(
  element: ElementHandle<HTMLElement | SVGElement>,
) {
  expect(await element.evaluate((node) => node.isConnected)).toBe(true);
}

test("garder le menu élève monté et immobile entre les rubriques et les matières", async ({
  page,
}, testInfo) => {
  const errors: string[] = [],
    documents: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (request.resourceType() === "document") documents.push(request.url());
  });
  await page.goto("/student");
  await expect(page.getByTestId("student-home")).toBeVisible();
  const navigation = await menu(page);
  const original = (await navigation.elementHandle())!;
  const home = navigation.getByRole("button", {
    name: "Aujourd’hui",
    exact: true,
  });
  const initialPosition = await home.boundingBox();
  const initialDocuments = documents.length;
  await navigation
    .getByRole("button", { name: "Mes matières", exact: true })
    .click();
  await expect(page).toHaveURL(/\/student\/subjects$/);
  await remainsMounted(original);
  await page.getByTestId("subject-card-maths").click();
  await expect(page).toHaveURL(/\/student\/subject\/maths$/);
  await remainsMounted(original);
  expect(await home.boundingBox()).toEqual(initialPosition);
  await navigation
    .getByRole("button", { name: "Mes exercices", exact: true })
    .click();
  await expect(page).toHaveURL(/\/student\/exercises$/);
  await remainsMounted(original);
  expect(await home.boundingBox()).toEqual(initialPosition);
  await page.goBack();
  await expect(page).toHaveURL(/\/student\/subject\/maths$/);
  await remainsMounted(original);
  await page.goForward();
  await expect(page).toHaveURL(/\/student\/exercises$/);
  await remainsMounted(original);
  expect(documents).toHaveLength(initialDocuments);
  expect(errors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("menu-eleve.png") });
});

test("garder le menu parent pendant le passage d’une matière à ses rubriques", async ({
  page,
}, testInfo) => {
  await page.goto("/parent");
  await expect(page.getByTestId("parent-dashboard")).toBeVisible();
  const navigation = await menu(page);
  const original = (await navigation.elementHandle())!;
  const home = navigation.getByRole("button", { name: "Accueil", exact: true });
  const position = await home.boundingBox();
  await navigation
    .getByRole("button", { name: "Matières", exact: true })
    .click();
  await page.getByRole("button", { name: "Anglais", exact: true }).click();
  await remainsMounted(original);
  await page.getByRole("button", { name: "Vocabulaire", exact: true }).click();
  await expect(page.getByTestId("parent-vocabulary")).toBeVisible();
  await expect(page.getByTestId("parent-subject-banner")).toContainText(
    "Anglais",
  );
  await remainsMounted(original);
  expect(await home.boundingBox()).toEqual(position);
  await navigation.getByRole("button", { name: "Suivi", exact: true }).click();
  await expect(page).toHaveURL(/\/parent\/progress$/);
  await remainsMounted(original);
  await expect(
    navigation.getByRole("button", { name: "Suivi", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await page.screenshot({ path: testInfo.outputPath("menu-parent.png") });
});

test("réduire et étendre le rail sans perdre son choix en changeant de page", async ({
  page,
}, testInfo) => {
  await page.goto("/student");
  await expect(page.getByTestId("student-home")).toBeVisible();
  const navigation = await menu(page);
  const original = (await navigation.elementHandle())!;
  // Both the automatic portrait rail and landscape rail can be expanded.
  const expand = navigation.getByRole("button", { name: "Étendre le menu" });
  if (await expand.count()) await expand.click();
  await expect(navigation).toHaveCSS("width", "280px");
  const toggle = navigation.getByRole("button", { name: "Réduire le menu" });
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  // Keyboard focus must remain visible on the dark navigation surface.
  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(navigation).toHaveCSS("width", "96px");
  await expect(expand).toBeFocused();
  await expect(expand).toHaveAttribute("aria-expanded", "false");
  await navigation
    .getByRole("button", { name: "Mes matières", exact: true })
    .click();
  await expect(page.getByTestId("subject-card-maths")).toBeVisible();
  await remainsMounted(original);
  await expect(navigation).toHaveCSS("width", "96px");
  await page.screenshot({ path: testInfo.outputPath("rail-reduit.png") });
  await expand.click();
  await navigation
    .getByRole("button", { name: "Mes progrès", exact: true })
    .click();
  await expect(page).toHaveURL(/\/student\/progress$/);
  await remainsMounted(original);
  await expect(navigation).toHaveCSS("width", "280px");
  const smallTargets = await navigation
    .getByRole("button")
    .evaluateAll((buttons) =>
      buttons
        .filter((button) => {
          const { width, height } = button.getBoundingClientRect();
          return width < 44 || height < 44;
        })
        .map((button) => button.textContent),
    );
  expect(smallTargets).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("rail-etendu.png") });
});

test("défiler la page indépendamment du rail et ouvrir la rubrique suivante en haut", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1180, height: 500 });
  await page.goto("/student");
  await expect(page.getByTestId("student-home")).toBeVisible();
  const navigation = await menu(page);
  const railScroll = page.getByTestId("navigation-scroll");
  const pageScroll = page.getByTestId("page-scroll");
  await railScroll.evaluate((node) => {
    node.scrollTop = 16;
  });
  await expect
    .poll(() => railScroll.evaluate((node) => node.scrollTop))
    .toBe(16);
  await pageScroll.evaluate((node) => {
    node.scrollTop = 300;
  });
  await expect
    .poll(() => pageScroll.evaluate((node) => node.scrollTop))
    .toBeGreaterThan(0);
  await navigation
    .getByRole("button", { name: "Mes matières", exact: true })
    .click();
  await expect(page).toHaveURL(/\/student\/subjects$/);
  await expect(page.getByTestId("subject-card-maths")).toBeVisible();
  await expect
    .poll(() => railScroll.evaluate((node) => node.scrollTop))
    .toBe(16);
  await expect
    .poll(() => pageScroll.evaluate((node) => node.scrollTop))
    .toBe(0);
});

test("garder le rail visible pendant le chargement d’une nouvelle page", async ({
  page,
}) => {
  let release!: () => void;
  let requested!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const chunkRequested = new Promise<void>((resolve) => {
    requested = resolve;
  });
  await page.route("**/_expo/static/js/web/progress-*.js", async (route) => {
    requested();
    await gate;
    await route.continue();
  });
  await page.goto("/student");
  await expect(page.getByTestId("student-home")).toBeVisible();
  const navigation = await menu(page);
  const original = (await navigation.elementHandle())!;
  const position = await navigation.boundingBox();
  try {
    await navigation
      .getByRole("button", { name: "Mes progrès", exact: true })
      .click();
    await chunkRequested;
    await expect(navigation).toBeVisible();
    await remainsMounted(original);
    expect(await navigation.boundingBox()).toEqual(position);
  } finally {
    release();
  }
  await expect(
    page
      .getByRole("main")
      .getByRole("heading", { name: "Mes progrès", exact: true }),
  ).toBeVisible();
  await remainsMounted(original);
});

test.describe("sur téléphone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });
  test("conserver la barre de navigation et le bouton des profils", async ({
    page,
  }) => {
    await page.goto("/student");
    await expect(page.getByTestId("student-home")).toBeVisible();
    const navigation = await menu(page);
    const original = (await navigation.elementHandle())!;
    const profiles = (await page
      .getByRole("button", { name: "Changer de profil", exact: true })
      .elementHandle())!;
    await navigation
      .getByRole("button", { name: "Mes matières", exact: true })
      .click();
    await expect(page).toHaveURL(/\/student\/subjects$/);
    await remainsMounted(original);
    await remainsMounted(profiles);
    await navigation
      .getByRole("button", { name: "Mes progrès", exact: true })
      .click();
    await expect(page).toHaveURL(/\/student\/progress$/);
    await remainsMounted(original);
    await remainsMounted(profiles);
  });
});
