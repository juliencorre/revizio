import { expect, test, type Page, type TestInfo } from "@playwright/test";

const bePresent: Record<string, string> = {
  I: "am",
  You: "are",
  He: "is",
  She: "is",
  It: "is",
  We: "are",
  They: "are",
};

async function capture(page: Page, info: TestInfo, name: string) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const path = info.outputPath(name + ".png");
  await page.screenshot({ path, animations: "disabled" });
  await info.attach(name, { path, contentType: "image/png" });
}

async function readQuestion(page: Page) {
  const prompt = page.getByTestId("conjugation-prompt");
  await expect(prompt).toHaveText(/^(I|You|He|She|It|We|They) ___$/);
  const pronoun = (await prompt.innerText()).split(" ")[0];
  let person = pronoun;
  if (pronoun === "You") {
    const hint = page
      .getByTestId("conjugation-exercise")
      .getByText(/^(Tu|Vous)$/);
    await expect(hint).toBeVisible();
    person = await hint.innerText();
  }
  return { person, pronoun, form: bePresent[pronoun] };
}

test("publier be au présent, écouter la fiche et reprendre les personnes à revoir", async ({
  page,
}, info) => {
  test.setTimeout(60000);
  await page.addInitScript(() => {
    localStorage.setItem("revizo.mode", "demo");
    if (
      window.speechSynthesis &&
      typeof SpeechSynthesisUtterance !== "undefined"
    ) {
      const prototype = Object.getPrototypeOf(window.speechSynthesis);
      Object.defineProperty(prototype, "speak", {
        configurable: true,
        value: (utterance: SpeechSynthesisUtterance) => {
          sessionStorage.setItem(
            "conjugation-test-audio",
            utterance.text + "|" + utterance.lang,
          );
          utterance.dispatchEvent(new Event("start"));
          utterance.dispatchEvent(new Event("end"));
        },
      });
      Object.defineProperty(prototype, "cancel", {
        configurable: true,
        value: () => undefined,
      });
    }
  });

  await page.goto("/student/subject/english");
  await page.getByTestId("subject-conjugation").click();
  await expect(
    page.getByText("Tes fiches de conjugaison arriveront ici"),
  ).toBeVisible();
  await page.goto("/parent/subject/english");
  await page.getByRole("tab", { name: "Conjugaison" }).click();
  await page.getByRole("button", { name: "Préparer la conjugaison" }).click();

  const add = page.getByTestId("add-conjugation-sheet");
  const verb = page.getByTestId("conjugation-verb");
  const tense = page.getByTestId("conjugation-tense");
  const iForm = page.getByTestId("conjugation-form-I");
  await verb.click();
  await page.getByTestId("conjugation-option-have").click();
  await expect(iForm).toHaveText("I have");
  await verb.click();
  await page.getByTestId("conjugation-option-be").click();
  await tense.click();
  await expect(
    page.getByTestId("conjugation-option-present-continuous"),
  ).toHaveCount(0);
  await page.getByTestId("conjugation-option-past-simple").click();
  await expect(iForm).toHaveText("I was");
  await tense.click();
  await page.getByTestId("conjugation-option-present-simple").click();
  await expect(iForm).toHaveText("I am");
  for (const control of [add, verb, tense]) {
    const bounds = (await control.boundingBox())!;
    expect(Math.min(bounds.width, bounds.height)).toBeGreaterThanOrEqual(44);
  }
  await capture(page, info, "parent-fiche-be");
  await add.click();
  await expect(add).toBeDisabled();

  await page.goto("/student/subject/english");
  await page.getByTestId("subject-conjugation").click();
  const table = page.getByTestId("conjugation-table");
  await expect(table.getByRole("button")).toHaveCount(8);
  await expect(
    table.getByRole("button", { name: "Écouter you are, au pluriel" }),
  ).toBeVisible();
  const listen = table.getByRole("button", {
    name: "Écouter I am",
    exact: true,
  });
  await capture(page, info, "enfant-fiche-be");
  await listen.click();
  if (
    await page.evaluate(
      () =>
        !!window.speechSynthesis &&
        typeof SpeechSynthesisUtterance !== "undefined",
    )
  ) {
    await expect
      .poll(() =>
        page.evaluate(() => sessionStorage.getItem("conjugation-test-audio")),
      )
      .toBe("I am|en-GB");
  } else {
    await expect(
      page.getByText("La lecture audio est indisponible sur cet appareil."),
    ).toBeVisible();
  }

  const practice = page.getByTestId("conjugation-practice");
  const answer = page.getByTestId("conjugation-answer");
  const check = page.getByTestId("conjugation-check");
  const correction = page.getByTestId("conjugation-correction");
  const next = page.getByTestId("conjugation-next");
  await practice.click();
  await expect(table).toHaveCount(0);
  await expect(check).toBeDisabled();
  const first = await readQuestion(page);
  await answer.fill("wrong");
  await check.click();
  await expect(correction).toHaveText(first.pronoun + " " + first.form);
  await capture(page, info, "enfant-correction-be");
  await next.click();
  const second = await readQuestion(page);
  await page.reload();
  await expect(
    page.getByText("Personne 2 sur 8", { exact: true }),
  ).toBeVisible();
  expect(await readQuestion(page)).toEqual(second);
  await page.goto("/student");
  await expect(page.getByTestId("next-study-session")).toContainText(
    "be · Présent simple",
  );
  await page.getByTestId("start-next-session").click();
  await expect(
    page.getByText("Personne 2 sur 8", { exact: true }),
  ).toBeVisible();
  expect(await readQuestion(page)).toEqual(second);

  const initialPersons = [first.person];
  for (let index = 2; index <= 8; index++) {
    const question = await readQuestion(page);
    initialPersons.push(question.person);
    await answer.fill(question.form);
    await check.click();
    await expect(correction).toHaveText(question.pronoun + " " + question.form);
    await next.click();
  }
  expect(initialPersons.sort()).toEqual(
    ["I", "Tu", "He", "She", "It", "We", "Vous", "They"].sort(),
  );
  await expect(
    page.getByText("À revoir 1 sur 1", { exact: true }),
  ).toBeVisible();
  expect(await readQuestion(page)).toEqual(first);
  await answer.fill(first.form);
  await check.click();
  await next.click();
  await expect(page.getByTestId("conjugation-finished")).toContainText(
    "7 sur 8",
  );

  const finishedSession = page.url();
  await page.goto("/parent/subject/english?tab=conjugaison");
  await page
    .getByRole("button", { name: "be · Présent simple", exact: true })
    .click();
  await expect(add).toBeDisabled();
  await page.getByTestId("remove-conjugation-be-present-simple").click();
  await expect(add).toBeEnabled();
  await page.goto(finishedSession);
  await expect(page.getByText("Cette fiche est indisponible")).toBeVisible();
  await expect(page.getByTestId("conjugation-table")).toHaveCount(0);
});
