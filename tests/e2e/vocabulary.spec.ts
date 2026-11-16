import { expect, test, type Page, type TestInfo } from "@playwright/test";
import type { LearningData, VocabularyLanguage } from "../../src/domain/model";

const storageKey = "revizo.learning.v1";
async function saved(page: Page): Promise<LearningData> {
  return page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) || "{}"),
    storageKey,
  );
}
async function capture(page: Page, info: TestInfo, name: string) {
  await page.getByRole("main").evaluate((element) => {
    for (
      let parent = element.parentElement;
      parent;
      parent = parent.parentElement
    )
      parent.scrollTop = 0;
  });
  const path = info.outputPath(name + ".png");
  await page.screenshot({ path, fullPage: true });
  await info.attach(name, { path, contentType: "image/png" });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const small = await page.getByRole("button").evaluateAll((elements) =>
    elements
      .filter((element) => {
        const box = element.getBoundingClientRect();
        return box.width && box.height && (box.width < 44 || box.height < 44);
      })
      .map((element) => element.textContent),
  );
  expect(small).toEqual([]);
}
async function answer(page: Page, value: string) {
  await page.getByTestId("vocabulary-answer").fill(value);
  await page.getByTestId("vocabulary-check").click();
  await expect(page.getByTestId("vocabulary-feedback")).toBeVisible();
  await page.getByTestId("vocabulary-next").click();
}
async function createList(
  page: Page,
  language: VocabularyLanguage,
  title: string,
  term: string,
  translation: string,
) {
  await page.goto(`/parent/vocabulary?language=${language}`);
  await page.getByTestId("add-vocabulary-list").click();
  await page.getByTestId("vocabulary-title").fill(title);
  await page.getByTestId("vocabulary-term-0").fill(term);
  await page.getByTestId("vocabulary-translation-0").fill(translation);
}
for (const language of [
  { id: "english", term: "castle", translation: "château" },
  { id: "spanish", term: "árbol", translation: "arbre" },
  { id: "latin", term: "aqua", translation: "eau" },
] as const) {
  test(`${language.id} : publier, reprendre et suivre le vocabulaire dans les deux sens`, async ({
    page,
  }, info) => {
    test.setTimeout(60000);
    await page.addInitScript(() => localStorage.setItem("revizo.mode", "demo"));
    const title = `Ma liste de ${language.id}`;
    await createList(
      page,
      language.id,
      title,
      language.term,
      language.translation,
    );
    const editorURL = page.url();
    await page.reload();
    await expect(page.getByTestId("vocabulary-term-0")).toHaveValue(
      language.term,
    );
    await page.getByTestId("save-vocabulary-draft").click();
    await expect
      .poll(
        async () =>
          (await saved(page)).vocabularyLists?.find(
            (list) => list.title === title,
          )?.status,
      )
      .toBe("draft");
    await page.goto(`/student/vocabulary?language=${language.id}`);
    await expect(page.getByText(title, { exact: true })).toHaveCount(0);
    await page.goto(editorURL);
    await page.getByTestId("publish-vocabulary-list").click();
    await expect
      .poll(
        async () =>
          (await saved(page)).vocabularyLists?.find(
            (list) => list.title === title,
          )?.status,
      )
      .toBe("published");
    const list = (await saved(page)).vocabularyLists!.find(
      (list) => list.title === title,
    )!;
    await capture(page, info, "parent-liste-publiee");
    await page.goto(`/student/subject/${language.id}`);
    await page.getByTestId("subject-vocabulary").click();
    await page
      .getByRole("button", { name: `Ouvrir la liste ${title}`, exact: true })
      .click();
    const word = page.getByTestId(`vocabulary-word-${list.words[0].id}`);
    await expect(word).toContainText("À découvrir");
    await page.getByTestId("start-vocabulary").click();
    await page.getByTestId("vocabulary-check").click();
    await expect(page.getByTestId("vocabulary-answer-error")).toContainText(
      "Écris une traduction",
    );
    await page.getByTestId("vocabulary-answer").fill("inconnu");
    await page.getByTestId("vocabulary-check").click();
    await expect(page.getByTestId("vocabulary-feedback")).toContainText(
      language.translation,
    );
    await capture(page, info, "enfant-correction-vocabulaire");
    await page.goto("/student");
    await expect(page.getByTestId("start-next-session")).toHaveText("Reprendre ma séance");
    await page.getByTestId("start-next-session").click();
    await expect(page.getByTestId("vocabulary-prompt")).toHaveText(
      language.translation,
    );
    await answer(page, language.term);
    await expect(page.getByTestId("vocabulary-score")).toHaveText("1 / 2");
    const summaryUrl = page.url();
    for (const route of ["/parent/progress", "/student/progress"]) {
      await page.goto(route);
      await expect(page.getByTestId("vocabulary-activity")).toContainText("1 mot travaillé");
    }
    await page.goto(summaryUrl);
    await page.getByTestId("vocabulary-back-to-list").click();
    await expect(word).toContainText("À revoir");
    for (let round = 0; round < 2; round++) {
      await page.getByTestId("start-vocabulary").click();
      await answer(page, language.translation);
      await answer(page, language.term);
      await page.getByTestId("vocabulary-back-to-list").click();
    }
    await expect(word.getByText("Connu", { exact: true })).toBeVisible();
    await expect(page.getByTestId("review-vocabulary")).toBeDisabled();
    await page.getByTestId("vocabulary-filter-known").click();
    await expect(word).toBeVisible();
    await capture(page, info, "enfant-mot-connu");
    await page.getByTestId("vocabulary-filter-review").click();
    await expect(
      page.getByText("Aucun mot dans cette catégorie", { exact: true }),
    ).toBeVisible();
    await page.goto(editorURL);
    await expect(page.getByText("Connu", { exact: true })).toBeVisible();
  });
}

test("annoncer le pronom ou l’article avant la réponse et montrer la traduction complète", async ({
  page,
}, info) => {
  await page.addInitScript(() => localStorage.setItem("revizo.mode", "demo"));
  await createList(page, "spanish", "Verbes et noms", "hablo", "je parle");
  await page.getByTestId("add-vocabulary-word").click();
  await page.getByTestId("vocabulary-term-1").fill("la brújula");
  await page.getByTestId("vocabulary-translation-1").fill("la boussole");
  const editor = page.url();
  await page.getByTestId("publish-vocabulary-list").click();

  async function start() {
    await page.goto("/student/vocabulary?language=spanish");
    await page
      .getByRole("button", { name: "Ouvrir la liste Verbes et noms" })
      .click();
    await page.getByTestId("vocabulary-mode-from-french").click();
    await page.getByTestId("start-vocabulary").click();
  }
  await start();
  await expect(
    page.getByText("Tu peux écrire le pronom sujet ou le laisser de côté."),
  ).toBeVisible();
  await page.getByTestId("vocabulary-answer").fill("hablo");
  await page.getByTestId("vocabulary-check").click();
  const feedback = page.getByTestId("vocabulary-feedback");
  await expect(feedback).toContainText("Bien joué");
  await expect(feedback).toContainText("yo hablo");
  await page.getByTestId("vocabulary-next").click();
  await expect(
    page.getByText("Tu peux écrire le nom avec ou sans son article."),
  ).toBeVisible();
  await answer(page, "brújula");
  await expect(page.getByTestId("vocabulary-score")).toHaveText("2 / 2");
  await expect(
    page.getByText("Traduction : la brújula", { exact: true }),
  ).toBeVisible();

  await page.goto(editor);
  await page
    .getByRole("button", { name: "Exiger l’article pour réviser le genre" })
    .click();
  await page.getByTestId("publish-vocabulary-list").click();
  await start();
  await answer(page, "yo hablo");
  await expect(
    page.getByText("Écris le nom avec son article défini."),
  ).toBeVisible();
  await capture(page, info, "consigne-article");
  await answer(page, "brújula");
  await expect(page.getByTestId("vocabulary-score")).toHaveText("1 / 2");
});

test("en famille, synchroniser le suivi enfant vers le parent et isoler un autre profil", async ({
  browser,
  page,
  baseURL,
}, info) => {
  test.setTimeout(60000);
  expect((await page.request.post("/__test/reset")).ok()).toBe(true);
  const setup = await page.request.post("/api/setup", {
    data: {
      parentName: "Parent",
      email: "vocab@example.test",
      password: "Vocabulaire-test-42!",
      childName: "Camille",
      grade: "5e",
      pin: "4268",
    },
  });
  expect(setup.ok(), await setup.text()).toBe(true);
  const profileId = (await setup.json()).profiles[0].id;
  await createList(page, "latin", "Les mots du chapitre", "rosa", "rose");
  await page.getByTestId("publish-vocabulary-list").click();
  await expect
    .poll(async () => {
      const result = await page.request.get(`/api/data?profileId=${profileId}`);
      return ((await result.json()).data as LearningData).vocabularyLists?.some(
        (list) =>
          list.title === "Les mots du chapitre" && list.status === "published",
      );
    })
    .toBe(true);
  const parentURL = page.url();
  const context = await browser.newContext({ baseURL });
  try {
    const login = await context.request.post("/api/child-login", {
      data: { profileId, pin: "4268" },
    });
    expect(login.ok(), await login.text()).toBe(true);
    const child = await context.newPage();
    await child.goto("/student/vocabulary?language=latin");
    await child
      .getByRole("button", {
        name: "Ouvrir la liste Les mots du chapitre",
        exact: true,
      })
      .click();
    for (let round = 0; round < 2; round++) {
      await child.getByTestId("start-vocabulary").click();
      await answer(child, "rose");
      await answer(child, "rosa");
      await child.getByTestId("vocabulary-back-to-list").click();
    }
    await expect
      .poll(async () => {
        const result = await page.request.get(
          `/api/data?profileId=${profileId}`,
        );
        return (
          (await result.json()).data as LearningData
        ).vocabularySessions?.filter((session) => session.completedAt).length;
      })
      .toBe(2);
    await page.goto(parentURL);
    await expect(page.getByText("Connu", { exact: true })).toBeVisible();
    await capture(page, info, "parent-suivi-familial-vocabulaire");
    const another = await page.request.post("/api/profiles", {
      data: { name: "Autre enfant", grade: "6e", pin: "1234" },
    });
    const otherId = (await another.json()).profile.id;
    const untouched = await page.request.get(`/api/data?profileId=${otherId}`);
    const otherData = (await untouched.json()).data as LearningData;
    expect(otherData.vocabularyLists ?? []).toEqual([]);
    expect(otherData.vocabularySessions ?? []).toEqual([]);
  } finally {
    await context.close();
  }
});

test.describe("sur téléphone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });
  test("ajouter plusieurs mots, voir une erreur de publication et garder la correction accessible", async ({
    page,
  }, info) => {
    await page.addInitScript(() => localStorage.setItem("revizo.mode", "demo"));
    await page.goto("/parent/vocabulary?language=spanish");
    await expect(
      page.getByRole("button", { name: "Changer de matière : Espagnol (LV2)" }),
    ).toBeInViewport();
    await page.getByTestId("add-vocabulary-list").click();
    await page.getByTestId("vocabulary-title").fill("Vocabulaire du quotidien");
    await page.getByTestId("publish-vocabulary-list").click();
    await expect(
      page.getByText(
        "Complétez chaque mot et sa traduction avant de publier.",
        { exact: true },
      ),
    ).toBeInViewport();
    await page
      .getByRole("button", { name: "Coller une liste", exact: true })
      .click();
    await page
      .getByRole("textbox", {
        name: "Une paire par ligne : mot = traduction",
        exact: true,
      })
      .fill("casa = maison\nlibro = livre");
    await page
      .getByRole("button", { name: "Ajouter ces mots", exact: true })
      .click();
    await expect(page.getByTestId("vocabulary-term-1")).toHaveValue("libro");
    await page.getByTestId("publish-vocabulary-list").click();
    await capture(page, info, "mobile-parent-vocabulaire");
    await page.goto("/student/vocabulary?language=spanish");
    await page
      .getByRole("button", {
        name: "Ouvrir la liste Vocabulaire du quotidien",
        exact: true,
      })
      .click();
    await page.getByTestId("vocabulary-mode-to-french").click();
    await page.getByTestId("start-vocabulary").click();
    await page.getByTestId("vocabulary-answer").fill("maison");
    await page.getByTestId("vocabulary-check").click();
    await expect(page.getByTestId("vocabulary-feedback")).toBeInViewport();
    await expect(page.getByTestId("vocabulary-next")).toBeInViewport();
    await capture(page, info, "mobile-enfant-correction");
  });
});

test("modifier et supprimer le vocabulaire migré actualise les anciennes cartes sans perdre les verbes", async ({
  page,
}) => {
  const { initialData } = await import("../../src/domain/fixtures");
  const seed: LearningData = JSON.parse(JSON.stringify(initialData));
  delete seed.vocabularyLists;
  seed.english = {
    words: [{ id: "legacy-castle", en: "castle", fr: "château" }],
    verbs: [
      {
        id: "go",
        base: "go",
        past: "went",
        participle: "gone",
        meaning: "aller",
      },
    ],
    tenses: ["past-simple"],
    toolWords: ["the"],
  };
  await page.addInitScript(
    ({ seed, key }) => {
      localStorage.setItem("revizo.mode", "demo");
      if (!localStorage.getItem(key))
        localStorage.setItem(key, JSON.stringify(seed));
    },
    { seed, key: storageKey },
  );
  await page.goto("/parent/english");
  await expect(
    page.getByRole("textbox", { name: "Traduction du mot 1", exact: true }),
  ).toHaveValue("château");
  const editor = "/parent/vocabulary/english-repertoire-vocabulary";
  await page.goto(editor);
  await page.getByTestId("vocabulary-translation-0").fill("forteresse");
  await page.getByTestId("publish-vocabulary-list").click();
  await expect
    .poll(async () => (await saved(page)).english?.words[0].fr)
    .toBe("forteresse");
  expect(
    (await saved(page)).courses.find(
      (course) => course.id === "english-repertoire-course",
    )?.sections[0].content,
  ).toContain("forteresse");
  await page.goto("/parent/english");
  await expect(
    page.getByRole("textbox", { name: "Traduction du mot 1", exact: true }),
  ).toHaveValue("forteresse");
  await page.goto("/student/english");
  await expect(page.getByTestId("english-flashcard")).toContainText("castle");
  await page.getByTestId("english-flashcard").click();
  await expect(page.getByTestId("english-flashcard")).toContainText(
    "forteresse",
  );
  await page.goto(editor);
  await page
    .getByRole("button", { name: "Supprimer cette liste", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Confirmer la suppression de la liste",
      exact: true,
    })
    .click();
  await expect
    .poll(async () => (await saved(page)).english?.words.length)
    .toBe(0);
  expect((await saved(page)).english?.verbs[0].base).toBe("go");
  expect((await saved(page)).english?.tenses).toEqual(["past-simple"]);
  expect((await saved(page)).english?.toolWords).toEqual(["the"]);
  expect(
    (await saved(page)).vocabularyLists?.some(
      (list) => list.id === "english-repertoire-vocabulary",
    ),
  ).toBe(false);
  await page.goto("/parent/english");
  await expect(
    page.getByRole("textbox", { name: "Traduction du mot 1", exact: true }),
  ).toHaveCount(0);
  await page.goto("/student/english");
  await expect(page.getByTestId("english-flashcard")).toContainText("go");
  await expect(page.getByTestId("english-flashcard")).not.toContainText(
    "castle",
  );
});

test("répertoire général sur iPad : archiver, chercher, réviser et reprendre", async ({
  page,
}, info) => {
  const { initialData } = await import("../../src/domain/fixtures");
  const seed = {
    ...initialData,
    vocabularyLists: [
      {
        id: "home",
        language: "english",
        title: "La maison",
        status: "published",
        words: [{ id: "w", term: "window", translation: "fenêtre" }],
      },
      {
        id: "school",
        language: "english",
        title: "À l’école",
        status: "published",
        words: [
          { id: "another", term: "window", translation: "fenêtre" },
          { id: "d", term: "desk", translation: "bureau" },
          { id: "c", term: "chair", translation: "chaise" },
        ],
      },
    ],
  };
  await page.addInitScript(
    ({ seed, key }) => {
      localStorage.setItem("revizo.mode", "demo");
      if (!localStorage.getItem(key))
        localStorage.setItem(key, JSON.stringify(seed));
    },
    { seed, key: storageKey },
  );
  await page.goto("/parent/vocabulary/home");
  await expect(
    page.getByTestId("vocabulary-publication-preview"),
  ).toContainText("1 déjà");
  await page.getByRole("button", { name: "Archiver la liste publiée" }).click();
  await expect
    .poll(
      async () =>
        (await saved(page)).vocabularyLists?.find((l) => l.id === "home")
          ?.archived,
    )
    .toBe(true);
  await page.goto("/student/subject/english");
  await page.getByTestId("subject-vocabulary").click();
  await expect(page.getByTestId("vocabulary-list-home")).toHaveCount(0);
  await expect(page.getByTestId("vocabulary-list-school")).toBeVisible();
  await capture(page, info, "accueil-repertoire");
  await page
    .getByRole("button", { name: "Tous mes mots", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Chercher un mot ou une traduction" })
    .fill("fenêtre");
  await expect(page.getByText("window", { exact: true })).toHaveCount(1);
  await page
    .getByRole("button", { name: "Mon vocabulaire", exact: true })
    .click();
  await page.getByTestId("general-vocabulary-review").click();
  const first = await page.getByTestId("vocabulary-prompt").innerText();
  await answer(page, "erreur");
  await page
    .getByRole("button", { name: "Quitter et garder ma place" })
    .click();
  await expect(page).toHaveURL(/\/student\/vocabulary\?language=english/);
  await page.reload();
  await page.getByRole("button", { name: "Reprendre ma révision" }).click();
  const translations: Record<string, string> = {
    window: "fenêtre",
    desk: "bureau",
    chair: "chaise",
  };
  for (let i = 0; i < 3; i++) {
    const word = await page.getByTestId("vocabulary-prompt").innerText();
    if (i === 2) expect(word).toBe(first);
    await answer(page, translations[word]);
  }
  await expect(page.getByTestId("vocabulary-score")).toHaveText("3 / 4");
  await page.getByTestId("vocabulary-back-to-list").click();
  await page
    .getByRole("button", { name: "Tous mes mots", exact: true })
    .click();
  await expect(page.getByText("À revoir", { exact: true })).toHaveCount(1);
  await capture(page, info, "suivi-repertoire");
});
