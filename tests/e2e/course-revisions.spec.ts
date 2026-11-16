import { expect, test } from "@playwright/test";
import { initialData } from "../../src/domain/fixtures";

test("ouvrir la source en contexte puis remplacer la fiche relue", async ({
  page,
}) => {
  const course = initialData.courses[0];
  const correctionId = "fiche-corrigee";
  await page.addInitScript(
    ({ state, correctionId }) => {
      localStorage.setItem("revizo.mode", "demo");
      if (localStorage.getItem("revizo.learning.v1")) return;
      const first = state.courses[0];
      const draft = structuredClone(first);
      draft.id = correctionId;
      draft.originId = first.id;
      draft.status = "draft";
      draft.title = "Fiche corrigée";
      draft.sourceText = "Phrase de la source servant à la comparaison.";
      draft.sections[0].sourceRefs = [
        { sourceId: "texte-saisi", page: 1, excerpt: "Phrase de la source" },
      ];
      state.courses.push(draft);
      localStorage.setItem("revizo.learning.v1", JSON.stringify(state));
    },
    { state: initialData, correctionId },
  );
  await page.goto("/parent/review/" + correctionId);
  const reference = page.getByTestId(
    "section-reference-" + course.sections[0].id + "-0",
  );
  await reference.click();
  const viewport = page.viewportSize()!;
  if (viewport.width > viewport.height) {
    await expect(page.getByTestId("reference-side-panel")).toBeVisible();
    const [panel, section] = await Promise.all([
      page.getByTestId("reference-side-panel").boundingBox(),
      reference.boundingBox(),
    ]);
    expect(panel!.x).toBeGreaterThan(section!.x);
  } else {
    await expect(page.getByTestId("reference-side-panel")).toHaveCount(0);
  }
  await expect(
    page.getByText("Phrase de la source", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Fermer le document" }).click();
  await expect(reference).toBeInViewport();
  await expect(reference).toBeFocused();
  await page.getByTestId("ai-course-confirm-review").click();
  await page.getByTestId("replace-published-course").click();
  await expect(
    page.getByText("La fiche publiée", { exact: true }),
  ).toBeVisible();
  await page.goto("/student/course/" + course.id);
  await expect(
    page.getByRole("heading", { name: "Fiche corrigée", exact: true }),
  ).toBeVisible();
  await page.goto("/parent/review/" + course.id);
  await expect(
    page.getByRole("heading", { name: "Version archivée", exact: true }),
  ).toBeVisible();
});
