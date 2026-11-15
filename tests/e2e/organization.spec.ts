import { expect, test } from "@playwright/test";
import { initialData } from "../../src/domain/fixtures";
import type { LearningData } from "../../src/domain/model";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("revizo.mode", "demo"));
});

test("retrouver, filtrer et rouvrir les contenus depuis la bibliothèque", async ({
  page,
}, info) => {
  await page.goto("/parent");
  const navigation = page.getByRole("navigation", {
    name: "Navigation principale",
  });
  const openLibrary = async () => {
    await navigation
      .getByRole("button", { name: "Matières", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Bibliothèque", exact: true })
      .click();
  };
  await openLibrary();
  await expect(page.getByTestId("parent-library")).toBeVisible();
  await page
    .getByRole("button", { name: "Filtrer les contenus", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Rechercher un contenu" })
    .fill("nombres relatifs");
  await page.getByRole("button", { name: "Fiches", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Fiches", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('[data-testid^="library-"]')).toHaveCount(1);
  await page.getByRole("button", { name: "À vérifier", exact: true }).click();
  await expect(
    page.getByText("Aucun contenu avec ces filtres", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Effacer les filtres" }).click();
  await expect(page.locator('[data-testid^="library-"]').first()).toBeVisible();
  await page.screenshot({
    path: info.outputPath("bibliotheque.png"),
    fullPage: true,
  });
  await page
    .getByTestId("library-maths-relative-numbers")
    .getByRole("button", { name: /Ouvrir la fiche/ })
    .click();
  await expect(page).toHaveURL(/\/parent\/review\/maths-relative-numbers$/);
  await expect(
    navigation.getByRole("button", { name: "Matières", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await openLibrary();
  await page
    .getByTestId("library-maths-relative-practice")
    .getByRole("button", { name: /Ouvrir les exercices/ })
    .click();
  await expect(page).toHaveURL(/draftId=maths-relative-practice/);
  await expect(
    page.getByText(initialData.series[0].title, { exact: true }).first(),
  ).toBeVisible();
  await openLibrary();
  await page
    .getByTestId("library-maths-relative-numbers")
    .getByRole("button", { name: "Préparer ses exercices", exact: true })
    .click();
  await expect(
    page.getByTestId("ai-exercise-course-maths-relative-numbers"),
  ).toHaveAttribute("aria-checked", "true");
  await page
    .getByTestId("series-title")
    .fill("Un entraînement de maths conservé");
  await openLibrary();
  const otherCourse = initialData.courses.find(
    (course) => course.status === "published" && course.subjectId !== "maths",
  )!;
  await page
    .getByTestId(`library-${otherCourse.id}`)
    .getByRole("button", { name: "Préparer ses exercices", exact: true })
    .click();
  await expect(
    page.getByTestId(`ai-exercise-course-${otherCourse.id}`),
  ).toHaveAttribute("aria-checked", "true");
  await openLibrary();
  await page
    .getByTestId("library-maths-relative-numbers")
    .getByRole("button", { name: "Préparer ses exercices", exact: true })
    .click();
  await expect(page.getByTestId("series-title")).toHaveValue(
    "Un entraînement de maths conservé",
  );
});

test("garder les mêmes destinations et accéder à l’anglais par sa matière", async ({
  page,
}, info) => {
  await page.goto("/student");
  const navigation = page.getByRole("navigation", {
    name: "Navigation principale",
  });
  const destinations = [
    "Aujourd’hui",
    "Mes matières",
    "Mes exercices",
    "Mes contrôles",
    "Mes progrès",
  ];
  for (const name of destinations)
    await expect(
      navigation.getByRole("button", { name, exact: true }),
    ).toBeVisible();
  await page.getByTestId("subject-card-maths").click();
  for (const name of destinations)
    await expect(
      navigation.getByRole("button", { name, exact: true }),
    ).toBeVisible();
  await navigation
    .getByRole("button", { name: "Mes exercices", exact: true })
    .click();
  await expect(page).toHaveURL(/\/student\/exercises$/);
  await navigation
    .getByRole("button", { name: "Mes matières", exact: true })
    .click();
  await page.getByTestId("subject-card-english").click();
  await page
    .getByRole("button", { name: "Vocabulaire et verbes", exact: true })
    .click();
  await expect(page).toHaveURL(/\/student\/english$/);
  await expect(
    navigation.getByRole("button", { name: "Mes matières", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await page
    .getByRole("button", { name: "Mes cours d’anglais", exact: true })
    .click();
  await expect(page).toHaveURL(/\/student\/subject\/english$/);
  await page.screenshot({
    path: info.outputPath("anglais-reuni.png"),
    fullPage: true,
  });
});

test("reprendre l’essai exact depuis la prochaine séance et consulter son erreur côté parent", async ({
  page,
}, info) => {
  const series = initialData.series[0];
  await page.goto(`/student/exercise/${series.id}`);
  const question = series.questions[0];
  const incorrect = question.choices.find(
    (choice) => choice.id !== question.correctChoiceId,
  )!;
  await page.getByTestId(`choice-${incorrect.id}`).click();
  await page.getByTestId("verify-answer").click();
  await page.getByTestId("next-question").click();
  await page
    .getByRole("button", { name: "Quitter et garder ma place", exact: true })
    .click();
  await page.goto("/student");
  const session = page.getByTestId("next-study-session");
  await expect(session).toContainText(series.title);
  await expect(
    session.getByRole("button", { name: "Reprendre ma séance" }),
  ).toBeInViewport();
  await page.screenshot({
    path: info.outputPath("prochaine-seance.png"),
    fullPage: true,
  });
  await session.getByRole("button", { name: "Reprendre ma séance" }).click();
  await expect(page).toHaveURL(/attemptId=/);
  await expect(
    page.getByText(series.questions[1].prompt, { exact: true }),
  ).toBeVisible();
  for (const question of series.questions.slice(1)) {
    await page.getByTestId(`choice-${question.correctChoiceId}`).click();
    await page.getByTestId("verify-answer").click();
    await page.getByTestId("next-question").click();
  }
  await expect(page.getByTestId("exercise-result")).toBeVisible();
  await page.goto("/parent/progress");
  const concept = page.getByTestId("review-concept-0");
  await expect(concept).toContainText(series.questions[0].prompt);
  await expect(concept).toContainText(series.questions[0].explanation);
  await expect(concept).toContainText(incorrect.label);
  await page.screenshot({
    path: info.outputPath("suivi-parent.png"),
    fullPage: true,
  });
  const state = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("revizo.learning.v1")!) as LearningData,
  );
  expect(
    state.attempts.filter((attempt) => attempt.seriesId === series.id),
  ).toHaveLength(1);
  expect(state.attempts[0].questions).toEqual(series.questions);
});

test("distinguer le contenu privé de la bibliothèque et le parcours enfant", async ({
  page,
}) => {
  const state = structuredClone(initialData);
  const course = {
    ...structuredClone(state.courses[0]),
    id: "private-draft",
    title: "Cours privé à relire",
    status: "draft" as const,
  };
  state.courses.push(course);
  await page.addInitScript((state) => {
    if (!localStorage.getItem("organization-seeded")) {
      localStorage.setItem("revizo.learning.v1", JSON.stringify(state));
      localStorage.setItem("organization-seeded", "1");
    }
  }, state);
  await page.goto("/parent/library?status=review");
  await expect(page.getByTestId("library-private-draft")).toContainText(
    "À vérifier",
  );
  await page.goto("/student/subjects");
  await page.getByTestId(`subject-card-${course.subjectId}`).click();
  await expect(page.getByText(course.title, { exact: true })).toHaveCount(0);
  await page.goto("/student");
  await expect(page.getByTestId("next-study-session")).not.toContainText(
    course.title,
  );
});

test("garder les commandes tactiles et les cartes dans la largeur disponible", async ({
  page,
}) => {
  for (const path of [
    "/parent/library",
    "/parent/progress",
    "/student",
    "/student/subjects",
  ]) {
    await page.goto(path);
    await expect(page.getByRole("main")).toBeVisible();
    if (path === "/parent/library")
      await page
        .getByRole("button", { name: "Filtrer les contenus", exact: true })
        .click();
    const buttons = await page.getByRole("button").evaluateAll((elements) =>
      elements
        .map((element) => ({
          label: element.getAttribute("aria-label") || element.textContent,
          width: element.getBoundingClientRect().width,
          height: element.getBoundingClientRect().height,
        }))
        .filter((item) => item.width > 0 && item.height > 0),
    );
    expect(
      buttons.filter((button) => button.width < 44 || button.height < 44),
    ).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});

test.describe("bibliothèque compacte", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });
  test("montrer les premiers contenus et garder les filtres accessibles", async ({
    page,
  }, info) => {
    await page.goto("/parent/library");
    const toggle = page.getByRole("button", {
      name: "Filtrer les contenus",
      exact: true,
    });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    const first = page.locator('[data-testid^="library-"]').first();
    await page.screenshot({
      path: info.outputPath("bibliotheque-mobile.png"),
      fullPage: true,
    });
    await expect(first.getByRole("heading")).toBeInViewport();
    await toggle.click();
    await expect(
      page.getByRole("button", { name: "Masquer les filtres", exact: true }),
    ).toHaveAttribute("aria-expanded", "true");
    await page
      .getByRole("button", { name: "Mathématiques", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Masquer les filtres", exact: true })
      .click();
    await expect(
      page.getByText("Filtres : Mathématiques", { exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
});
