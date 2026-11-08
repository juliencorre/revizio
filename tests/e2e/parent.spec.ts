import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("revizo.mode", "demo"));
});
const storageKey = "revizo.learning.v1";

test("importer une source et publier une fiche relue pour l’enfant", async ({
  page,
}) => {
  await page.goto("/parent/import");
  const titleBox = await page.getByTestId("course-title").boundingBox();
  expect(titleBox).not.toBeNull();
  expect(titleBox!.x + titleBox!.width).toBeLessThanOrEqual(
    page.viewportSize()!.width,
  );
  const epsBox = await page
    .getByRole("radio", { name: "EPS", exact: true })
    .boundingBox();
  expect(epsBox!.x + epsBox!.width).toBeLessThanOrEqual(
    page.viewportSize()!.width,
  );
  await page
    .getByTestId("course-title")
    .fill("Les températures — test familial");
  const chooser = page.waitForEvent("filechooser");
  await page
    .getByRole("button", { name: "Fichiers / PDF", exact: true })
    .click();
  await (await chooser).setFiles("assets/brand/icon.png");
  await expect(page.getByText("icon.png", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Créer le brouillon", exact: true })
    .click();
  await expect(page.getByTestId("parent-review")).toBeVisible();
  const courseId = new URL(page.url()).pathname.split("/").pop()!;
  await page
    .getByTestId("course-content")
    .fill(
      "Une température négative est inférieure à zéro. Exemple : −2 °C est inférieur à +3 °C.",
    );
  await page.getByTestId("save-course").click();
  await expect(
    page.getByText("Brouillon enregistré", { exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("publish-course")).toBeDisabled();
  await page
    .getByRole("button", {
      name: "Confirmer la relecture du cours",
      exact: true,
    })
    .click();
  await page.getByTestId("publish-course").click();
  await expect(
    page.getByText("La fiche publiée", { exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        ({ key, id }) =>
          JSON.parse(localStorage.getItem(key) || "{}").courses?.find(
            (course: { id: string; status: string }) => course.id === id,
          )?.status,
        { key: storageKey, id: courseId },
      ),
    )
    .toBe("published");
  await page.reload();
  await expect(
    page.getByText("La fiche publiée", { exact: true }),
  ).toBeVisible();
  await page.goto(`/student/course/${courseId}`);
  await expect(
    page.getByText("Les températures — test familial", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Une température négative est inférieure à zéro. Exemple : −2 °C est inférieur à +3 °C.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
});

test("préparer, relire et publier un QCM utilisable par l’enfant", async ({
  page,
}) => {
  await page.goto("/parent/exercises");
  await page.getByTestId("series-title").fill("Additionner deux positifs");
  await page.getByTestId("question-prompt").fill("Combien vaut 2 + 3 ?");
  await page.getByTestId("choice-input-0").fill("4");
  await page.getByTestId("choice-input-1").fill("5");
  await page.getByTestId("correct-choice-1").click();
  await page
    .getByTestId("question-explanation")
    .fill("En avançant de trois unités depuis 2, on arrive à 5.");
  await page.getByTestId("add-question").click();
  await page.getByTestId("preview-series").click();
  await expect(page.getByTestId("publish-series")).toBeDisabled();
  await page
    .getByRole("button", {
      name: "Confirmer la relecture des exercices",
      exact: true,
    })
    .click();
  await page.getByTestId("publish-series").click();
  await expect(
    page.getByText("La série est prête !", { exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        (key) =>
          JSON.parse(localStorage.getItem(key) || "{}").series?.find(
            (series: { title: string; status: string }) =>
              series.title === "Additionner deux positifs",
          )?.status,
        storageKey,
      ),
    )
    .toBe("published");
  const seriesId = await page.evaluate(
    (key) =>
      JSON.parse(localStorage.getItem(key) || "{}").series.find(
        (series: { title: string }) =>
          series.title === "Additionner deux positifs",
      ).id,
    storageKey,
  );
  await page.goto(`/student/exercise/${seriesId}`);
  await expect(
    page.getByText("Combien vaut 2 + 3 ?", { exact: true }),
  ).toBeVisible();
  await page.getByTestId("choice-choice-2").click();
  await page.getByTestId("verify-answer").click();
  await expect(page.getByText("Bien joué !", { exact: true })).toBeVisible();
  await page.getByTestId("next-question").click();
  await expect(page.getByTestId("exercise-score")).toHaveText("1 / 1");
});
