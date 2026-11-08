import {
  expect,
  test,
  type APIRequestContext,
  type APIResponse,
  type Page,
  type TestInfo,
} from "@playwright/test";
import sharp from "sharp";
import type {
  AiJob,
  Attempt,
  Course,
  ExerciseSeries,
  EnglishSettings,
  LearningData,
  SessionUser,
} from "../../src/domain/model";
import { questionError } from "../../src/domain/learning";

type Snapshot = { data: LearningData; revision: number };
const formats = [
  "single-choice",
  "true-false",
  "fill-blank",
  "short-answer",
  "problem",
] as const;

/** This is a printed stimulus, not OCR text injected into the app or the model. */
async function printedCourse() {
  return sharp(
    Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="1500" height="850"><rect width="1500" height="850" fill="white"/><g fill="black" font-family="DejaVu Sans" font-size="36"><text x="70" y="90">LES NOMBRES RELATIFS</text><text x="70" y="170">Un nombre relatif est positif, negatif ou nul.</text><text x="70" y="250">Meme signe : additionner les distances a zero</text><text x="70" y="310">et garder le signe commun.</text><text x="70" y="390">Exemple : (-3) + (-4) = -7.</text><text x="70" y="470">Signes contraires : soustraire les distances a zero</text><text x="70" y="530">et garder le signe du nombre le plus eloigne de zero.</text><text x="70" y="610">Exemple : (-8) + (+5) = -3.</text></g></svg>',
    ),
  )
    .png()
    .toBuffer();
}
async function json<T>(
  response: Pick<APIResponse, "ok" | "status" | "text" | "json">,
  label: string,
): Promise<T> {
  if (!response.ok())
    throw new Error(
      `${label} : HTTP ${response.status()} — ${await response.text()}`,
    );
  return response.json() as Promise<T>;
}
async function snapshot(api: APIRequestContext, profileId: string) {
  return json<Snapshot>(
    await api.get("/api/data?profileId=" + encodeURIComponent(profileId)),
    "Lecture du profil de test",
  );
}
async function attachJson(info: TestInfo, name: string, value: unknown) {
  await info.attach(name, {
    body: Buffer.from(JSON.stringify(value, null, 2)),
    contentType: "application/json",
  });
}
async function capture(page: Page, info: TestInfo, name: string) {
  const path = info.outputPath(name + ".png");
  await page.screenshot({ path, fullPage: true });
  await info.attach(name, { path, contentType: "image/png" });
}
async function createdJob(
  page: Page,
  kind: AiJob["kind"],
  activate?: () => Promise<unknown>,
) {
  const [response] = await Promise.all([
    page.waitForResponse(
      (result) =>
        result.request().method() === "POST" &&
        new URL(result.url()).pathname === "/api/ai/" + kind,
      { timeout: 60_000 },
    ),
    activate
      ? activate()
      : page
          .getByTestId(
            kind === "course" ? "ai-generate-course" : "ai-generate-exercises",
          )
          .click(),
  ]);
  const { job } = await json<{ job: AiJob }>(
    response,
    "Création de la préparation " + kind,
  );
  expect(
    job.id,
    "Le serveur doit identifier la préparation réelle",
  ).toBeTruthy();
  expect(job.kind).toBe(kind);
  return job;
}
async function finishedJob(
  page: Page,
  info: TestInfo,
  initial: AiJob,
  deadline: number,
): Promise<AiJob> {
  let previous = "";
  let last = initial;
  while (Date.now() < deadline) {
    const { job } = await json<{ job: AiJob }>(
      await page.request.get("/api/jobs/" + encodeURIComponent(initial.id)),
      "Suivi de la préparation " + initial.id,
    );
    last = job;
    const progress = [job.status, job.stage, job.message].join(" · ");
    if (progress !== previous) {
      console.log("Ollama navigateur :", progress);
      previous = progress;
    }
    if (job.status === "failed") {
      await attachJson(info, "echec-job-" + job.id, job);
      throw new Error(
        `La préparation ${job.kind} ${job.id} a échoué : ${job.error || job.message || "erreur sans détail"}`,
      );
    }
    if (job.status === "succeeded") {
      await attachJson(info, "job-" + job.kind, job);
      return job;
    }
    await page.waitForTimeout(1500);
  }
  await attachJson(info, "job-hors-delai-" + last.id, last);
  throw new Error(
    `La préparation ${last.id} a dépassé le délai : ${last.stage || last.status} — ${last.message || "sans progression"}`,
  );
}

test("Ollama réel : photo, fiche relue, cinq formats et séance enfant", async ({
  page,
}, info) => {
  test.skip(
    process.env.REVIZIO_LIVE_AI !== "1",
    "Campagne IA réelle sur demande : REVIZIO_LIVE_AI=1.",
  );
  test.skip(
    info.project.name !== "tablet-landscape",
    "La campagne Ollama réelle s’exécute uniquement sur tablet-landscape.",
  );
  test.setTimeout(600_000);
  // Leave a minute for publication, child login and the five answers.
  const aiDeadline = Date.now() + 540_000;
  const reset = await page.request.post("/__test/reset");
  expect(reset.ok(), "Le backend jetable doit être réinitialisé").toBe(true);
  const health = await json<{
    ai: { available: boolean; model: string };
    needsSetup: boolean;
  }>(await page.request.get("/api/health"), "Disponibilité du vrai service IA");
  expect(
    health.ai.available,
    "REVIZIO_LIVE_AI=1 exige un modèle Ollama réellement disponible ; aucun substitut n’est utilisé.",
  ).toBe(true);
  expect(health.needsSetup).toBe(true);
  info.annotations.push({
    type: "modèle Ollama réel",
    description: health.ai.model,
  });
  const setup = await json<{
    user: SessionUser;
    profiles: { id: string }[];
  }>(
    await page.request.post("/api/setup", {
      data: {
        parentName: "Parent de validation IA",
        email: "browser-live@example.test",
        password: "Validation-live-42!",
        childName: "Camille",
        grade: "5e",
        pin: "2468",
      },
    }),
    "Création de la famille de test",
  );
  expect(setup.user.role).toBe("parent");
  const profileId = setup.profiles[0].id;

  await test.step("Importer la photo et lancer la vraie lecture dans l’interface", async () => {
    await page.goto("/parent/import");
    await page
      .getByTestId("course-title")
      .fill("Les nombres relatifs — photo IA réelle");
    const chooser = page.waitForEvent("filechooser");
    await page.getByTestId("ai-import-files").click();
    await (
      await chooser
    ).setFiles({
      name: "cours-relatifs-imprime.png",
      mimeType: "image/png",
      buffer: await printedCourse(),
    });
    await expect(
      page.getByText("cours-relatifs-imprime.png", { exact: true }),
    ).toBeVisible();
    // No pasted text: the model must read the uploaded pixels.
    await expect(page.getByTestId("ai-import-text")).toHaveValue("");
    await page.getByTestId("create-course-draft").click();
    await expect(page.getByTestId("parent-review")).toBeVisible();
  });
  const courseId = new URL(page.url()).pathname.split("/").pop()!;
  const courseJob = await createdJob(page, "course");
  await expect(page.getByTestId("ai-course-progress")).toBeVisible({
    timeout: 15_000,
  });
  // Ensure the draft/job association survives the full browser reload below.
  await expect
    .poll(
      async () =>
        (await snapshot(page.request, profileId)).data.courses.find(
          (course) => course.id === courseId,
        )?.generationJobId,
      { timeout: 20_000 },
    )
    .toBe(courseJob.id);

  let course!: Course;
  await test.step("Reprendre la tâche après fermeture de son écran et rechargement", async () => {
    await page.goto("/parent/preparations");
    await page.reload();
    const done = await finishedJob(page, info, courseJob, aiDeadline);
    expect(done.result?.course?.sourceText?.toLowerCase()).toContain("relatif");
    expect(done.result?.course?.sourceText?.length).toBeGreaterThan(180);
    await expect(page.getByTestId("review-job-" + courseJob.id)).toBeVisible({
      timeout: 15_000,
    });
    await capture(page, info, "ia-reelle-preparation-retrouvee");
    await page.getByTestId("review-job-" + courseJob.id).click();
    await expect(page).toHaveURL(
      new RegExp("/parent/review/" + courseId + "(?:\\?|$)"),
    );
    await expect
      .poll(
        async () =>
          (await snapshot(page.request, profileId)).data.courses
            .find((item) => item.id === courseId)
            ?.sections.some(
              (section) =>
                section.kind === "essential" && section.content.length > 20,
            ),
        { timeout: 20_000 },
      )
      .toBe(true);
    course = (await snapshot(page.request, profileId)).data.courses.find(
      (item) => item.id === courseId,
    )!;
    expect(course.status).toBe("draft");
    expect(course.sourceText?.toLowerCase()).toContain("relatif");
    expect(course.sources[0].storageId).toBeTruthy();
    expect(course.sources[0].extractedText?.length).toBeGreaterThan(180);
    const essential = course.sections.find(
      (section) => section.kind === "essential",
    )!;
    await expect(page.getByTestId("course-content").first()).toHaveValue(
      essential.content,
    );
    await expect(page.getByTestId("ai-ocr-text-0")).toHaveValue(
      course.sources[0].extractedText!,
    );
    await expect(page.getByTestId("publish-course")).toBeDisabled();
    await attachJson(info, "fiche-ia-brouillon-ocr", course);
    await page
      .getByRole("heading", { name: "Préparer la fiche", exact: true })
      .scrollIntoViewIfNeeded();
    await capture(page, info, "ia-reelle-fiche-brouillon");
  });

  await test.step("Publier la fiche après la confirmation explicite du parent", async () => {
    await page.getByTestId("ai-course-confirm-review").click();
    await page.getByTestId("publish-course").click();
    await expect(
      page.getByRole("heading", { name: "La fiche publiée", exact: true }),
    ).toBeVisible();
    await expect
      .poll(
        async () =>
          (await snapshot(page.request, profileId)).data.courses.find(
            (item) => item.id === courseId,
          )?.status,
        { timeout: 20_000 },
      )
      .toBe("published");
  });

  let series!: ExerciseSeries;
  await test.step("Générer réellement cinq questions, une de chaque format", async () => {
    await page.goto(
      "/parent/exercises?courseId=" + encodeURIComponent(courseId),
    );
    await page
      .getByTestId("series-title")
      .fill("Les cinq formats — Ollama réel");
    for (const format of formats.slice(1))
      await page.getByTestId("ai-format-" + format).click();
    await page.getByTestId("ai-count-5").click();
    const created = await createdJob(page, "exercises");
    const done = await finishedJob(page, info, created, aiDeadline);
    expect(done.result?.questions).toHaveLength(5);
    expect(
      new Set(done.result!.questions!.map((question) => question.type)),
    ).toEqual(new Set(formats));
    for (const question of done.result!.questions!)
      expect(questionError(question)).toBeNull();
    await expect
      .poll(
        async () =>
          (await snapshot(page.request, profileId)).data.series.find(
            (item) => item.generationJobId === created.id,
          )?.id,
        { timeout: 20_000 },
      )
      .toBeTruthy();
    series = (await snapshot(page.request, profileId)).data.series.find(
      (item) => item.generationJobId === created.id,
    )!;
    expect(series.status).toBe("draft");
    expect(series.questions).toHaveLength(5);
    await expect
      .poll(() => new URL(page.url()).searchParams.get("draftId"), {
        timeout: 15_000,
      })
      .toBe(series.id);
    await page.getByTestId("preview-series").click();
    await expect(page.getByTestId("publish-series")).toBeDisabled();
    for (const question of series.questions) {
      await expect(
        page.getByText(question.prompt, { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText(question.explanation, { exact: true }),
      ).toBeVisible();
    }
    await attachJson(info, "serie-ia-brouillon-cinq-formats", series);
    await page
      .getByRole("heading", { name: "Relire la série", exact: true })
      .scrollIntoViewIfNeeded();
    await capture(page, info, "ia-reelle-serie-a-relire");
    await page.getByTestId("ai-series-confirm-review").click();
    await page.getByTestId("publish-series").click();
    await expect(
      page.getByRole("heading", { name: "La série est prête !", exact: true }),
    ).toBeVisible();
    await expect
      .poll(
        async () =>
          (await snapshot(page.request, profileId)).data.series.find(
            (item) => item.id === series.id,
          )?.status,
        { timeout: 20_000 },
      )
      .toBe("published");
  });

  await test.step("L’enfant se connecte et répond aux questions réellement présentées", async () => {
    await page.goto(
      "/auth?target=child&profileId=" + encodeURIComponent(profileId),
    );
    await page.getByTestId("auth-pin").fill("2468");
    await page.getByTestId("auth-submit").click();
    await expect(page).toHaveURL(/\/student(?:\?|$)/);
    expect(
      (
        await json<{ user: SessionUser }>(
          await page.request.get("/api/session"),
          "Session enfant",
        )
      ).user.role,
    ).toBe("child");
    const childView = (await snapshot(page.request, profileId)).data;
    expect(childView.courses.every((item) => item.status === "published")).toBe(
      true,
    );
    expect(childView.series.every((item) => item.status === "published")).toBe(
      true,
    );
    expect(
      childView.series.find((item) => item.id === series.id)?.questions,
    ).toEqual(series.questions);
    await page.goto("/student/exercise/" + encodeURIComponent(series.id));
    await expect(page.getByTestId("verify-answer")).toBeVisible();
    await expect
      .poll(
        async () =>
          (await snapshot(page.request, profileId)).data.attempts.find(
            (attempt) => attempt.seriesId === series.id,
          )?.questions.length,
        { timeout: 20_000 },
      )
      .toBe(5);
    const presented = (
      await snapshot(page.request, profileId)
    ).data.attempts.find((attempt) => attempt.seriesId === series.id)!;
    expect(presented.questions).toEqual(series.questions);
    for (const question of presented.questions) {
      await expect(
        page.getByText(question.prompt, { exact: true }),
      ).toBeVisible();
      if (
        !question.type ||
        question.type === "single-choice" ||
        question.type === "true-false"
      )
        await page.getByTestId("choice-" + question.correctChoiceId).click();
      else {
        expect(question.expectedAnswers?.length).toBeGreaterThan(0);
        await page
          .getByTestId("written-answer")
          .fill(question.expectedAnswers![0]);
      }
      await page.getByTestId("verify-answer").click();
      await expect(
        page.getByText(question.explanation, { exact: true }),
      ).toBeVisible();
      await page.getByTestId("next-question").click();
    }
    await expect(page.getByTestId("exercise-score")).toHaveText("5 / 5");
    await expect
      .poll(
        async () =>
          !!(await snapshot(page.request, profileId)).data.attempts.find(
            (attempt) => attempt.id === presented.id,
          )?.completedAt,
        { timeout: 20_000 },
      )
      .toBe(true);
    const completed: Attempt = (
      await snapshot(page.request, profileId)
    ).data.attempts.find((attempt) => attempt.id === presented.id)!;
    expect(completed.questions).toEqual(presented.questions);
    expect(completed.answers).toHaveLength(5);
    expect(completed.answers.every((answer) => answer.isCorrect)).toBe(true);
    await attachJson(info, "tentative-enfant-corrigee-serveur", completed);
    await capture(page, info, "ia-reelle-bilan-enfant");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
});

async function printedEnglishVocabulary() {
  return sharp(
    Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="1500" height="800"><rect width="1500" height="800" fill="white"/><g fill="black" font-family="DejaVu Sans"><text x="70" y="90" font-size="42">MON RÉPERTOIRE D’ANGLAIS</text><text x="70" y="170" font-size="34">MOTS : ANGLAIS — FRANÇAIS</text><text x="90" y="250" font-size="44">castle = château</text><text x="90" y="330" font-size="44">river = rivière</text><text x="70" y="440" font-size="34">VERBE IRRÉGULIER</text><g font-size="30"><text x="90" y="520">Base verbale</text><text x="440" y="520">Prétérit</text><text x="760" y="520">Participe passé</text><text x="1180" y="520">Sens</text></g><g font-size="44"><text x="90" y="610">swim</text><text x="440" y="610">swam</text><text x="760" y="610">swum</text><text x="1180" y="610">nager</text></g></g></svg>',
    ),
  )
    .png()
    .toBuffer();
}
const vocabularyOnPhoto = [
  { en: "castle", fr: "château" },
  { en: "river", fr: "rivière" },
];
const verbOnPhoto = {
  base: "swim",
  past: "swam",
  participle: "swum",
  meaning: "nager",
};
const normalizedText = (value: string) =>
  value.normalize("NFC").trim().toLocaleLowerCase("fr");

test("Ollama réel : photo de vocabulaire anglais, relecture, cartes et quiz enfant", async ({
  page,
}, info) => {
  test.skip(
    process.env.REVIZIO_LIVE_AI !== "1",
    "Campagne IA réelle sur demande : REVIZIO_LIVE_AI=1.",
  );
  test.skip(
    info.project.name !== "tablet-landscape",
    "La campagne Ollama réelle s’exécute uniquement sur tablet-landscape.",
  );
  test.setTimeout(600_000);
  const aiDeadline = Date.now() + 540_000;
  expect(
    (await page.request.post("/__test/reset")).ok(),
    "Réinitialisation du backend jetable",
  ).toBe(true);
  const health = await json<{
    ai: { available: boolean; model: string };
    needsSetup: boolean;
  }>(
    await page.request.get("/api/health"),
    "Disponibilité d’Ollama réel pour l’anglais",
  );
  expect(
    health.ai.available,
    "Le modèle Ollama réel doit être disponible ; aucune extraction simulée n’est utilisée.",
  ).toBe(true);
  expect(health.needsSetup).toBe(true);
  info.annotations.push({
    type: "modèle Ollama réel",
    description: health.ai.model,
  });
  const setup = await json<{ user: SessionUser; profiles: { id: string }[] }>(
    await page.request.post("/api/setup", {
      data: {
        parentName: "Parent anglais IA",
        email: "english-live@example.test",
        password: "English-validation-42!",
        childName: "Camille",
        grade: "5e",
        pin: "2468",
      },
    }),
    "Création de la famille pour le vocabulaire anglais",
  );
  expect(setup.user.role).toBe("parent");
  const profileId = setup.profiles[0].id;
  let extracted!: EnglishSettings;

  await test.step("Lire uniquement les pixels du document anglais et garder le résultat en brouillon", async () => {
    await page.goto("/parent/english");
    await expect(page.getByTestId("parent-english")).toBeVisible();
    await expect(page.getByTestId("english-word-en")).toHaveValue("");
    await expect(page.getByTestId("english-word-fr")).toHaveValue("");
    const created = await createdJob(page, "english", async () => {
      const chooser = page.waitForEvent("filechooser");
      await page
        .getByRole("button", { name: "Fichiers / PDF", exact: true })
        .click();
      await (
        await chooser
      ).setFiles({
        name: "vocabulaire-castle-river-swim.png",
        mimeType: "image/png",
        buffer: await printedEnglishVocabulary(),
      });
    });
    const done = await finishedJob(page, info, created, aiDeadline);
    expect(done.result?.words).toHaveLength(2);
    expect(done.result?.verbs).toHaveLength(1);
    extracted = {
      words: done.result!.words!,
      verbs: done.result!.verbs!,
      tenses: done.result?.tenses ?? [],
      toolWords: done.result?.toolWords ?? [],
    };
    expect(
      extracted.words
        .map((word) => ({
          en: normalizedText(word.en),
          fr: normalizedText(word.fr),
        }))
        .sort((a, b) => a.en.localeCompare(b.en)),
    ).toEqual(vocabularyOnPhoto);
    expect(
      Object.fromEntries(
        Object.entries(verbOnPhoto).map(([key]) => [
          key,
          normalizedText(extracted.verbs[0][key as keyof typeof verbOnPhoto]),
        ]),
      ),
    ).toEqual(verbOnPhoto);
    // Nothing is typed into vocabulary fields to repair or enrich the generated result.
    for (const [index, word] of extracted.words.entries()) {
      await expect(
        page.getByRole("textbox", {
          name: "Mot anglais " + (index + 1),
          exact: true,
        }),
      ).toHaveValue(word.en, { timeout: 20_000 });
      await expect(
        page.getByRole("textbox", {
          name: "Traduction du mot " + (index + 1),
          exact: true,
        }),
      ).toHaveValue(word.fr);
    }
    for (const [column, key] of [
      ["Base verbale", "base"],
      ["Prétérit", "past"],
      ["Participe passé", "participle"],
      ["Sens", "meaning"],
    ] as const)
      await expect(
        page.getByRole("textbox", {
          name: column + " du verbe 1",
          exact: true,
        }),
      ).toHaveValue(extracted.verbs[0][key]);
    const beforePublication = (await snapshot(page.request, profileId)).data;
    expect(beforePublication.english?.words).toEqual([]);
    expect(beforePublication.english?.verbs).toEqual([]);
    expect(
      beforePublication.courses.some(
        (course) => course.id === "english-repertoire-course",
      ),
    ).toBe(false);
    expect(
      beforePublication.series.some(
        (series) => series.id === "english-repertoire-practice",
      ),
    ).toBe(false);
    await attachJson(info, "anglais-ia-resultat-a-relire", extracted);
    await page
      .getByRole("heading", { name: "Les mots à connaître", exact: true })
      .scrollIntoViewIfNeeded();
    await capture(page, info, "anglais-ia-brouillon-lu-sur-photo");
  });

  let quiz!: ExerciseSeries;
  await test.step("Prévisualiser et publier uniquement les éléments relus par le parent", async () => {
    await page.getByTestId("preview-english").click();
    await expect(
      page.getByRole("heading", {
        name: "Quelques questions qui seront proposées",
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByTestId("publish-english")).toBeDisabled();
    await capture(page, info, "anglais-ia-apercu-avant-publication");
    await page
      .getByRole("button", {
        name: "Confirmer la relecture du répertoire anglais",
        exact: true,
      })
      .click();
    await page.getByTestId("publish-english").click();
    await expect
      .poll(
        async () =>
          (await snapshot(page.request, profileId)).data.series.find(
            (series) => series.id === "english-repertoire-practice",
          )?.status,
        { timeout: 20_000 },
      )
      .toBe("published");
    const published = (await snapshot(page.request, profileId)).data;
    expect(published.english?.words).toEqual(extracted.words);
    expect(published.english?.verbs).toEqual(extracted.verbs);
    expect(
      published.courses.find(
        (course) => course.id === "english-repertoire-course",
      )?.status,
    ).toBe("published");
    quiz = published.series.find(
      (series) => series.id === "english-repertoire-practice",
    )!;
    expect(quiz.questions.length).toBeGreaterThanOrEqual(5);
    const sourceAnswers = new Set([
      ...vocabularyOnPhoto.flatMap((word) => [word.en, word.fr]),
      ...Object.values(verbOnPhoto),
    ]);
    for (const question of quiz.questions) {
      expect(questionError(question)).toBeNull();
      const answer =
        question.choices.find(
          (choice) => choice.id === question.correctChoiceId,
        )?.label ?? question.expectedAnswers?.[0];
      expect(
        answer,
        "Le quiz doit avoir une réponse présente dans le répertoire publié",
      ).toBeTruthy();
      expect(
        sourceAnswers.has(normalizedText(answer!)),
        "La bonne réponse doit venir de la photo importée",
      ).toBe(true);
      for (const choice of question.choices)
        expect(
          sourceAnswers.has(normalizedText(choice.label)),
          "Les propositions restent dans les mots et formes de la photo",
        ).toBe(true);
    }
    await attachJson(info, "anglais-ia-repertoire-et-quiz-publies", {
      english: published.english,
      quiz,
    });
  });

  await test.step("L’enfant apprend les traductions avec les cartes puis termine le quiz", async () => {
    await page.goto(
      "/auth?target=child&profileId=" + encodeURIComponent(profileId),
    );
    await page.getByTestId("auth-pin").fill("2468");
    await page.getByTestId("auth-submit").click();
    await expect(page).toHaveURL(/\/student(?:\?|$)/);
    expect(
      (
        await json<{ user: SessionUser }>(
          await page.request.get("/api/session"),
          "Session enfant anglais",
        )
      ).user.role,
    ).toBe("child");
    await page.goto("/student/english");
    await expect(page.getByTestId("student-english")).toBeVisible();
    await page.getByRole("button", { name: "Mes mots", exact: true }).click();
    const card = page.getByTestId("english-flashcard");
    for (const word of vocabularyOnPhoto) {
      const displayedWord = extracted.words.find(
        (item) => normalizedText(item.en) === word.en,
      )!;
      for (
        let index = 0;
        index < extracted.words.length &&
        !normalizedText((await card.textContent()) ?? "").includes(word.en);
        index++
      )
        await page
          .getByRole("button", { name: "Suivante", exact: true })
          .click();
      await expect(card).toContainText(displayedWord.en);
      await card.click();
      await expect(card).toContainText(displayedWord.fr);
      await capture(page, info, "anglais-ia-carte-" + word.en);
      await page.getByRole("button", { name: "Suivante", exact: true }).click();
    }
    await page.getByRole("button", { name: "Mes verbes", exact: true }).click();
    await expect(card).toContainText(extracted.verbs[0].base);
    await card.click();
    await expect(card).toContainText(extracted.verbs[0].meaning);
    await capture(page, info, "anglais-ia-carte-verbe-swim");
    await page.getByTestId("start-english-quiz").click();
    await expect(page.getByTestId("verify-answer")).toBeVisible();
    await expect
      .poll(
        async () =>
          (await snapshot(page.request, profileId)).data.attempts.find(
            (attempt) => attempt.seriesId === quiz.id,
          )?.questions.length,
        { timeout: 20_000 },
      )
      .toBe(quiz.questions.length);
    const presented = (
      await snapshot(page.request, profileId)
    ).data.attempts.find((attempt) => attempt.seriesId === quiz.id)!;
    expect(presented.questions).toEqual(quiz.questions);
    for (const question of presented.questions) {
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
      await page.getByTestId("next-question").click();
    }
    await expect(page.getByTestId("exercise-score")).toHaveText(
      `${presented.questions.length} / ${presented.questions.length}`,
    );
    await expect
      .poll(
        async () =>
          !!(await snapshot(page.request, profileId)).data.attempts.find(
            (attempt) => attempt.id === presented.id,
          )?.completedAt,
        { timeout: 20_000 },
      )
      .toBe(true);
    const completed = (
      await snapshot(page.request, profileId)
    ).data.attempts.find((attempt) => attempt.id === presented.id)!;
    expect(completed.questions).toEqual(presented.questions);
    expect(completed.answers.every((answer) => answer.isCorrect)).toBe(true);
    await attachJson(info, "anglais-ia-tentative-enfant", completed);
    await capture(page, info, "anglais-ia-bilan-quiz-enfant");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
});
