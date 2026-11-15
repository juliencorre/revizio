import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";
import type { AiJob, LearningData } from "../../src/domain/model";

test.use({ serviceWorkers: "block" });

async function openList(page: Page) {
  expect((await page.request.post("/__test/reset")).ok()).toBe(true);
  const setup = await page.request.post("/api/setup", {
    data: {
      parentName: "Parent",
      email: "photo@example.test",
      password: "Vocabulaire-photo-42!",
      childName: "Camille",
      grade: "5e",
      pin: "4268",
    },
  });
  expect(setup.ok()).toBe(true);
  await page.goto("/parent/vocabulary?language=spanish");
  await page.getByTestId("add-vocabulary-list").click();
  await page.getByTestId("vocabulary-title").fill("Mon cahier");
  return (await setup.json()).profiles[0].id as string;
}
async function importPhoto(page: Page, monolingual = false, camera = false) {
  // Only image pixels reach the model. When present, French is in the left column.
  const french = monolingual
    ? ""
    : '<text x="90" y="130">Français</text><text x="90" y="300">la maison</text><text x="90" y="475">la fenêtre</text>';
  const image = await sharp(
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="700"><rect width="100%" height="100%" fill="white"/><g font-family="DejaVu Sans" font-size="64">${french}<text x="900" y="130">Español</text><text x="900" y="300">la casa</text><text x="900" y="475">la ventana</text></g></svg>`,
    ),
  )
    .jpeg()
    .toBuffer();
  await page
    .getByRole("button", { name: "Importer une photo", exact: true })
    .click();
  const picker = page.waitForEvent("filechooser");
  await page
    .getByRole("button", {
      name: camera ? "Prendre une photo" : "Choisir une photo",
    })
    .click();
  const chooser = await picker;
  if (camera)
    expect(await chooser.element().getAttribute("capture")).toBe("environment");
  await chooser.setFiles({
    name: "cahier.jpg",
    mimeType: "image/jpeg",
    buffer: image,
  });
}
test("relit la photo et ajoute seulement les nouvelles paires acceptées au brouillon", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  const profileId = await openList(page);
  await page.getByTestId("vocabulary-term-0").fill("la casa");
  await page.getByTestId("vocabulary-translation-0").fill("la demeure");
  await page.getByTestId("publish-vocabulary-list").click();
  await expect(page.getByText("Liste publiée", { exact: true })).toBeVisible();
  const words = async () => {
    const response = await page.request.get("/api/data?profileId=" + profileId);
    return ((await response.json()).data as LearningData).vocabularyLists?.[0]
      ?.words;
  };
  await expect.poll(async () => (await words())?.length).toBe(1);
  let job: AiJob;
  await page.route("**/api/ai/vocabulary", async (route) => {
    const input = route.request().postDataJSON();
    expect(input.subjectId).toBe("spanish");
    expect(input.sourceIds).toHaveLength(1);
    expect(
      (await page.request.get("/api/uploads/" + input.sourceIds[0])).headers()[
        "content-type"
      ],
    ).toBe("image/png");
    job = {
      id: "photo-test",
      kind: "vocabulary",
      profileId,
      input,
      createdAt: new Date().toISOString(),
      status: "succeeded",
      result: {
        vocabulary: [
          { term: "LA CASA", translation: "la maison", reading: "copied" },
          { term: "la ventana", translation: "", reading: "uncertain" },
          { term: "el patio", translation: "la cour", reading: "suggested" },
        ],
      },
    };
    await route.fulfill({ json: { job } });
  });
  await page.route("**/api/jobs/photo-test", (route) =>
    route.fulfill({ json: { job } }),
  );
  await importPhoto(page);
  await expect(page.getByText("Mot en double · ignoré")).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("Traduction proposée par l’IA", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const remove = await page
    .getByRole("button", { name: "Écarter la proposition 2" })
    .boundingBox();
  expect(Math.min(remove!.width, remove!.height)).toBeGreaterThanOrEqual(44);
  await expect(
    page.getByRole("button", { name: "Ajouter 1 mot au brouillon" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Voir la photo" }).click();
  await expect(
    page.getByRole("img", { name: "Photo de la liste à relire" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Fermer le document" }).click();
  await page
    .getByRole("textbox", { name: "Traduction proposée 2", exact: true })
    .fill("la fenêtre");
  await page.getByRole("button", { name: "Écarter la proposition 3" }).click();
  await page
    .getByRole("button", { name: "Ajouter 1 mot au brouillon" })
    .click();
  await expect(page.getByTestId("vocabulary-translation-0")).toHaveValue(
    "la demeure",
  );
  await expect(page.getByTestId("vocabulary-translation-1")).toHaveValue(
    "la fenêtre",
  );
  await expect(page).not.toHaveURL(/photoJob=/);
  await page.reload();
  await expect(page.getByTestId("vocabulary-term-1")).toHaveValue("la ventana");
  await expect(
    page.getByRole("button", { name: "Importer une photo", exact: true }),
  ).toBeVisible();
  expect(await words()).toHaveLength(1);
  await page.getByTestId("publish-vocabulary-list").click();
  await expect
    .poll(async () => (await words())?.map((w) => w.translation))
    .toEqual(["la demeure", "la fenêtre"]);
});

for (const monolingual of [false, true]) {
  test(`Ollama lit une photo ${monolingual ? "en espagnol seul" : "à colonnes inversées"}`, async ({
    page,
  }) => {
    test.skip(
      process.env.REVIZIO_LIVE_AI !== "1",
      "Nécessite le modèle de vision local.",
    );
    test.setTimeout(600000);
    await openList(page);
    await importPhoto(page, monolingual, monolingual);
    await expect(page).toHaveURL(/photoJob=/, { timeout: 15000 });
    await expect(
      page.getByRole("textbox", { name: "Mot proposé 1", exact: true }),
    ).toHaveValue("la casa", { timeout: 540000 });
    const jobId = new URL(page.url()).searchParams.get("photoJob");
    expect(jobId).toBeTruthy();
    await page.goto("/parent/preparations?subjectId=spanish");
    await page.getByTestId("review-job-" + jobId).click();
    await expect(page.getByTestId("vocabulary-title")).toHaveValue(
      "Mon cahier",
    );
    if (monolingual)
      await expect(
        page.getByText("Traduction proposée par l’IA", { exact: true }),
      ).toHaveCount(2);
    await expect(
      page.getByRole("textbox", { name: "Traduction proposée 2", exact: true }),
    ).toHaveValue("la fenêtre");
    await page
      .getByRole("button", { name: "Ajouter 2 mots au brouillon" })
      .click();
    await expect(page.getByTestId("vocabulary-term-1")).toHaveValue(
      "la ventana",
    );
  });
}
