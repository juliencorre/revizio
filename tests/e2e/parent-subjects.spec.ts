import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("revizo.mode", "demo"));
});

test("choisir la matière et retrouver ses rubriques en revenant d’un éditeur", async ({
  page,
}, info) => {
  const button = (name: string) =>
    page.getByRole("button", { name, exact: true });
  const banner = page.getByTestId("parent-subject-banner");
  await page.goto("/parent");
  await expect(button("Anglais")).toBeInViewport();
  await button("Anglais").click();
  await expect(banner).toContainText("Anglais");
  await expect(button("Conjugaison")).toBeInViewport();
  await page.screenshot({ path: info.outputPath("anglais.png") });
  await button("Conjugaison").click();
  await expect(page.getByTestId("english-verb-base")).toBeVisible();
  await expect(page.getByTestId("english-word-en")).toHaveCount(0);
  await button("Menu de la matière").click();
  await button("Vocabulaire").click();
  await button("Créer une liste").click();
  await expect(banner).toContainText("Anglais");
  await button("Toutes les matières").click();
  await button("Mathématiques").click();
  await expect(button("Vocabulaire")).toHaveCount(0);
  await expect(button("Conjugaison")).toHaveCount(0);
  await button("Exercices").click();
  await expect(
    page.getByTestId("ai-exercise-course-maths-relative-numbers"),
  ).toBeVisible();
  await expect(
    page.getByTestId("ai-exercise-course-english-past-simple"),
  ).toHaveCount(0);
  await button("Toutes les matières").click();
  for (const name of ["Espagnol (LV2)", "Latin (option)"]) {
    await button(name).click();
    await expect(button("Conjugaison")).toHaveCount(0);
    await button("Vocabulaire").click();
    await expect(banner).toContainText(name);
    await button("Toutes les matières").click();
  }
});

test("publier le premier cours d’une matière vide et préparer ses exercices", async ({
  page,
}) => {
  const button = (name: string) =>
    page.getByRole("button", { name, exact: true });
  const banner = page.getByTestId("parent-subject-banner");
  await page.goto("/parent");
  await button("Voir toutes les matières").click();
  await button("EPS").click();
  await button("Exercices").click();
  await expect(page.getByText("Publiez d’abord une fiche")).toBeVisible();
  await button("Ajouter un cours").click();
  await expect(banner).toContainText("EPS");
  await page.getByTestId("course-title").fill("Les relais");
  await button("Toutes les matières").click();
  await button("Anglais").click();
  await button("Cours").click();
  await expect(page.getByTestId("course-title")).toHaveValue("");
  await page.getByTestId("course-title").fill("My school");
  await button("Toutes les matières").click();
  await button("EPS").click();
  await button("Cours").click();
  await expect(page.getByTestId("course-title")).toHaveValue("Les relais");
  await page.reload();
  await expect(page.getByTestId("course-title")).toHaveValue("Les relais");
  await expect(page.getByRole("radio", { name: "Mathématiques" })).toHaveCount(
    0,
  );
  await button("Créer le brouillon").click();
  await expect(banner).toContainText("EPS");
  await page
    .getByTestId("course-content")
    .fill("La transmission du témoin se prépare dans la zone de relais.");
  await page.getByTestId("save-course").click();
  await button("Confirmer la relecture du cours").click();
  await page.getByTestId("publish-course").click();
  await button("Préparer des exercices").click();
  await expect(
    page.getByRole("checkbox", { name: "Les relais" }),
  ).toBeChecked();
  await expect(
    page.getByTestId("ai-exercise-course-maths-relative-numbers"),
  ).toHaveCount(0);
  await page.getByTestId("series-title").fill("Passer le témoin");
  await page.getByTestId("question-prompt").fill("Où transmettre le témoin ?");
  await button("Menu de la matière").click();
  await button("Passer le témoin").click();
  await expect(page.getByTestId("series-title")).toHaveValue(
    "Passer le témoin",
  );
  await expect(page.getByTestId("question-prompt")).toHaveValue(
    "Où transmettre le témoin ?",
  );
  await expect(banner).toContainText("EPS");
});

test("reprendre un ancien import uniquement dans sa matière et garder le contexte du suivi IA", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      "revizo.import.alex.new",
      JSON.stringify({
        title: "Un cours déjà commencé",
        subjectId: "english",
        sourceText: "My lesson",
        sources: [],
        existingId: "",
      }),
    ),
  );
  await page.goto("/parent/import?subjectId=maths");
  await expect(page.getByTestId("course-title")).toHaveValue("");
  await page.goto("/parent/import?subjectId=english");
  await expect(page.getByTestId("course-title")).toHaveValue(
    "Un cours déjà commencé",
  );
  await page.goto("/parent/preparations?subjectId=english");
  await expect(page.getByTestId("parent-subject-banner")).toContainText(
    "Anglais",
  );
  await page
    .getByRole("button", { name: "Préparer un exercice à la main" })
    .click();
  await expect(
    page.getByTestId("ai-exercise-course-english-past-simple"),
  ).toBeVisible();
  await expect(
    page.getByTestId("ai-exercise-course-maths-relative-numbers"),
  ).toHaveCount(0);
});
