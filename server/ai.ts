import { readFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { createWorker } from "tesseract.js";
import {
  type AiClient,
  type AiMessage,
  type AiSettings,
  type StoredUpload,
} from "./types";
import { SYSTEM, type ExtractedPage } from "./ai-core";
export * from "./ai-core";
const execFile = promisify(execFileCallback);
const baseString = { type: "string" };
const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const object = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
export class OllamaClient implements AiClient {
  async available(settings: AiSettings) {
    try {
      const response = await fetch(`${settings.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(2500),
      });
      if (!response.ok) return false;
      const value = (await response.json()) as {
        models?: { name: string; model: string }[];
      };
      return !!value.models?.some(
        (model) =>
          model.name === settings.model || model.model === settings.model,
      );
    } catch {
      return false;
    }
  }
  async json(
    settings: AiSettings,
    messages: AiMessage[],
    schema: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<unknown> {
    const timeout = AbortSignal.timeout(600_000);
    let response: Response;
    try {
      response = await fetch(`${settings.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: settings.model,
          stream: false,
          messages,
          format: schema,
          options: { temperature: 0, num_ctx: 32768, num_predict: 14000 },
          keep_alive: "10m",
        }),
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      });
    } catch (error) {
      if (signal?.aborted)
        throw new Error(
          "La génération a été interrompue. Vous pouvez la relancer.",
        );
      throw new Error(
        "Le service IA local est indisponible ou a dépassé le délai. Vérifiez Ollama et réessayez.",
      );
    }
    if (!response.ok)
      throw new Error(
        `Le service IA a refusé la génération (${response.status}). Vérifiez le modèle dans les réglages.`,
      );
    try {
      const envelope = (await response.json()) as {
        message?: { content?: string };
        done_reason?: string;
      };
      if (!envelope.message?.content || envelope.done_reason === "length")
        throw new Error("incomplete");
      return JSON.parse(envelope.message.content);
    } catch {
      throw new Error(
        "L’IA a renvoyé un résultat incomplet. Relancez la génération ou réduisez le nombre de pages/questions.",
      );
    }
  }
}
const extractionSchema = {
  type: "object",
  properties: { text: baseString, uncertain: { type: "boolean" } },
  required: ["text", "uncertain"],
  additionalProperties: false,
};
export async function extractUpload(
  upload: StoredUpload,
  client: AiClient,
  settings: AiSettings,
  tempRoot: string,
  signal?: AbortSignal,
): Promise<ExtractedPage[]> {
  async function readPage(bytes: Buffer, page: number): Promise<ExtractedPage> {
    // Real clients use independent OCR for printed text. Injected test clients do
    // not download language data or pretend to exercise a real OCR engine.
    if (client instanceof OllamaClient) {
      const cachePath = join(tempRoot, "..", ".cache", "ocr");
      await mkdir(cachePath, { recursive: true, mode: 0o700 });
      let worker: Awaited<ReturnType<typeof createWorker>> | undefined;
      try {
        worker = await createWorker("fra", 1, { cachePath });
        const abort = () => {
          void worker?.terminate();
        };
        signal?.addEventListener("abort", abort, { once: true });
        try {
          const result = (await worker.recognize(bytes)).data;
          const content = result.text.trim();
          if (content.length >= 80 && result.confidence >= 65)
            return {
              sourceId: upload.id,
              name: upload.name,
              page,
              text: content,
              uncertain:
                result.confidence < 90 || /\uFFFD|\[illisible\]/i.test(content),
            };
          const fallback = await vision(bytes, page);
          if (content.length > fallback.text.length && content.length >= 80)
            return {
              sourceId: upload.id,
              name: upload.name,
              page,
              text: content,
              uncertain: true,
            };
          return { ...fallback, uncertain: true };
        } finally {
          signal?.removeEventListener("abort", abort);
        }
      } catch (error) {
        if (signal?.aborted) throw new Error("Génération interrompue.");
        return { ...(await vision(bytes, page)), uncertain: true };
      } finally {
        await worker?.terminate().catch(() => {});
      }
    }
    return vision(bytes, page);
  }
  async function vision(bytes: Buffer, page: number): Promise<ExtractedPage> {
    const value = object(
      await client.json(
        settings,
        [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content:
              "Transcris fidèlement le texte visible de cette page de cours, dans son ordre. Garde signes, fractions, accents et exemples. Ne résume pas. Pour une zone illisible, écris [illisible] et uncertain=true. Décris brièvement les schémas utiles entre crochets, sans inventer de valeurs.",
            images: [bytes.toString("base64")],
          },
        ],
        extractionSchema,
        signal,
      ),
    );
    const result = text(value.text);
    return {
      sourceId: upload.id,
      name: upload.name,
      page,
      text: result,
      uncertain:
        value.uncertain === true ||
        result.length < 20 ||
        /\[illisible\]|\uFFFD/i.test(result),
    };
  }
  if (upload.mimeType !== "application/pdf")
    return [await readPage(await readFile(upload.path), 1)];
  let pageCount = 1;
  try {
    const info = await execFile("pdfinfo", [upload.path], {
      timeout: 15000,
      maxBuffer: 200000,
      signal,
    });
    pageCount = Number(info.stdout.match(/^Pages:\s+(\d+)/m)?.[1] ?? 1);
  } catch {}
  if (pageCount > 30)
    throw new Error(
      "Ce PDF dépasse 30 pages. Importez-le en plusieurs cours pour garder une relecture facile.",
    );
  let extracted: string[] = [];
  try {
    const result = await execFile("pdftotext", ["-layout", upload.path, "-"], {
      timeout: 30000,
      maxBuffer: 4 * 1024 * 1024,
      signal,
    });
    extracted = result.stdout.split("\f");
    if (extracted.at(-1)?.trim() === "") extracted.pop();
    pageCount = Math.max(pageCount, extracted.length);
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT")
      throw new Error(
        "L’extraction PDF nécessite Poppler (pdftotext et pdftoppm). Installez-le sur le serveur.",
      );
  }
  await mkdir(tempRoot, { recursive: true, mode: 0o700 });
  const temporary = await mkdtemp(join(tempRoot, "pdf-"));
  try {
    const pages: ExtractedPage[] = [];
    for (let index = 0; index < pageCount; index++) {
      if (signal?.aborted) throw new Error("Génération interrompue.");
      const content = extracted[index]?.trim() ?? "";
      if (content.length >= 35 && !content.includes("\uFFFD"))
        pages.push({
          sourceId: upload.id,
          name: upload.name,
          page: index + 1,
          text: content,
          uncertain: false,
        });
      else {
        const output = join(temporary, `page-${index + 1}`);
        try {
          await execFile(
            "pdftoppm",
            [
              "-f",
              String(index + 1),
              "-l",
              String(index + 1),
              "-scale-to",
              "1800",
              "-png",
              "-singlefile",
              upload.path,
              output,
            ],
            { timeout: 30000, maxBuffer: 300000, signal },
          );
        } catch {
          throw new Error(
            "Cette page PDF n’a pas pu être rendue. Vérifiez que le document est lisible et que Poppler est installé.",
          );
        }
        pages.push(await readPage(await readFile(output + ".png"), index + 1));
      }
    }
    return pages;
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
