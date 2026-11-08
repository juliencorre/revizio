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
