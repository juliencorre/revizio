import { expect, test } from "@playwright/test";
import { initialData } from "../../src/domain/fixtures";
import type { Question } from "../../src/domain/model";
const questions: Question[] = [
  {
    id: "qcm",
    type: "single-choice",
    prompt: "Quel nombre est positif ?",
    choices: [
      { id: "a", label: "3" },
      { id: "b", label: "−3" },
    ],
    correctChoiceId: "a",
    explanation: "3 est supérieur à zéro.",
    hint: "Compare avec zéro.",
    concept: "Signe",
  },
  {
    id: "vf",
    type: "true-false",
    prompt: "−2 est inférieur à zéro.",
    choices: [
      { id: "a", label: "Vrai" },
      { id: "b", label: "Faux" },
    ],
    correctChoiceId: "a",
    explanation: "Un nombre négatif est inférieur à zéro.",
    hint: "Observe le signe.",
    concept: "Comparaison",
  },
  {
    id: "blank",
    type: "fill-blank",
    prompt: "Complète : 2 + 3 = …",
    choices: [],
    correctChoiceId: "",
    expectedAnswers: ["5"],
    explanation: "Deux et trois font cinq.",
    hint: "Compte trois unités après deux.",
    concept: "Addition",
  },
  {
    id: "short",
    type: "short-answer",
    prompt: "Comment s’appelle un nombre inférieur à zéro ?",
    choices: [],
    correctChoiceId: "",
    expectedAnswers: ["négatif", "un nombre négatif"],
    explanation: "C’est un nombre négatif.",
    hint: "Il porte un signe moins.",
    concept: "Vocabulaire",
  },
  {
    id: "problem",
    type: "problem",
    prompt:
      "Il fait −3 °C, puis la température monte de 5 °C. Donne le nombre de degrés final.",
    choices: [],
    correctChoiceId: "",
    expectedAnswers: ["2"],
    explanation: "−3 + 5 = 2.",
    hint: "Avance de cinq depuis moins trois.",
    concept: "Température",
  },
];
test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    ({ data, questions }) => {
      localStorage.setItem("revizo.mode", "demo");
      if (!localStorage.getItem("revizo.learning.v1")) {
        data.series.push({
          id: "five-formats",
          title: "Les cinq formats",
          courseIds: ["maths-relative-numbers"],
          subjectId: "maths",
          status: "published",
          level: "practice",
          questions,
        });
        localStorage.setItem("revizo.learning.v1", JSON.stringify(data));
      }
    },
    { data: initialData, questions },
  );
});
test("corriger cinq formats, conserver la saisie et relire les anciennes corrections", async ({
  page,
}, info) => {
  await page.goto("/student/exercise/five-formats");
  for (const question of questions) {
    await expect(
      page.getByText(question.prompt, { exact: true }),
    ).toBeVisible();
    if (question.choices.length)
      await page.getByTestId("choice-" + question.correctChoiceId).click();
    else
      await page
        .getByTestId("written-answer")
        .fill(question.expectedAnswers![0]);
    await page.getByTestId("verify-answer").click();
    await expect(
      page.getByText(question.explanation, { exact: true }),
    ).toBeVisible();
    if (question.id === "blank") {
      await page.reload();
      await expect(
        page.getByText(questions[3].prompt, { exact: true }),
      ).toBeVisible();
    } else await page.getByTestId("next-question").click();
  }
  await expect(page.getByTestId("exercise-score")).toHaveText("5 / 5");
  await page
    .getByRole("button", { name: "Revoir toutes les corrections", exact: true })
    .click();
  await expect(
    page.getByText(questions[0].explanation, { exact: true }),
  ).toBeVisible();
  const path = info.outputPath("cinq-formats-correction.png");
  await page.screenshot({ path, fullPage: true });
  await info.attach("cinq-formats-correction", {
    path,
    contentType: "image/png",
  });
});
test("garder la même échéance après rechargement et remettre le contrôle à la fin du temps", async ({
  page,
}, info) => {
  await page.clock.install();
  await page.goto("/student/exercise/five-formats?mode=exam&minutes=1");
  await expect(page.getByTestId("exam-timer")).toBeVisible();
  const deadline = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("revizo.learning.v1")!).attempts[0]
        .deadlineAt,
  );
  await page.getByTestId("choice-a").click();
  await page.getByTestId("verify-answer").click();
  await expect(
    page.getByText(questions[0].explanation, { exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByText(questions[1].prompt, { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("revizo.learning.v1")!).attempts[0]
          .deadlineAt,
    ),
  ).toBe(deadline);
  await page.clock.fastForward(61000);
  await expect(page.getByTestId("exercise-result")).toBeVisible();
  await expect(page.getByTestId("exercise-score")).toHaveText("1 / 5");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("revizo.learning.v1")!).attempts[0]
            .answers.length,
      ),
    )
    .toBe(5);
  const path = info.outputPath("controle-temps-ecoule.png");
  await page.screenshot({ path, fullPage: true });
  await info.attach("controle-temps-ecoule", {
    path,
    contentType: "image/png",
  });
});
