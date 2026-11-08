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
async function createdJob(page: Page, kind: "course" | "exercises") {
  const [response] = await Promise.all([
    page.waitForResponse(
      (result) =>
        result.request().method() === "POST" &&
        new URL(result.url()).pathname === "/api/ai/" + kind,
      { timeout: 60_000 },
    ),
    page
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
