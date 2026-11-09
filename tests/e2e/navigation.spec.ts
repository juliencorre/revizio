import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("revizo.mode", "demo"));
});

test("choisir un profil et retrouver les matières", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Qui se connecte/ }),
  ).toBeVisible();
  await page.getByTestId("profile-child").click();
  await expect(page).toHaveURL(/\/student$/);
  await expect(page.getByTestId("subject-card-maths")).toBeVisible();
  await expect(page.getByTestId("subject-card-english")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("matieres.png"),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("accéder au tableau de bord parent", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("profile-parent").click();
  await expect(page).toHaveURL(/\/parent$/);
  await expect(
    page
      .getByRole("button", { name: /Ajouter un cours|Importer un cours/ })
      .first(),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
});

test("une adresse inconnue propose de revenir aux profils", async ({
  page,
}) => {
  await page.goto("/cette-page-n-existe-pas");
  await expect(page.getByText("Cette page n’existe pas")).toBeVisible();
  await page.getByRole("button", { name: "Revenir aux profils" }).click();
  await expect(page.getByTestId("profile-child")).toBeVisible();
});

test.describe("sur smartphone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("naviguer avec la barre du bas et le menu Plus", async ({ page }) => {
    await page.goto("/parent");
    const navigation = page.getByRole("navigation", {
      name: "Navigation principale",
    });
    await expect(
      navigation.getByRole("button", { name: "Tableau de bord" }),
    ).toHaveAttribute("aria-current", "page");
    await page.getByTestId("navigation-more").click();
    await expect(page.getByTestId("navigation-more")).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    const sheet = page.getByRole("dialog", { name: "Plus de rubriques" });
    await expect(sheet).toBeVisible();
    await sheet.getByRole("button", { name: "Réglages" }).click();
    await expect(page).toHaveURL(/\/parent\/settings$/);
    await expect(page.getByTestId("navigation-more")).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true);
  });

  test("garder l’exercice en plein écran", async ({ page }) => {
    await page.goto("/student");
    await expect(page.getByTestId("subject-card-maths")).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Navigation principale" }),
    ).toBeVisible();
    await page.goto("/student/exercise/maths-relative-practice");
    await expect(
      page.getByRole("button", { name: "Quitter et garder ma place" }),
    ).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Navigation principale" }),
    ).toHaveCount(0);
    // The action stays within thumb reach and the correction comes into view.
    await expect(page.getByTestId("verify-answer")).toBeInViewport();
    await page.getByText("−3", { exact: true }).first().click();
    await page.getByTestId("verify-answer").click();
    await expect(
      page.getByText("Bien joué !", { exact: true }),
    ).toBeInViewport();
    await expect(page.getByTestId("next-question")).toBeInViewport();
  });
});
