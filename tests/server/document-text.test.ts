import { readFile } from "node:fs/promises";
import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { documentText } from "../../server/document-text";

function office(parts: Record<string, string>) {
  return Buffer.from(
    zipSync(
      Object.fromEntries(
        Object.entries(parts).map(([key, value]) => [key, strToU8(value)]),
      ),
    ),
  );
}
const types = { "[Content_Types].xml": "<Types/>" };
const rels = (...targets: string[]) =>
  "<Relationships>" +
  targets
    .map((target, i) => `<Relationship Id="r${i}" Target="${target}"/>`)
    .join("") +
  "</Relationships>";

describe("lecture du contenu des documents", () => {
  it("lit un vrai DOCX même lorsque le fournisseur de fichiers ne renseigne pas le type", async () => {
    const input = await readFile("tests/fixtures/vocabulaire.docx");
    expect(documentText(input, "document", "application/octet-stream")).toMatch(
      /la ventana\s+la fenêtre\s+el jardín\s+le jardin/,
    );
  });
  it("conserve l’ordre des diapositives affiché dans PowerPoint", () => {
    const slide = (s: string) => `<p:sld><a:p><a:t>${s}</a:t></a:p></p:sld>`;
    const bytes = office({
      ...types,
      "ppt/presentation.xml":
        '<p:presentation><p:sldId r:id="r1"/><p:sldId r:id="r0"/></p:presentation>',
      "ppt/_rels/presentation.xml.rels": rels(
        "slides/slide1.xml",
        "slides/slide2.xml",
      ),
      "ppt/slides/slide1.xml": slide("Après"),
      "ppt/slides/slide2.xml": slide("Avant"),
    });
    expect(documentText(bytes, "cours.pptx", "")).toMatch(/^Avant\s+Après$/);
  });
  it("résout les cellules partagées et le texte en ligne d’un classeur", () => {
    const bytes = office({
      ...types,
      "xl/workbook.xml": '<workbook><sheet r:id="r0" name="Mots"/></workbook>',
      "xl/_rels/workbook.xml.rels": rels("/xl/worksheets/sheet1.xml"),
      "xl/sharedStrings.xml":
        "<sst><si><r><t>la </t></r><r><t>mer</t></r></si></sst>",
      "xl/worksheets/sheet1.xml":
        '<worksheet><row><c t="s"><v>0</v></c><c t="inlineStr"><is><t>the sea</t></is></c></row><row><c><v>42</v></c></row></worksheet>',
    });
    expect(documentText(bytes, "cours.xlsx", "")).toBe(
      "Mots\nla mer\tthe sea\n42",
    );
  });
  it.each(["text", "presentation", "spreadsheet"])(
    "lit OpenDocument %s, avec accents et espaces",
    (kind) => {
      const bytes = office({
        mimetype: "application/vnd.oasis.opendocument." + kind,
        "content.xml":
          "<office:document-content><text:p>Été<text:s/>à <text:span>Rome &amp; Paris</text:span></text:p></office:document-content>",
      });
      expect(documentText(bytes, "cours", "")).toBe("Été à Rome & Paris");
    },
  );
  it("lit le CSV UTF-16 et refuse les octets binaires ou les fichiers Office illisibles", () => {
    expect(
      documentText(
        Buffer.from("\uFEFFécole;school", "utf16le"),
        "cours.CSV",
        "",
      ),
    ).toBe("école;school");
    expect(() =>
      documentText(Buffer.from([0, 1, 2, 255]), "cours.txt", "text/plain"),
    ).toThrow(/lisible/);
    expect(() => documentText(Buffer.from("faux"), "cours.docx", "")).toThrow(
      /illisible/,
    );
    expect(() =>
      documentText(office({ notes: "faux" }), "cours.docx", ""),
    ).toThrow(/archive/);
    expect(() =>
      documentText(
        office({
          ...types,
          "word/document.xml": "<w:document><w:drawing/></w:document>",
        }),
        "scan.docx",
        "",
      ),
    ).toThrow(/images/);
    expect(() =>
      documentText(
        office({
          ...types,
          "word/document.xml": "a".repeat(8 * 1024 * 1024 + 1),
        }),
        "cours.docx",
        "",
      ),
    ).toThrow(/volumineux/);
  });
});
