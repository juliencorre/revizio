import { expect, test, type Page } from "@playwright/test";

type Profile = { id: string; name: string; grade: string };
async function family(page: Page) {
  expect((await page.request.post("/__test/reset")).ok()).toBe(true);
  const response = await page.request.post("/api/setup", {
    data: {
      parentName: "Parent de test",
      email: "selection@example.test",
      password: "Selection-test-2026!",
      children: [
        { name: "Héloïse", pin: "426813" },
        { name: "Gabriel", pin: "579246" },
      ],
    },
  });
  expect(response.ok(), await response.text()).toBe(true);
  return (await response.json()).profiles as Profile[];
}

test("choisir un enfant, retrouver ses contenus et conserver le choix après rechargement", async ({
  page,
}, info) => {
  const profiles = await family(page);
  const documents: string[] = [],
    errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (request.resourceType() === "document") documents.push(request.url());
  });
  await page.goto("/parent/vocabulary?language=latin");
  await page.getByTestId("add-vocabulary-list").click();
  await page.getByTestId("vocabulary-title").fill("Les mots d’Héloïse");
  await page.getByTestId("vocabulary-term-0").fill("rosa");
  await page.getByTestId("vocabulary-translation-0").fill("rose");
  await page.getByTestId("save-vocabulary-draft").click();
  await page
    .getByRole("button", { name: "Mes listes de vocabulaire", exact: true })
    .click();
  await expect(
    page.getByText("Les mots d’Héloïse", { exact: true }),
  ).toBeVisible();
  const navigation = (await page
    .getByRole("navigation", { name: "Navigation principale" })
    .elementHandle())!;
  const trigger = page.getByTestId("parent-child-trigger");
  const original = (await trigger.elementHandle())!;
  const initialDocuments = documents.length;
  await trigger.click();
  const menu = page.getByRole("menu", { name: "Enfant accompagné" });
  await expect(
    menu.getByRole("menuitemradio", { name: "Héloïse", exact: true }),
  ).toHaveAttribute("aria-checked", "true");
  await expect(
    menu.getByRole("menuitemradio", { name: "Gabriel", exact: true }),
  ).toHaveAttribute("aria-checked", "false");
  await menu
    .getByRole("menuitemradio", { name: "Gabriel", exact: true })
    .click();
  await expect(menu).toHaveCount(0);
  await expect(trigger).toContainText("Gabriel");
  await expect(page.getByTestId("app-loading")).toHaveCount(0);
  await expect(
    page.getByText("Les mots d’Héloïse", { exact: true }),
  ).toHaveCount(0);
  expect(await original.evaluate((node) => node.isConnected)).toBe(true);
  expect(await navigation.evaluate((node) => node.isConnected)).toBe(true);
  expect(documents).toHaveLength(initialDocuments);
  await page.reload();
  await expect(trigger).toContainText("Gabriel");
  await trigger.click();
  await expect(
    menu.getByRole("menuitemradio", { name: "Gabriel", exact: true }),
  ).toHaveAttribute("aria-checked", "true");
  await menu
    .getByRole("menuitemradio", { name: "Héloïse", exact: true })
    .click();
  await expect(
    page.getByText("Les mots d’Héloïse", { exact: true }),
  ).toBeVisible();
  await page.goto("/parent");
  await expect(
    page.getByRole("heading", { name: "Accompagner Héloïse", exact: true }),
  ).toBeVisible();
  await trigger.click();
  await expect(menu).toBeVisible();
  await page.screenshot({ path: info.outputPath("selection-enfant.png") });
  if (info.project.name === "tablet-landscape") {
    for (const viewport of [
      { width: 1440, height: 900, name: "desktop" },
      { width: 1280, height: 960, name: "user-1280" },
      { width: 390, height: 844, name: "mobile" },
    ]) {
      await page.setViewportSize(viewport);
      await expect(menu).toHaveCount(0);
      await trigger.click();
      await expect(menu).toBeVisible();
      await page.screenshot({ path: info.outputPath(`${viewport.name}.png`) });
    }
  }
  await expect(menu.getByRole("menuitemradio")).toHaveCount(profiles.length);
  expect(errors).toEqual([]);
});

test("choisir au clavier et fermer le menu sans changer d’enfant", async ({
  page,
}) => {
  await family(page);
  await page.goto("/parent");
  const trigger = page.getByTestId("parent-child-trigger");
  await expect(trigger).toBeVisible();
  await trigger.focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(trigger).toBeFocused();
  await page.keyboard.press("Enter");
  const menu = page.getByRole("menu", { name: "Enfant accompagné" });
  await expect(
    menu.getByRole("menuitemradio", { name: "Héloïse", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("ArrowDown");
  const gabriel = menu.getByRole("menuitemradio", {
    name: "Gabriel",
    exact: true,
  });
  await expect(gabriel).toBeFocused();
  await expect(gabriel).toHaveCSS("outline-style", "solid");
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Accompagner Gabriel", exact: true }),
  ).toBeVisible();
  await trigger.click();
  await expect(menu).toBeVisible();
  await expect(gabriel).toBeFocused();
  await page.keyboard.press("Home");
  await expect(
    menu.getByRole("menuitemradio", { name: "Héloïse", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(trigger).toContainText("Gabriel");
  await trigger.click();
  await expect(menu).toBeVisible();
  await page.mouse.click(8, 8);
  await expect(menu).toHaveCount(0);
  await expect(trigger).toContainText("Gabriel");
});

test("garder les noms longs et les choix tactiles lisibles sur téléphone", async ({
  page,
}, info) => {
  const profiles = await family(page);
  const name = "Héloïse Marie-Claire Dupont de Bellevue";
  const response = await page.request.patch(`/api/profiles/${profiles[0].id}`, {
    data: { name, grade: "5e" },
  });
  expect(response.ok(), await response.text()).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/parent");
  const trigger = page.getByTestId("parent-child-trigger");
  await expect(trigger).toContainText(name);
  await trigger.click();
  const menu = page.getByRole("menu", { name: "Enfant accompagné" });
  await expect(menu).toBeVisible();
  await expect(
    menu.getByRole("menuitemradio", { name, exact: true }),
  ).toBeInViewport();
  const bounds = (await menu.boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(16);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(374);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(844);
  for (const option of await menu.getByRole("menuitemradio").all()) {
    const box = (await option.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThanOrEqual(44);
  }
  await page.screenshot({
    path: info.outputPath("selection-enfant-mobile.png"),
  });
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(menu).toHaveCount(0);
  await expect(trigger).toBeInViewport();
  await trigger.click();
  await expect(menu).toBeInViewport();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("afficher l’enfant unique sans proposer de faux choix", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem("revizo.mode", "demo"));
  await page.goto("/parent");
  const trigger = page.getByTestId("parent-child-trigger");
  await expect(trigger).toContainText("Alex");
  await expect(trigger).toBeDisabled();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(
    page.getByRole("menu", { name: "Enfant accompagné" }),
  ).toHaveCount(0);
});
