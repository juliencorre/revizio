import { expect, test, type Page, type TestInfo } from "@playwright/test";
import type { LearningData } from "../../src/domain/model";

async function dataFor(page: Page, profileId: string): Promise<LearningData> {
  const response = await page.request.get(
    "/api/data?profileId=" + encodeURIComponent(profileId),
  );
  expect(response.ok(), await response.text()).toBe(true);
  return (await response.json()).data;
}
async function capture(page: Page, info: TestInfo, name: string) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const path = info.outputPath(name + ".png");
  await page.screenshot({ path, fullPage: true });
  await info.attach(name, { path, contentType: "image/png" });
}

test("créer des schémas validés, publier puis les revoir en mode mémoire", async ({
  page,
}, info) => {
  test.setTimeout(60_000);
  expect((await page.request.post("/__test/reset")).ok()).toBe(true);
  const setup = await page.request.post("/api/setup", {
    data: {
      parentName: "Parent schémas",
      email: "diagrammes@example.test",
      password: "Diagrammes-test-42!",
      childName: "Camille",
      grade: "5e",
      pin: "2468",
    },
  });
  expect(setup.ok(), await setup.text()).toBe(true);
  const profileId: string = (await setup.json()).profiles[0].id;
  await page.goto("/parent/import");
  await page.getByTestId("course-title").fill("Fractions et repères visuels");
  await page.getByTestId("create-course-draft").click();
  await expect(page.getByTestId("parent-review")).toBeVisible();
  const courseId = new URL(page.url()).pathname.split("/").pop()!;
  await page
    .getByTestId("course-content")
    .fill(
      "La fraction un quart représente une part coloriée parmi quatre parts égales.",
    );
  await page
    .getByRole("textbox", { name: "Contenu — La méthode", exact: true })
    .fill(
      "Sur une droite graduée, le point Origine vaut zéro et le point A vaut trois.",
    );
  const fraction = page.getByTestId("diagram-editor-essential").first();
  await fraction.getByTestId("diagram-type-fraction").click();
  await fraction.getByTestId("diagram-numerator").fill("1");
  await fraction.getByTestId("diagram-denominator").fill("0");
  await expect(fraction.getByTestId("diagram-error")).toContainText(
    "de 1 à 24",
  );
  await expect(fraction.getByTestId("diagram-apply")).toBeDisabled();
  await expect(page.getByTestId("ai-course-confirm-review")).toBeDisabled();
  expect(
    (await dataFor(page, profileId)).courses
      .find((course) => course.id === courseId)
      ?.sections.find((section) => section.kind === "essential")?.diagram,
  ).toBeUndefined();
  await fraction.getByTestId("diagram-denominator").fill("4");
  await expect(fraction.getByTestId("diagram-preview")).toContainText("1 / 4");
  await fraction.getByTestId("diagram-apply").click();
  await expect
    .poll(
      async () =>
        (await dataFor(page, profileId)).courses
          .find((course) => course.id === courseId)
          ?.sections.find((section) => section.kind === "essential")?.diagram,
    )
    .toEqual({ type: "fraction", numerator: 1, denominator: 4 });

  const line = page.getByTestId("diagram-editor-method").first();
  await line.getByTestId("diagram-type-number-line").click();
  await line.getByTestId("diagram-min").fill("-5");
  await line.getByTestId("diagram-max").fill("5");
  await line.getByTestId("diagram-add-point").click();
  await line.getByTestId("diagram-point-value-0").fill("99");
  await line.getByTestId("diagram-point-label-0").fill("Origine");
  await expect(line.getByTestId("diagram-error")).toContainText(
    "entre les deux bornes",
  );
  await expect(line.getByTestId("diagram-apply")).toBeDisabled();
  await line.getByTestId("diagram-point-value-0").fill("0");
  await line.getByTestId("diagram-add-point").click();
  await line.getByTestId("diagram-point-value-1").fill("3");
  await line.getByTestId("diagram-point-label-1").fill("Point A");
  await line.getByTestId("diagram-apply").click();
  await page.getByTestId("save-course").click();
  await expect
    .poll(
      async () =>
        (await dataFor(page, profileId)).courses
          .find((course) => course.id === courseId)
          ?.sections.find((section) => section.kind === "method")?.diagram,
    )
    .toEqual({
      type: "number-line",
      min: -5,
      max: 5,
      points: [
        { value: 0, label: "Origine" },
        { value: 3, label: "Point A" },
      ],
    });

  await page.reload();
  await expect(fraction.getByTestId("diagram-numerator")).toHaveValue("1");
  await expect(fraction.getByTestId("diagram-denominator")).toHaveValue("4");
  await expect(line.getByTestId("diagram-point-label-1")).toHaveValue(
    "Point A",
  );
  await page.getByTestId("ai-course-confirm-review").click();
  await fraction.getByTestId("diagram-numerator").fill("2");
  await expect(page.getByTestId("publish-course")).toBeDisabled();
  await expect(page.getByTestId("ai-course-confirm-review")).toBeDisabled();
  await fraction.getByTestId("diagram-cancel").click();
  await expect(fraction.getByTestId("diagram-numerator")).toHaveValue("1");
  await page.getByTestId("ai-course-confirm-review").click();
  await page.getByTestId("publish-course").click();
  await expect(
    page.getByRole("heading", { name: "La fiche publiée", exact: true }),
  ).toBeVisible();
  await expect
    .poll(
      async () =>
        (await dataFor(page, profileId)).courses.find(
          (course) => course.id === courseId,
        )?.status,
    )
    .toBe("published");
  await capture(page, info, "parent-schemas-valides-publies");

  await page.goto(
    "/auth?target=child&profileId=" + encodeURIComponent(profileId),
  );
  await page.getByTestId("auth-pin").fill("2468");
  await page.getByTestId("auth-submit").click();
  await expect(page).toHaveURL(/\/student(?:\?|$)/);
  await page.goto("/student/course/" + courseId);
  const fractionCaption = page.getByText("1 / 4 · 1 part sur 4", {
    exact: true,
  });
  const pointLabels = page.getByLabel("Origine : 0, Point A : 3", {
    exact: true,
  });
  await expect(fractionCaption).toBeVisible();
  await expect(pointLabels).toBeVisible();
  await capture(page, info, "enfant-fraction-droite-graduee");
  await page
    .getByRole("button", { name: "Me tester de mémoire", exact: true })
    .click();
  await expect(fractionCaption).toHaveCount(0);
  await expect(pointLabels).toHaveCount(0);
  await page
    .getByRole("button", { name: "Afficher l’explication", exact: true })
    .first()
    .click();
  await expect(fractionCaption).toBeVisible();
  await expect(pointLabels).toHaveCount(0);
  await page
    .getByRole("button", { name: "Afficher l’explication", exact: true })
    .first()
    .click();
  await expect(pointLabels).toBeVisible();
  await capture(page, info, "enfant-schemas-retrouves-de-memoire");
});
