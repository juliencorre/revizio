import { unzipSync } from "fflate/browser";
import { SaxesParser } from "saxes";
import { HttpError } from "./types";

const maxText = 140_000;
const tooLarge = () =>
  new HttpError(
    413,
    "Ce document est trop volumineux à lire. Séparez-le en plusieurs fichiers.",
  );
const invalid = () =>
  new HttpError(
    415,
    "Ce document bureautique est illisible. Ouvrez-le et exportez-le en PDF.",
  );
const utf8 = new TextDecoder("utf-8", { fatal: true });

function xml(
  bytes: Uint8Array,
  events: {
    open?: (tag: { name: string; attributes: Record<string, string> }) => void;
    close?: (name: string) => void;
    text?: (value: string) => void;
  },
) {
  if (!bytes) throw invalid();
  const parser = new SaxesParser();
  const local = (name: string) => name.slice(name.indexOf(":") + 1);
  let depth = 0;
  parser.on("doctype", () => {
    throw invalid();
  });
  parser.on("opentag", (tag) => {
    if (++depth > 128) throw invalid();
    events.open?.({ name: local(tag.name), attributes: tag.attributes });
  });
  parser.on("closetag", (tag) => {
    depth--;
    events.close?.(local(tag.name));
  });
  if (events.text) {
    parser.on("text", events.text);
    parser.on("cdata", events.text);
  }
  parser.write(utf8.decode(bytes)).close();
}

// Read only document content, never embedded files, macros or external relationships.
export function officeText(bytes: Uint8Array): string {
  try {
    let entries = 0,
      inflated = 0;
    const files = unzipSync(bytes, {
      filter: ({ name, size, originalSize }) => {
        if (++entries > 4096) throw tooLarge();
        if (
          !/^(?:\[Content_Types\]\.xml|mimetype|content\.xml|word\/document\.xml|ppt\/(?:presentation\.xml|_rels\/presentation\.xml\.rels|slides\/slide\d+\.xml)|xl\/(?:workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|worksheets\/sheet\d+\.xml))$/.test(
            name,
          )
        )
          return false;
        inflated += Math.max(size, originalSize);
        if (inflated > 8 * 1024 * 1024) throw tooLarge();
        return true;
      },
    });
    let output = "";
    const add = (s: string) => {
      if (output.length + s.length > maxText) throw tooLarge();
      output += s;
    };
    const readParagraphs = (file: Uint8Array, odf = false) => {
      let capture = 0,
        inTableCell = false;
      const container = (name: string) =>
        odf ? ["p", "h"].includes(name) : name === "t";
      xml(file, {
        open: ({ name, attributes }) => {
          if (["tc", "table-cell"].includes(name)) inTableCell = true;
          if (container(name)) capture++;
          if (name === "tab") add("\t");
          if (["br", "cr", "line-break"].includes(name)) add("\n");
          if (odf && name === "s")
            add(" ".repeat(Math.min(100, Number(attributes["text:c"]) || 1)));
        },
        text: (value) => {
          if (capture) add(value);
        },
        close: (name) => {
          if (container(name)) capture--;
          if (["p", "h"].includes(name)) add(inTableCell ? " " : "\n");
          if (["tc", "table-cell"].includes(name)) {
            add("\t");
            inTableCell = false;
          }
          if (["tr", "table-row"].includes(name)) add("\n");
        },
      });
    };
    const orderedParts = (
      dir: "xl" | "ppt",
      main: string,
      element: string,
      path: RegExp,
    ) => {
      const targets = new Map<string, string>();
      xml(files[dir + "/_rels/" + main + ".rels"], {
        open: ({ name, attributes: a }) => {
          if (name !== "Relationship" || a.TargetMode === "External") return;
          const target = a.Target.startsWith("/")
            ? a.Target.slice(1)
            : dir + "/" + a.Target;
          if (path.test(target)) targets.set(a.Id, target);
        },
      });
      const parts: { path: string; label?: string }[] = [];
      const seen = new Set<string>();
      xml(files[dir + "/" + main], {
        open: ({ name, attributes: a }) => {
          if (name !== element || ["hidden", "veryHidden"].includes(a.state))
            return;
          const relation =
            a["r:id"] ??
            Object.entries(a).find(([key]) => key.endsWith(":id"))?.[1];
          const target = relation && targets.get(relation);
          if (target) {
            if (seen.has(target)) throw invalid();
            if (seen.size >= 250) throw tooLarge();
            seen.add(target);
            parts.push({ path: target, label: a.name });
          }
        },
      });
      return parts;
    };
    if (files["[Content_Types].xml"] && files["word/document.xml"]) {
      readParagraphs(files["word/document.xml"]);
    } else if (files["[Content_Types].xml"] && files["ppt/presentation.xml"]) {
      for (const part of orderedParts(
        "ppt",
        "presentation.xml",
        "sldId",
        /^ppt\/slides\/slide\d+\.xml$/,
      )) {
        readParagraphs(files[part.path]);
        add("\n");
      }
    } else if (files["[Content_Types].xml"] && files["xl/workbook.xml"]) {
      const strings: string[] = [];
      let value = "",
        reading = false;
      if (files["xl/sharedStrings.xml"])
        xml(files["xl/sharedStrings.xml"], {
          open: ({ name }) => {
            if (name === "si") value = "";
            if (name === "t") reading = true;
          },
          text: (s) => {
            if (reading) value += s;
          },
          close: (name) => {
            if (name === "t") reading = false;
            if (name === "si") strings.push(value);
          },
        });
      for (const part of orderedParts(
        "xl",
        "workbook.xml",
        "sheet",
        /^xl\/worksheets\/sheet\d+\.xml$/,
      )) {
        let type = "",
          sheet = "",
          row = "";
        let column = 0;
        xml(files[part.path], {
          open: ({ name, attributes }) => {
            if (name === "c") {
              const letters = attributes.r?.match(/^([A-Z]{1,3})\d+$/)?.[1];
              const index = letters
                ? [...letters].reduce(
                    (n, c) => n * 26 + c.charCodeAt(0) - 64,
                    0,
                  )
                : column + 1;
              if (index > 16384 || index <= column) throw invalid();
              row += "\t".repeat(index - column - 1);
              column = index;
              type = attributes.t || "";
              value = "";
            }
            if (name === "v" || name === "t") reading = true;
          },
          text: (s) => {
            if (reading) value += s;
          },
          close: (name) => {
            if (name === "v" || name === "t") reading = false;
            if (name === "c") {
              const cell = type === "s" ? strings[Number(value)] : value;
              if (cell === undefined) throw invalid();
              row += cell + "\t";
              if (row.length + sheet.length > maxText) throw tooLarge();
            }
            if (name === "row") {
              sheet += row.trimEnd() + "\n";
              if (sheet.length > maxText) throw tooLarge();
              column = 0;
              row = "";
            }
          },
        });
        if (sheet.trim()) add((part.label || "Feuille") + "\n" + sheet + "\n");
      }
    } else if (
      files.mimetype &&
      /^application\/vnd\.oasis\.opendocument\.(text|spreadsheet|presentation)(-template)?$/.test(
        utf8.decode(files.mimetype),
      )
    ) {
      readParagraphs(files["content.xml"], true);
    } else {
      throw new HttpError(
        415,
        "Ce format d’archive n’est pas pris en charge. Exportez le document en PDF ou en texte.",
      );
    }
    if (!output.trim())
      throw new HttpError(
        422,
        "Aucun texte lisible dans ce document. S’il contient des images, exportez-le en PDF ou importez les photos.",
      );
    return output.trim();
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw invalid();
  }
}
