import { expect, test } from "@playwright/test";
import { initialData } from "../../src/domain/fixtures";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("revizo.mode", "demo"));
});

test("l’import suit le thème de la tablette et conserve la saisie et le focus", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/parent/import");
  const field = page.getByTestId("course-title");
  await expect(field).toHaveCSS("background-color", "rgb(25, 30, 48)");
  await expect(field).toHaveCSS("border-top-color", "rgb(146, 154, 179)");
  await field.fill("Les saisons");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(field).toHaveCSS("background-color", "rgb(239, 241, 248)");
  await expect(field).toBeFocused();
  await expect(field).toHaveValue("Les saisons");
  await field.blur();
  await expect(field).toHaveCSS("border-top-color", "rgb(115, 125, 150)");
});

test("l’exercice conserve le choix de l’élève et adapte le bouton et la correction", async ({
  page,
}) => {
  const series = initialData.series.find(
    (item) => item.id === "maths-relative-practice",
  )!;
  const question = series.questions[0];
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto(`/student/exercise/${series.id}`);
  const choice = page.getByTestId(`choice-${question.correctChoiceId}`);
  await choice.click();
  const verify = page.getByTestId("verify-answer");
  await expect(verify).toHaveCSS("background-color", "rgb(96, 69, 217)");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(choice).toHaveAttribute("aria-checked", "true");
  await expect(verify).toHaveCSS("background-color", "rgb(189, 176, 255)");
  await expect(
    verify.getByText("Vérifier ma réponse", { exact: true }),
  ).toHaveCSS("color", "rgb(33, 27, 64)");
  await verify.click();
  const feedback = page.getByText(/Bien joué/);
  await expect(feedback).toHaveCSS("color", "rgb(146, 218, 185)");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(feedback).toHaveCSS("color", "rgb(34, 118, 92)");
});
