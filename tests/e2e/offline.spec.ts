import { expect, test } from "@playwright/test";
import { initialData } from "../../src/domain/fixtures";

const practice = initialData.series.find(
  (series) => series.id === "maths-relative-practice",
)!;
const storageKey = "revizo.learning.v1";

test("reprendre et terminer une séance après rechargement hors ligne", async ({
  page,
  context,
}, info) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem("revizo.mode", "demo"));
  await page.goto(`/student/exercise/${practice.id}`);
  await expect(
    page.getByText(practice.questions[0].prompt, { exact: true }),
  ).toBeVisible();

  // Registration comes from the application layout, never from this test.
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          if (!("serviceWorker" in navigator)) return false;
          const registration = await navigator.serviceWorker.getRegistration();
          return !!(registration?.active && navigator.serviceWorker.controller);
        }),
      {
        timeout: 20_000,
        message: "Le shell exporté doit être installé automatiquement.",
      },
    )
    .toBe(true);
  const cachedShells = await page.evaluate(async () => {
    const result: { name: string; urls: string[] }[] = [];
    for (const name of await caches.keys()) {
      if (!name.startsWith("revizio-shell-")) continue;
      const cache = await caches.open(name);
      result.push({
        name,
        urls: (await cache.keys()).map((request) => request.url),
      });
    }
    return result;
  });
  expect(cachedShells.length).toBeGreaterThan(0);
  for (const cache of cachedShells) {
    expect(
      cache.urls.some((url) => new URL(url).pathname === "/index.html"),
    ).toBe(true);
    expect(
      cache.urls.some((url) => new URL(url).pathname.startsWith("/_expo/")),
    ).toBe(true);
    for (const value of cache.urls) {
      const url = new URL(value);
      expect(url.origin).toBe(new URL(page.url()).origin);
      expect(url.pathname).not.toMatch(/^\/(?:api|uploads)(?:\/|$)/);
      expect(url.search).toBe("");
    }
  }
  const first = practice.questions[0];
  await page.getByTestId(`choice-${first.correctChoiceId}`).click();
  await page.getByTestId("verify-answer").click();
  await expect(
    page.getByText(first.explanation, { exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        ({ key, seriesId }) =>
          JSON.parse(localStorage.getItem(key) || "{}").attempts?.find(
            (attempt: { seriesId: string }) => attempt.seriesId === seriesId,
          )?.answers.length,
        { key: storageKey, seriesId: practice.id },
      ),
    )
    .toBe(1);

  try {
    await context.setOffline(true);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(
      page.getByText(practice.questions[1].prompt, { exact: true }),
    ).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
    const resumed = info.outputPath("seance-reprise-hors-ligne.png");
    await page.screenshot({ path: resumed, fullPage: true });
    await info.attach("seance-reprise-hors-ligne", {
      path: resumed,
      contentType: "image/png",
    });
    for (const question of practice.questions.slice(1)) {
      await expect(
        page.getByText(question.prompt, { exact: true }),
      ).toBeVisible();
      await page.getByTestId(`choice-${question.correctChoiceId}`).click();
      await page.getByTestId("verify-answer").click();
      await expect(
        page.getByText(question.explanation, { exact: true }),
      ).toBeVisible();
      await page.getByTestId("next-question").click();
    }
    await expect(page.getByTestId("exercise-result")).toBeVisible();
    await expect(page.getByTestId("exercise-score")).toHaveText(
      `${practice.questions.length} / ${practice.questions.length}`,
    );
    await expect
      .poll(() =>
        page.evaluate(
          ({ key, seriesId }) => {
            const attempts =
              JSON.parse(localStorage.getItem(key) || "{}").attempts?.filter(
                (attempt: { seriesId: string }) =>
                  attempt.seriesId === seriesId,
              ) ?? [];
            return {
              attempts: attempts.length,
              answers: attempts[0]?.answers.length,
              completed: !!attempts[0]?.completedAt,
            };
          },
          { key: storageKey, seriesId: practice.id },
        ),
      )
      .toEqual({
        attempts: 1,
        answers: practice.questions.length,
        completed: true,
      });

    await context.setOffline(false);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("exercise-result")).toBeVisible();
    await expect(page.getByTestId("exercise-score")).toHaveText(
      `${practice.questions.length} / ${practice.questions.length}`,
    );
    expect(
      await page.evaluate(
        ({ key, seriesId }) => {
          const attempts =
            JSON.parse(localStorage.getItem(key) || "{}").attempts?.filter(
              (attempt: { seriesId: string }) => attempt.seriesId === seriesId,
            ) ?? [];
          return {
            attempts: attempts.length,
            answers: attempts[0]?.answers.length,
            completed: !!attempts[0]?.completedAt,
          };
        },
        { key: storageKey, seriesId: practice.id },
      ),
    ).toEqual({
      attempts: 1,
      answers: practice.questions.length,
      completed: true,
    });
    const result = info.outputPath("bilan-apres-reconnexion.png");
    await page.screenshot({ path: result, fullPage: true });
    await info.attach("bilan-apres-reconnexion", {
      path: result,
      contentType: "image/png",
    });
    await info.attach("cache-shell-statique", {
      body: JSON.stringify(cachedShells, null, 2),
      contentType: "application/json",
    });
    expect(errors).toEqual([]);
  } finally {
    await context.setOffline(false);
  }
});
