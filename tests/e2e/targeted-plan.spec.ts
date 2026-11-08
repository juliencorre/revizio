import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { initialData } from "../../src/domain/fixtures";
import type { LearningData } from "../../src/domain/model";

const series = initialData.series.find(
  (series) => series.id === "maths-relative-practice",
)!;
const storageKey = "revizo.learning.v1";
async function saved(page: Page): Promise<LearningData> {
  return page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) || "{}"),
    storageKey,
  );
}
function futureDate(days: number) {
  const value = new Date();
  value.setDate(value.getDate() + days);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}
async function preparePlan(page: Page, title: string) {
  await page.goto("/parent/controls");
  await page.getByTestId("control-title").fill(title);
  await page.getByTestId("control-date").fill(futureDate(4));
  await page.getByTestId("control-course-maths-relative-numbers").click();
  await page.getByTestId("propose-plan").click();
  await expect(page.getByTestId("targeted-plan-preview")).toBeVisible();
  await expect(page.getByTestId("publish-plan")).toBeDisabled();
}
async function publishPlan(page: Page, title: string) {
  await page
    .getByRole("button", {
      name: "Confirmer la relecture du plan",
      exact: true,
    })
    .click();
  await page.getByTestId("publish-plan").click();
  await expect
    .poll(
      async () =>
        (await saved(page)).plans?.find((plan) => plan.title === title)?.status,
    )
    .toBe("published");
  return (await saved(page)).plans!.find((plan) => plan.title === title)!;
}
async function capture(page: Page, info: TestInfo, name: string) {
  const path = info.outputPath(name + ".png");
  await page.screenshot({ path, fullPage: true });
  await info.attach(name, { path, contentType: "image/png" });
}
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("revizo.mode", "demo"));
});

test("relire les erreurs réellement commises puis partager une séance ciblée distincte", async ({
  page,
}, info) => {
  test.setTimeout(60000);
  await page.goto(`/student/exercise/${series.id}`);
  for (const [index, question] of series.questions.entries()) {
    await expect(
      page.getByText(question.prompt, { exact: true }),
    ).toBeVisible();
    const choiceId =
      index === 0
        ? question.choices.find(
            (choice) => choice.id !== question.correctChoiceId,
          )!.id
        : question.correctChoiceId;
    await page.getByTestId("choice-" + choiceId).click();
    await page.getByTestId("verify-answer").click();
    await page.getByTestId("next-question").click();
  }
  await expect(page.getByTestId("exercise-result")).toBeVisible();
  await expect(page.getByTestId("exercise-score")).toHaveText(
    `4 / ${series.questions.length}`,
  );
  const title = "Réviser mes relatifs après mon essai";
  await preparePlan(page, title);
  const preview = page.getByTestId("targeted-plan-preview");
  await expect(preview).toContainText("1 question");
  await expect(preview).toContainText(series.questions[0].prompt);
  await expect(preview).toContainText(series.questions[0].explanation);
  await expect(preview).toContainText(
    "Réponse attendue : " +
      series.questions[0].choices.find(
        (choice) => choice.id === series.questions[0].correctChoiceId,
      )!.label,
  );
  await expect(preview).not.toContainText(series.questions[1].prompt);
  await preview.scrollIntoViewIfNeeded();
  await capture(page, info, "parent-targeted-errors-preview");
  const plan = await publishPlan(page, title);
  const mistakeStep = plan.steps.find((step) => step.kind === "mistakes")!;
  const practiceStep = plan.steps.find((step) => step.kind === "practice")!;
  expect(practiceStep.seriesId).toBe(series.id);
  expect(mistakeStep.seriesId).not.toBe(practiceStep.seriesId);
  const target = (await saved(page)).series.find(
    (series) => series.id === mistakeStep.seriesId,
  )!;
  expect(target.questions).toHaveLength(1);
  expect({ ...target.questions[0], id: series.questions[0].id }).toEqual(
    series.questions[0],
  );
  expect(
    (await saved(page)).series.find((item) => item.id === series.id)?.questions,
  ).toEqual(series.questions);
  await page.goto(`/student/plans?id=${plan.id}`);
  await page.getByTestId("start-plan-step-" + mistakeStep.id).click();
  await expect(
    page.getByText(series.questions[0].prompt, { exact: true }),
  ).toBeVisible();
  await page
    .getByTestId("choice-" + target.questions[0].correctChoiceId)
    .click();
  await page.getByTestId("verify-answer").click();
  await page.getByTestId("next-question").click();
  await expect(page.getByTestId("exercise-score")).toHaveText("1 / 1");
  await capture(page, info, "child-targeted-errors-result");
  const original = (await saved(page)).attempts.find(
    (attempt) => attempt.seriesId === series.id,
  )!;
  expect(original.answers.filter((answer) => !answer.isCorrect)).toHaveLength(
    1,
  );
});

test("annoncer une consolidation approuvée quand aucune erreur n’est connue", async ({
  page,
}, info) => {
  const title = "Consolider les nombres relatifs";
  await preparePlan(page, title);
  const preview = page.getByTestId("targeted-plan-preview");
  await expect(preview).toContainText("Aucune erreur connue");
  await expect(preview).toContainText("Consolider les notions");
  await expect(preview).toContainText(`${series.questions.length} questions`);
  for (const question of series.questions)
    await expect(preview).toContainText(question.explanation);
  await preview.scrollIntoViewIfNeeded();
  await capture(page, info, "parent-approved-consolidation-preview");
  const plan = await publishPlan(page, title);
  const mistakeStep = plan.steps.find((step) => step.kind === "mistakes")!;
  expect(mistakeStep.title).toBe("Consolider les notions");
  const material = (await saved(page)).series.find(
    (series) => series.id === mistakeStep.seriesId,
  )!;
  expect(material.questions).toEqual(series.questions);
  await page.goto(`/student/plans?id=${plan.id}`);
  await expect(
    page.getByRole("heading", { name: "Consolider les notions", exact: true }),
  ).toBeVisible();
  await page.getByTestId("start-plan-step-" + mistakeStep.id).click();
  await expect(
    page.getByText(series.questions[0].prompt, { exact: true }),
  ).toBeVisible();
});
