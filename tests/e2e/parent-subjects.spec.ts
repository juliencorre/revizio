import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("revizo.mode", "demo"));
});

test("choisir la matière et retrouver ses rubriques en revenant d’un éditeur", async ({
  page,
}, info) => {
  const button = (name: string) =>
    page.getByRole("button", { name, exact: true });
  const tab = (name: string) => page.getByRole("tab", { name, exact: true });
  const selector = page.getByTestId("parent-subject-banner");
  const dialog = page.getByRole("dialog", { name: "Choisir une matière" });
  async function changeSubject(name: string) {
    await selector.click();
    await dialog.getByRole("radio", { name, exact: true }).click();
    await expect(selector).toHaveAccessibleName("Changer de matière : " + name);
    await expect(tab("Cours")).toHaveAttribute("aria-selected", "true");
  }
  await page.goto("/parent");
  await button("Anglais").click();
  await expect(selector).toContainText("Anglais");
  await expect(tab("Conjugaison")).toBeInViewport();
  const profile = page.getByTestId("parent-child-trigger");
  const subjectBounds = (await selector.boundingBox())!;
  const profileBounds = (await profile.boundingBox())!;
  expect(subjectBounds.x + subjectBounds.width).toBeLessThan(profileBounds.x);
  expect(
    Math.abs(
      subjectBounds.y +
        subjectBounds.height / 2 -
        (profileBounds.y + profileBounds.height / 2),
    ),
  ).toBeLessThan(2);
  await expect(button("Toutes les matières")).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("anglais.png") });
  for (const control of [
    selector,
    profile,
    ...(await page.getByRole("tab").all()),
    button("Ajouter un cours"),
  ]) {
    const bounds = (await control.boundingBox())!;
    expect(bounds.width).toBeGreaterThanOrEqual(44);
    expect(bounds.height).toBeGreaterThanOrEqual(44);
  }
  await selector.click();
  await expect(
    dialog.getByRole("radio", { name: "Anglais", exact: true }),
  ).toBeChecked();
  await page.screenshot({ path: info.outputPath("selecteur.png") });
  const englishOption = dialog.getByRole("radio", {
    name: "Anglais",
    exact: true,
  });
  await expect(englishOption).toBeFocused();
  await englishOption.press("ArrowDown");
  await expect(
    dialog.getByRole("radio", { name: "Espagnol (LV2)" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(selector).toBeFocused();
  await tab("Cours").press("End");
  await expect(tab("Conjugaison")).toHaveAttribute("aria-selected", "true");
  await button("Préparer la conjugaison").click();
  await expect(page.getByTestId("english-verb-base")).toBeVisible();
  await expect(page.getByTestId("english-word-en")).toHaveCount(0);
  await button("Menu de la matière").click();
  await expect(tab("Conjugaison")).toHaveAttribute("aria-selected", "true");
  await tab("Vocabulaire").click();
  await expect(page).toHaveURL(/tab=vocabulaire/);
  await page.reload();
  await expect(tab("Vocabulaire")).toHaveAttribute("aria-selected", "true");
  await button("Créer une liste").click();
  await expect(selector).toContainText("Anglais");
  await changeSubject("Mathématiques");
  await expect(tab("Vocabulaire")).toHaveCount(0);
  await expect(tab("Conjugaison")).toHaveCount(0);
  await tab("Exercices").click();
  await button("Préparer des exercices").click();
  await expect(
    page.getByTestId("ai-exercise-course-maths-relative-numbers"),
  ).toBeVisible();
  await expect(
    page.getByTestId("ai-exercise-course-english-past-simple"),
  ).toHaveCount(0);
  for (const name of ["Espagnol (LV2)", "Latin (option)"]) {
    await changeSubject(name);
    await expect(tab("Conjugaison")).toHaveCount(0);
    await tab("Vocabulaire").click();
    await expect(button("Créer une liste")).toBeVisible();
  }
  await page.goto("/parent/subject/maths?tab=conjugaison");
  await expect(tab("Cours")).toHaveAttribute("aria-selected", "true");
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
  await page.getByRole("tab", { name: "Exercices" }).click();
  await expect(page.getByText("Publiez d’abord une fiche")).toBeVisible();
  await button("Ajouter un cours").click();
  await expect(banner).toContainText("EPS");
  await page.getByTestId("course-title").fill("Les relais");
  await button("Matières").click();
  await button("Anglais").click();
  await button("Ajouter un cours").click();
  await expect(page.getByTestId("course-title")).toHaveValue("");
  await page.getByTestId("course-title").fill("My school");
  await button("Matières").click();
  await button("EPS").click();
  await button("Ajouter un cours").click();
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
