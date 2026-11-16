import { expect, test } from "@playwright/test";
import { initialData } from "../../src/domain/fixtures";
import type { AiJob, LearningData, Question } from "../../src/domain/model";

test.use({ serviceWorkers: "block" });

const question: Question = {
  id: "demi",
  type: "short-answer",
  prompt: "Donne un nom pour la fraction 1/2.",
  expectedAnswers: ["un demi"],
  choices: [],
  correctChoiceId: "",
  explanation: "Une part sur deux parts égales.",
  concept: "Fractions",
  hint: "Pense au partage en deux.",
};
const course = initialData.courses[0];
const series = {
  ...initialData.series[0],
  id: "fractions",
  title: "Les fractions",
  courseIds: [course.id],
  questions: [question],
};
const data: LearningData = {
  version: 1,
  courses: [course],
  series: [series],
  reviewedCourseIds: [],
  attempts: [],
};

test("demander une vérification et retrouver la variante au prochain essai", async ({
  page,
}) => {
  await page.addInitScript((seed) => {
    localStorage.setItem("revizo.mode", "demo");
    if (!localStorage.getItem("revizo.learning.v1"))
      localStorage.setItem("revizo.learning.v1", JSON.stringify(seed));
  }, data);
  await page.goto("/student/exercise/fractions");
  await page.getByTestId("written-answer").fill("une moitié");
  await page.getByTestId("verify-answer").click();
  await page.getByRole("button", { name: "Faire vérifier ma réponse" }).click();
  await expect(
    page.getByText("Vérification demandée à ton parent."),
  ).toBeVisible();
  await page.getByTestId("next-question").click();
  await expect(page.getByTestId("exercise-score")).toHaveText("0 / 1");
  const oldAttempt = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("revizo.learning.v1")!).attempts.at(-1)
        .id as string,
  );
  await page.goto("/parent/progress");
  await expect(page.getByText("Réponse de Alex : une moitié")).toBeVisible();
  await page
    .getByRole("button", { name: "Accepter pour les prochaines séances" })
    .click();
  await expect(
    page.getByText("Réponses à vérifier", { exact: true }),
  ).toHaveCount(0);
  await page.goto("/student/exercise/fractions?attemptId=" + oldAttempt);
  await expect(page.getByTestId("exercise-score")).toHaveText("0 / 1");
  await page.getByRole("button", { name: "Recommencer la série" }).click();
  await page.getByTestId("written-answer").fill("une moitié");
  await page.getByTestId("verify-answer").click();
  await page.getByTestId("next-question").click();
  await expect(page.getByTestId("exercise-score")).toHaveText("1 / 1");
});

test("retrouver une préparation dans le bon profil après avoir changé d’enfant", async ({
  page,
}) => {
  expect((await page.request.post("/__test/reset")).ok()).toBe(true);
  const response = await page.request.post("/api/setup", {
    data: {
      parentName: "Parent",
      email: "relecture@example.test",
      password: "Famille-2026-test!",
      children: [
        { name: "Camille", pin: "426813" },
        { name: "Milo", pin: "579246" },
      ],
    },
  });
  expect(response.ok(), await response.text()).toBe(true);
  const profiles = (await response.json()).profiles as {
    id: string;
    name: string;
  }[];
  const [first, second] = profiles;
  for (const profile of profiles) {
    const state = await (
      await page.request.get("/api/data?profileId=" + profile.id)
    ).json();
    const saved = await page.request.put("/api/data", {
      data: {
        profileId: profile.id,
        revision: state.revision,
        data: { ...data, series: [] },
      },
    });
    expect(saved.ok(), await saved.text()).toBe(true);
  }
  const job: AiJob = {
    id: "exercice-differe",
    createdAt: new Date().toISOString(),
    kind: "exercises",
    profileId: first.id,
    status: "succeeded",
    input: {
      title: "Révision de Camille",
      courseIds: [course.id],
      subjectId: course.subjectId,
    },
    result: { questions: [question] },
  };
  await page.route("**/api/ai/exercises", async (route) => {
    expect(route.request().postDataJSON().profileId).toBe(first.id);
    await route.fulfill({
      json: { job: { ...job, status: "queued", result: undefined } },
    });
  });
  const release = Promise.withResolvers<void>();
  const polling = Promise.withResolvers<void>();
  await page.route("**/api/jobs/exercice-differe", async (route) => {
    polling.resolve();
    await release.promise;
    await route.fulfill({ json: { job } });
  });
  await page.route("**/api/jobs?*", (route) =>
    route.fulfill({
      json: {
        jobs:
          new URL(route.request().url()).searchParams.get("profileId") ===
          first.id
            ? [job]
            : [],
      },
    }),
  );
  await page.goto("/parent/exercises?courseId=" + course.id);
  await page.getByTestId("series-title").fill("Révision de Camille");
  await page.getByTestId("ai-generate-exercises").click();
  await polling.promise;
  const trigger = page.getByTestId("parent-child-trigger");
  await trigger.click();
  await page
    .getByRole("menuitemradio", { name: second.name, exact: true })
    .click();
  await expect(trigger).toContainText(second.name);
  const finished = page.waitForResponse("**/api/jobs/exercice-differe");
  release.resolve();
  await finished;
  await trigger.click();
  await page
    .getByRole("menuitemradio", { name: first.name, exact: true })
    .click();
  await expect(trigger).toContainText(first.name);
  await page.goto("/parent/preparations");
  await page.getByTestId("review-job-" + job.id).click();
  await expect(page.getByTestId("series-title")).toHaveValue(
    "Révision de Camille",
  );
  async function seriesFor(profileId: string) {
    const { data } = (await (
      await page.request.get("/api/data?profileId=" + profileId)
    ).json()) as { data: LearningData };
    return data.series
      .filter((item) => item.generationJobId === job.id)
      .map((item) => item.title);
  }
  await expect.poll(() => seriesFor(first.id)).toEqual(["Révision de Camille"]);
  expect(await seriesFor(second.id)).toEqual([]);
});
