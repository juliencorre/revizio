import { expect, test } from "@playwright/test";

/**
 * Captures réelles du rendu pour la revue visuelle de la refonte.
 * Elles sont jointes aux artefacts GitHub Actions (test-results/).
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("revizo.mode", "demo"));
});

const screens = [
  { name: "accueil-eleve", path: "/student", ready: "student-home" },
  { name: "cours-maths", path: "/student/subject/maths", ready: "course-card" },
  { name: "exercices", path: "/student/exercises", ready: "main" },
  { name: "progression", path: "/student/progress", ready: "main" },
  { name: "tableau-parent", path: "/parent", ready: "parent-dashboard" },
  { name: "anglais-eleve", path: "/student/english", ready: "main" },
  { name: "controles-eleve", path: "/student/plans", ready: "main" },
  { name: "ajout-cours-parent", path: "/parent/import", ready: "main" },
  { name: "preparer-exercices-parent", path: "/parent/exercises", ready: "main" },
  { name: "controles-parent", path: "/parent/controls", ready: "main" },
  { name: "anglais-parent", path: "/parent/english", ready: "main" },
  { name: "preparations-parent", path: "/parent/preparations", ready: "main" },
  { name: "reglages-parent", path: "/parent/settings", ready: "main" },
] as const;

test("captures du parcours élève et parent sur ordinateur", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const screen of screens) {
    await page.goto(screen.path);
    await expect(page.getByRole("main")).toBeVisible();
    if (screen.ready === "student-home" || screen.ready === "parent-dashboard") {
      await expect(page.getByTestId(screen.ready)).toBeVisible();
    } else if (screen.ready === "course-card") {
      await expect(page.locator('[data-testid^="course-card-"]').first()).toBeVisible();
    }
    await page.screenshot({ path: testInfo.outputPath(`revizio-${screen.name}-desktop.png`), fullPage: true, animations: "disabled" });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});

test("captures accueil et exercice sur smartphone", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/student");
  await expect(page.getByTestId("student-home")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("revizio-accueil-mobile.png"), fullPage: true, animations: "disabled" });
  await page.goto("/student/exercise/maths-relative-practice");
  await expect(page.getByRole("button", { name: "Quitter et garder ma place" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("revizio-exercice-mobile.png"), fullPage: true, animations: "disabled" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
