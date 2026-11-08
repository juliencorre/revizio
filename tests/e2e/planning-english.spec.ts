import { expect, test, type Page, type TestInfo } from "@playwright/test";
import type { LearningData } from "../../src/domain/model";

const storageKey = "revizo.learning.v1";
function futureDate(days: number) {
  const value = new Date();
  value.setDate(value.getDate() + days);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}
async function saved(page: Page): Promise<LearningData> {
  return page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) || "{}"),
    storageKey,
  );
}
async function capture(page: Page, testInfo: TestInfo, name: string) {
  const path = testInfo.outputPath(name + ".png");
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach(name, { path, contentType: "image/png" });
}
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("revizo.mode", "demo");
    if (window.speechSynthesis) {
      Object.defineProperty(
        Object.getPrototypeOf(window.speechSynthesis),
        "speak",
        {
          configurable: true,
          value: (utterance: SpeechSynthesisUtterance) => {
            sessionStorage.setItem(
              "revizo.test.spoken",
              utterance.text + "|" + utterance.lang,
            );
            utterance.dispatchEvent(new Event("start"));
            setTimeout(() => utterance.dispatchEvent(new Event("end")), 0);
          },
        },
      );
      Object.defineProperty(
        Object.getPrototypeOf(window.speechSynthesis),
        "cancel",
        {
          configurable: true,
          value: () => undefined,
        },
      );
    }
  });
});

test("préparer un contrôle, publier son plan et terminer lecture et contrôle blanc", async ({
  page,
}, testInfo) => {
  test.setTimeout(60000);
  const title = "Mon contrôle de nombres relatifs";
  await page.goto("/parent/controls");
  await page.getByTestId("control-title").fill(title);
  await page.getByTestId("control-date").fill(futureDate(4));
  await page.getByTestId("control-course-maths-relative-numbers").click();
  await page.getByTestId("propose-plan").click();
  await expect(
    page.getByRole("heading", {
      name: "Plan de révision proposé",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByTestId("save-plan").click();
  await expect
    .poll(
      async () =>
        (await saved(page)).plans?.find((plan) => plan.title === title)?.status,
    )
    .toBe("draft");
  await page.reload();
  await expect(page.getByTestId("control-title")).toHaveValue(title);
  await expect(page.getByTestId("publish-plan")).toBeDisabled();
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
  const plan = (await saved(page)).plans!.find((plan) => plan.title === title)!;
  await page
    .getByRole("heading", { name: "Contrôles et plans", exact: true })
    .scrollIntoViewIfNeeded();
  await capture(page, testInfo, "parent-plan-publie");
  await page.goto("/student/plans");
  await page
    .getByRole("button", { name: "Voir le plan " + title, exact: true })
    .click();
  const reading = plan.steps.find((step) => step.kind === "read")!;
  await page.getByTestId("complete-plan-step-" + reading.id).click();
  await expect
    .poll(
      async () =>
        !!(await saved(page)).plans
          ?.find((item) => item.id === plan.id)
          ?.steps.find((step) => step.id === reading.id)?.completedAt,
    )
    .toBe(true);
  const mock = plan.steps.find((step) => step.kind === "mock")!;
  await page.getByTestId("start-plan-step-" + mock.id).click();
  await expect(page).toHaveURL(/mode=exam/);
  await expect(page.getByTestId("exam-timer")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Un petit indice/ }),
  ).toHaveCount(0);
  const series = (await saved(page)).series.find(
    (series) => series.id === mock.seriesId,
  )!;
  await page
    .getByTestId("choice-" + series.questions[0].correctChoiceId)
    .waitFor();
  await capture(page, testInfo, "enfant-controle-blanc");
  for (const question of series.questions) {
    await page.getByTestId("choice-" + question.correctChoiceId).click();
    await page.getByTestId("verify-answer").click();
    await expect(
      page.getByText(question.explanation, { exact: true }),
    ).toHaveCount(0);
    await page.getByTestId("next-question").click();
  }
  await expect(page.getByTestId("exercise-result")).toBeVisible();
  await expect(page.getByTestId("exercise-score")).toHaveText(
    `${series.questions.length} / ${series.questions.length}`,
  );
  await expect
    .poll(
      async () =>
        !!(await saved(page)).plans
          ?.find((item) => item.id === plan.id)
          ?.steps.find((step) => step.id === mock.id)?.completedAt,
    )
    .toBe(true);
  await capture(page, testInfo, "enfant-bilan-controle");
  await page.goto("/parent/controls");
  await page
    .getByRole("button", { name: "Modifier le plan " + title, exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Nouvelle date du contrôle", exact: true })
    .fill(futureDate(7));
  await page
    .getByRole("button", {
      name: "Répartir les séances restantes",
      exact: true,
    })
    .click();
  await expect
    .poll(
      async () =>
        (await saved(page)).plans?.find((item) => item.id === plan.id)
          ?.examDate,
    )
    .toBe(futureDate(7));
  const reported = (await saved(page)).plans!.find(
    (item) => item.id === plan.id,
  )!;
  expect(
    reported.steps.find((step) => step.id === reading.id)?.completedAt,
  ).toBeTruthy();
  expect(
    reported.steps.find((step) => step.id === mock.id)?.completedAt,
  ).toBeTruthy();
  expect(reported.status).toBe("draft");
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
        (await saved(page)).plans?.find((item) => item.id === plan.id)?.status,
    )
    .toBe("published");
});

test("conserver le brouillon anglais, relire les listes puis apprendre avec cartes, audio et quiz", async ({
  page,
}, testInfo) => {
  test.setTimeout(60000);
  await page.goto("/parent/english");
  await page.getByTestId("english-word-en").fill("lighthouse");
  await page.getByTestId("english-word-fr").fill("phare");
  await page.getByTestId("add-english-word").click();
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const raw = localStorage.getItem("revizo.english-editor.alex");
        return raw
          ? JSON.parse(raw).words.some(
              (word: { en: string }) => word.en === "lighthouse",
            )
          : false;
      }),
    )
    .toBe(true);
  expect(
    (await saved(page)).english?.words.some(
      (word) => word.en === "lighthouse",
    ) ?? false,
  ).toBe(false);
  await page.reload();
  await expect
    .poll(() =>
      page
        .getByRole("textbox")
        .evaluateAll((inputs) =>
          inputs.some(
            (input) =>
              input instanceof HTMLInputElement && input.value === "lighthouse",
          ),
        ),
    )
    .toBe(true);
  await page.getByTestId("english-word-en").fill("harbour");
  await page.getByTestId("english-word-fr").fill("port");
  await page.getByTestId("add-english-word").click();
  await page.getByTestId("english-verb-base").fill("swim");
  await page.getByTestId("english-verb-past").fill("swam");
  await page.getByTestId("english-verb-participle").fill("swum");
  await page.getByTestId("english-verb-meaning").fill("nager");
  await page.getByTestId("add-english-verb").click();
  const past = page.getByTestId("english-tense-past-simple");
  if ((await past.getAttribute("aria-checked")) !== "true") await past.click();
  await page.getByTestId("preview-english").click();
  await expect(page.getByTestId("publish-english")).toBeDisabled();
  await page
    .getByRole("button", {
      name: "Confirmer la relecture du répertoire anglais",
      exact: true,
    })
    .click();
  await page.getByTestId("publish-english").click();
  await expect
    .poll(async () =>
      (await saved(page)).english?.words.some(
        (word) => word.en === "lighthouse",
      ),
    )
    .toBe(true);
  await expect
    .poll(
      async () =>
        (await saved(page)).series.find(
          (series) => series.id === "english-repertoire-practice",
        )?.status,
    )
    .toBe("published");
  await page
    .getByRole("heading", { name: "Son répertoire d’anglais", exact: true })
    .scrollIntoViewIfNeeded();
  await capture(page, testInfo, "parent-repertoire-anglais");
  await page.goto("/student/english");
  await page.getByRole("button", { name: "Mes mots", exact: true }).click();
  const card = page.getByTestId("english-flashcard");
  const wordCount = (await saved(page)).english!.words.length;
  for (
    let index = 0;
    index < wordCount &&
    !((await card.textContent()) ?? "").includes("lighthouse");
    index++
  )
    await page.getByRole("button", { name: "Suivante", exact: true }).click();
  await expect(card).toContainText("lighthouse");
  await card.click();
  await expect(card).toContainText("phare");
  await page.getByTestId("speak-english-word").click();
  if (
    await page.evaluate(
      () =>
        !!window.speechSynthesis &&
        typeof SpeechSynthesisUtterance !== "undefined",
    )
  ) {
    await expect
      .poll(() =>
        page.evaluate(() => sessionStorage.getItem("revizo.test.spoken")),
      )
      .toBe("lighthouse|en-GB");
  } else {
    await expect(
      page.getByText(
        "La lecture audio est indisponible sur cet appareil. Tu peux continuer avec les cartes écrites.",
        { exact: true },
      ),
    ).toBeVisible();
  }
  await capture(page, testInfo, "enfant-carte-anglais");
  await page.getByTestId("start-english-quiz").click();
  const series = (await saved(page)).series.find(
    (series) => series.id === "english-repertoire-practice",
  )!;
  for (const question of series.questions) {
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
    await page.getByTestId("next-question").click();
  }
  await expect(page.getByTestId("exercise-score")).toHaveText(
    `${series.questions.length} / ${series.questions.length}`,
  );
  await capture(page, testInfo, "enfant-bilan-anglais");
});
