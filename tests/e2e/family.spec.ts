import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
  type TestInfo,
} from "@playwright/test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import type { Course, LearningData } from "../../src/domain/model";

// The dedicated E2E server owns an ephemeral database. The production server has no reset route.
test.describe.configure({ mode: "default", timeout: 60000 });
const parentEmail = "parent-famille@example.test";
const parentPassword = "Famille-Test-2026!";
const childPin = "4268";
const content =
  "Une température négative est inférieure à zéro. On lit −2 °C avant +3 °C sur un thermomètre.";
let directory: string;
let imagePath: string;
let pdfPath: string;

function textPdf() {
  const text =
    "BT /F1 20 Tf 50 760 Td (Les temperatures) Tj 0 -40 Td /F1 14 Tf (Une temperature negative est inferieure a zero.) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`,
  ];
  let file = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(file));
    file += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(file);
  file += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  file += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("");
  file += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(file);
}

test.beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "revizo-family-e2e-"));
  imagePath = join(directory, "cours-image.png");
  pdfPath = join(directory, "cours-pdf.pdf");
  await sharp(
    Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200"><rect width="900" height="1200" fill="white"/><text x="70" y="140" font-size="44" fill="black">Les temperatures</text><text x="70" y="240" font-size="30" fill="black">Une temperature negative est</text><text x="70" y="290" font-size="30" fill="black">inferieure a zero.</text><text x="70" y="380" font-size="30" fill="black">Exemple : -2 &lt; 0 &lt; +3</text></svg>',
    ),
  )
    .png()
    .toFile(imagePath);
  await writeFile(pdfPath, textPdf());
});
test.afterAll(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
});
test.beforeEach(async ({ page }) => {
  const reset = await page.request.post("/__test/reset");
  expect(reset.ok(), await reset.text()).toBe(true);
});

async function capture(page: Page, info: TestInfo, name: string) {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  const path = info.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: true });
  await info.attach(name, { path, contentType: "image/png" });
}
async function profiles(page: Page) {
  const response = await page.request.get("/api/profiles");
  expect(response.ok(), await response.text()).toBe(true);
  return (await response.json()).profiles as Array<{
    id: string;
    name: string;
    grade: string;
  }>;
}
async function envelope(page: Page, profileId: string) {
  const response = await page.request.get(
    `/api/data?profileId=${encodeURIComponent(profileId)}`,
  );
  expect(response.ok(), await response.text()).toBe(true);
  return (await response.json()) as { data: LearningData; revision: number };
}
async function fillSetup(page: Page) {
  await page.goto("/auth?target=parent");
  await expect(page.getByTestId("auth-parent-name")).toBeVisible();
  await page.getByTestId("auth-parent-name").fill("Parent de test");
  await page.getByTestId("auth-email").fill(parentEmail);
  await page.getByTestId("auth-password").fill(parentPassword);
  await page.getByTestId("auth-password-confirm").fill(parentPassword);
  await page.getByTestId("auth-child-name").fill("Camille");
  await page.getByTestId("auth-grade").fill("5e");
  await page.getByTestId("auth-pin").fill(childPin);
}
async function finishSetup(page: Page) {
  await page.getByTestId("auth-submit").click();
  await expect(page.getByTestId("parent-dashboard")).toBeVisible();
  const result = await profiles(page);
  expect(result).toHaveLength(1);
  return result[0].id;
}
async function setup(page: Page) {
  await fillSetup(page);
  return finishSetup(page);
}
async function loginParent(page: Page) {
  await page.goto("/auth?target=parent");
  await page.getByTestId("auth-email").fill(parentEmail);
  await page.getByTestId("auth-password").fill(parentPassword);
  await page.getByTestId("auth-submit").click();
  await expect(page.getByTestId("parent-dashboard")).toBeVisible();
}
async function loginChild(page: Page, profileId: string, pin = childPin) {
  await page.goto(
    `/auth?target=child&profileId=${encodeURIComponent(profileId)}`,
  );
  await page.getByTestId(`auth-profile-${profileId}`).click();
  await page.getByTestId("auth-pin").fill(pin);
  await page.getByTestId("auth-submit").click();
  await expect(page.getByTestId("student-home")).toBeVisible();
}
async function freshContext(
  browser: Browser,
  page: Page,
  baseURL: string | undefined,
) {
  return browser.newContext({
    baseURL,
    viewport: page.viewportSize(),
    hasTouch: true,
  });
}
async function chooseBackup(page: Page, path: string) {
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("settings-backup-import").click();
  await (await chooser).setFiles(path);
}
async function prepareCourse(
  page: Page,
  profileId: string,
  title: string,
  reloadEditor = false,
) {
  await page.goto("/parent/import");
  await page.getByTestId("course-title").fill(title);
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("ai-import-files").click();
  await (await chooser).setFiles([imagePath, pdfPath]);
  await expect(
    page.getByText("cours-image.png", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("cours-pdf.pdf", { exact: true })).toBeVisible();
  if (reloadEditor) {
    await page.getByTestId("ai-source-rotate-0").click();
    await expect(page.getByTestId("ai-source-rotate-0")).toContainText("90°");
    // No delay: a reload immediately after editing must retain the latest value and files.
    await page.getByTestId("ai-import-text").fill(content);
    await page.reload();
    await expect(page.getByTestId("course-title")).toHaveValue(title);
    await expect(page.getByTestId("ai-import-text")).toHaveValue(content);
    await expect(
      page.getByText("cours-image.png", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("cours-pdf.pdf", { exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId("ai-source-rotate-0")).toContainText("90°");
  }
  await page.getByTestId("create-course-draft").click();
  await expect(page.getByTestId("parent-review")).toBeVisible();
  const id = new URL(page.url()).pathname.split("/").pop()!;
  await page.getByTestId("course-content").fill(content);
  await page.getByTestId("save-course").click();
  await expect(
    page.getByText("Brouillon enregistré", { exact: true }),
  ).toBeVisible();
  await expect
    .poll(
      async () =>
        (await envelope(page, profileId)).data.courses.find(
          (course) => course.id === id,
        )?.sections[0]?.content,
    )
    .toBe(content);
  const course = (await envelope(page, profileId)).data.courses.find(
    (item) => item.id === id,
  )!;
  expect(course.status).toBe("draft");
  expect(course.sources).toHaveLength(2);
  for (const source of course.sources) {
    expect(source.storageId).toBeTruthy();
    expect(source.uri).toMatch(/^\/api\/uploads\//);
    expect(source.cachedUri).toBeUndefined();
    const response = await page.request.get(source.uri!);
    expect(response.ok()).toBe(true);
    expect((await response.body()).length).toBeGreaterThan(100);
  }
  return course;
}
async function publishCourse(page: Page, profileId: string, courseId: string) {
  await expect(page.getByTestId("publish-course")).toBeDisabled();
  await page.getByTestId("ai-course-confirm-review").click();
  await page.getByTestId("publish-course").click();
  await expect(
    page.getByText("La fiche publiée", { exact: true }),
  ).toBeVisible();
  await expect
    .poll(
      async () =>
        (await envelope(page, profileId)).data.courses.find(
          (course) => course.id === courseId,
        )?.status,
    )
    .toBe("published");
}
async function readDocuments(page: Page, course: Course, info: TestInfo) {
  await page.goto(`/student/course/${course.id}`);
  await expect(page.getByText(course.title, { exact: true })).toBeVisible();
  await expect(page.getByText(content, { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Voir la page 1", exact: true })
    .click();
  await expect(
    page.getByRole("img", { name: "cours-image.png", exact: true }),
  ).toBeVisible();
  await capture(page, info, "child-original-image");
  await page
    .getByRole("button", { name: "Fermer le document", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Voir la page 2", exact: true })
    .click();
  await expect(page.locator('iframe[title="cours-pdf.pdf"]')).toBeVisible();
  await capture(page, info, "child-original-pdf");
  await page
    .getByRole("button", { name: "Fermer le document", exact: true })
    .click();
}

test("créer la famille, gérer les profils et protéger l’espace parent derrière les vrais accès", async ({
  page,
  browser,
  baseURL,
}, info) => {
  await fillSetup(page);
  await page
    .getByTestId("auth-password-confirm")
    .fill("Mot-de-passe-different");
  await page.getByTestId("auth-submit").click();
  await expect(page.getByTestId("auth-error")).toContainText(
    "Les deux mots de passe ne sont pas identiques",
  );
  await page.getByTestId("auth-password-confirm").fill(parentPassword);
  await capture(page, info, "family-setup");
  const firstId = await finishSetup(page);
  const cookies = await page.context().cookies();
  expect(
    cookies.find((cookie) => cookie.name === "revizio_session"),
  ).toMatchObject({ httpOnly: true, sameSite: "Strict" });
  expect((await envelope(page, firstId)).data.courses).toHaveLength(0);

  await page.goto("/parent/settings");
  await page.getByTestId("settings-profile-name").fill("Milo");
  await page.getByTestId("settings-profile-grade").fill("6e");
  await page.getByTestId("settings-profile-pin").fill("5729");
  await page.getByTestId("settings-profile-save").click();
  await expect(page.getByTestId("settings-profiles-feedback")).toContainText(
    "Le profil de Milo est enregistré",
  );
  const added = (await profiles(page)).find(
    (profile) => profile.name === "Milo",
  )!;
  await page.getByTestId(`settings-edit-profile-${added.id}`).click();
  await page.getByTestId("settings-profile-name").fill("Milo test");
  await page.getByTestId("settings-profile-grade").fill("5e");
  await page.getByTestId("settings-profile-pin").fill("6831");
  await page.getByTestId("settings-profile-save").click();
  await expect(page.getByTestId("settings-profiles-feedback")).toContainText(
    "Le profil de Milo test est enregistré",
  );
  await page.getByTestId(`settings-active-profile-${added.id}`).click();
  await expect(page.getByTestId("app-loading")).toHaveCount(0);
  await expect(page.getByTestId("settings-screen")).toBeVisible();
  await expect(page).toHaveURL(/\/parent\/settings$/);
  await capture(page, info, "family-profile-settings");

  const context = await freshContext(browser, page, baseURL);
  try {
    const child = await context.newPage();
    await child.goto(`/auth?target=child&profileId=${added.id}`);
    await child.getByTestId(`auth-profile-${added.id}`).click();
    await child.getByTestId("auth-pin").fill("5729");
    await child.getByTestId("auth-submit").click();
    await expect(child.getByTestId("auth-error")).toContainText(
      "Le profil ou le code enfant est incorrect",
    );
    await child.getByTestId("auth-pin").fill("6831");
    await child.getByTestId("auth-submit").click();
    await expect(child.getByTestId("student-home")).toBeVisible();
    expect((await child.request.get("/api/settings")).status()).toBe(403);
    expect(
      (await child.request.get(`/api/data?profileId=${firstId}`)).status(),
    ).toBe(403);
    await child.goto("/parent/settings");
    await expect(child.getByTestId("auth-screen")).toBeVisible();
    await expect(child.getByTestId("settings-screen")).toHaveCount(0);
    await expect(
      child.getByText("Connexion parent", { exact: true }),
    ).toBeVisible();
    await child.getByTestId("auth-email").fill(parentEmail);
    await child.getByTestId("auth-password").fill("Mauvais-mot-de-passe");
    await child.getByTestId("auth-submit").click();
    await expect(child.getByTestId("auth-error")).toContainText(
      "mot de passe est incorrect",
    );
    await capture(child, info, "parent-access-protected");
    await child.getByTestId("auth-password").fill(parentPassword);
    await child.getByTestId("auth-submit").click();
    await expect(child.getByTestId("parent-dashboard")).toBeVisible();
    await child.goto("/parent/settings");
    await child.getByTestId("settings-logout").click();
    await expect(child).toHaveURL(/\/$/);
    expect((await child.request.get("/api/session")).status()).toBe(401);
    await loginParent(child);
  } finally {
    await context.close();
  }
  await page.getByTestId(`settings-delete-profile-${added.id}`).click();
  await expect(
    page.getByTestId("settings-profile-delete-confirm"),
  ).toBeDisabled();
  await page.getByTestId("settings-profile-delete-name").fill("Milo test");
  await page.getByTestId("settings-profile-delete-confirm").click();
  await expect(page.getByTestId("settings-profiles-feedback")).toContainText(
    "Le profil de Milo test a été supprimé",
  );
  expect(await profiles(page)).toHaveLength(1);
  await expect(
    page.getByTestId(`settings-delete-profile-${firstId}`),
  ).toBeDisabled();
});

test("conserver une image et un PDF après rechargement puis publier seulement la fiche relue", async ({
  page,
  browser,
  baseURL,
}, info) => {
  const profileId = await setup(page);
  const course = await prepareCourse(
    page,
    profileId,
    "Températures — cours familial",
    true,
  );
  expect(course.sources[0].rotation).toBe(90);
  await page.reload();
  await expect(page.getByTestId("course-content")).toHaveValue(content);
  await expect(
    page.getByText("cours-image.png", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("cours-pdf.pdf", { exact: true })).toBeVisible();
  await page
    .getByText("cours-pdf.pdf", { exact: true })
    .scrollIntoViewIfNeeded();
  await capture(page, info, "parent-durable-documents");
  const childContext = await freshContext(browser, page, baseURL);
  try {
    const child = await childContext.newPage();
    await loginChild(child, profileId);
    expect((await envelope(child, profileId)).data.courses).toHaveLength(0);
    for (const source of course.sources)
      expect((await child.request.get(source.uri!)).status()).toBe(404);
    await publishCourse(page, profileId, course.id);
    await readDocuments(child, course, info);
    for (const source of course.sources) {
      const response = await child.request.get(source.uri!);
      expect(response.ok()).toBe(true);
      expect(response.headers()["content-type"]).toContain(source.mimeType!);
    }
    await child
      .getByRole("button", {
        name: "Marquer cette fiche comme relue",
        exact: true,
      })
      .click();
    await expect(
      child.getByText("Fiche marquée comme relue", { exact: true }),
    ).toBeVisible();
    await child.reload();
    await expect(
      child.getByText("Fiche marquée comme relue", { exact: true }),
    ).toBeVisible();
    await expect
      .poll(async () =>
        (await envelope(page, profileId)).data.reviewedCourseIds.includes(
          course.id,
        ),
      )
      .toBe(true);
  } finally {
    await childContext.close();
  }
});

test("exporter et restaurer les profils, cours et documents avec confirmation parent", async ({
  page,
  browser,
  baseURL,
}, info) => {
  const profileId = await setup(page);
  const course = await prepareCourse(
    page,
    profileId,
    "Températures — sauvegarde",
  );
  await publishCourse(page, profileId, course.id);
  const documents = await Promise.all(
    course.sources.map(async (source) =>
      (await page.request.get(source.uri!)).body(),
    ),
  );
  await page.goto("/parent/settings");
  const download = page.waitForEvent("download");
  await page.getByTestId("settings-backup-export").click();
  const savedDownload = await download;
  const backupPath = join(directory, savedDownload.suggestedFilename());
  await savedDownload.saveAs(backupPath);
  const backup = JSON.parse(await readFile(backupPath, "utf8")) as {
    format: string;
    profiles: Array<{ id: string; data: LearningData }>;
    uploads: Array<unknown>;
  };
  expect(backup.format).toBe("revizio-backup");
  expect(backup.profiles).toHaveLength(1);
  expect(backup.uploads).toHaveLength(2);
  expect(backup.profiles[0].data.courses[0].title).toBe(course.title);
  expect(JSON.stringify(backup)).not.toContain(parentPassword);
  expect(JSON.stringify(backup)).not.toContain(parentEmail);
  const invalidPath = join(directory, "fichier-invalide.json");
  await writeFile(invalidPath, "{}");
  await chooseBackup(page, invalidPath);
  await expect(page.getByTestId("settings-backup-feedback")).toContainText(
    "sauvegarde Révizo compatible",
  );
  await expect(page.getByTestId("settings-restore-review")).toHaveCount(0);

  await page.getByTestId("settings-profile-name").fill("Profil temporaire");
  await page.getByTestId("settings-profile-pin").fill("6831");
  await page.getByTestId("settings-profile-save").click();
  await expect(page.getByTestId("settings-profiles-feedback")).toContainText(
    "Profil temporaire est enregistré",
  );
  expect(await profiles(page)).toHaveLength(2);
  await page.goto(`/parent/review/${course.id}`);
  await page.getByTestId("ai-course-new-version").click();
  await expect(page.getByTestId("course-title")).toBeEditable();
  await page.getByTestId("course-title").fill("Modification temporaire");
  await page.getByTestId("save-course").click();
  await expect(
    page.getByText("Brouillon enregistré", { exact: true }),
  ).toBeVisible();
  expect((await envelope(page, profileId)).data.courses).toHaveLength(2);

  const childContext: BrowserContext = await freshContext(
    browser,
    page,
    baseURL,
  );
  try {
    const child = await childContext.newPage();
    await loginChild(child, profileId);
    expect((await child.request.get("/api/session")).status()).toBe(200);
    await page.goto("/parent/settings");
    await chooseBackup(page, backupPath);
    await expect(page.getByTestId("settings-restore-review")).toBeVisible();
    await expect(page.getByTestId("settings-restore-confirm")).toBeDisabled();
    await page.getByTestId("settings-restore-confirm-text").fill("RESTAURER");
    await capture(page, info, "family-backup-confirmation");
    await page.getByTestId("settings-restore-confirm").click();
    await expect(page.getByTestId("settings-backup-feedback")).toContainText(
      "La sauvegarde est restaurée",
    );
    expect(await profiles(page)).toHaveLength(1);
    const restored = (await envelope(page, profileId)).data;
    expect(restored.courses).toHaveLength(1);
    expect(restored.courses[0].id).toBe(course.id);
    expect(restored.courses[0].status).toBe("published");
    for (const [index, source] of restored.courses[0].sources.entries())
      expect(await (await page.request.get(source.uri!)).body()).toEqual(
        documents[index],
      );
    expect((await child.request.get("/api/session")).status()).toBe(401);
    // The existing profile keeps its PIN; the previous child session was revoked.
    await loginChild(child, profileId);
    await child.goto(`/student/course/${course.id}`);
    await expect(child.getByText(content, { exact: true })).toBeVisible();
    await capture(child, info, "family-restored-course");
    await page.reload();
    await expect(
      page.getByTestId(`settings-profile-${profileId}`),
    ).toBeVisible();
  } finally {
    await childContext.close();
  }
});
