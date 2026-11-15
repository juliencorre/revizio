import { Buffer } from "node:buffer";
import { extractImages, extractText, getDocumentProxy } from "unpdf";
import { SYSTEM, type ExtractedPage } from "../server/ai-core";
import type {
  AiClient,
  AiMessage,
  AiSettings,
  StoredUpload,
} from "../server/types";
import type { PrivateFiles } from "../server/runtime";

export const CLOUD_MODEL = "@cf/google/gemma-4-26b-a4b-it";
export const cloudAiDefaults: AiSettings = {
  baseUrl: "https://workers.ai",
  model: CLOUD_MODEL,
};
export interface GemmaBinding {
  run(
    model: typeof CLOUD_MODEL,
    input: Ai_Cf_Google_Gemma_4_26B_A4B_It_Input,
    options?: AiOptions,
  ): Promise<ChatCompletionsOutput>;
}

export class CloudAi implements AiClient {
  constructor(private binding: GemmaBinding) {}
  async available(): Promise<boolean> {
    return !!this.binding;
  }
  async json(
    _settings: AiSettings,
    messages: AiMessage[],
    schema: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<unknown> {
    const input: ChatCompletionMessageParam[] = messages.map((message) =>
      message.role === "user"
        ? {
            role: "user",
            content: [
              { type: "text", text: message.content },
              ...(message.images ?? []).map((data) => ({
                type: "image_url" as const,
                image_url: { url: "data:image/png;base64," + data },
              })),
            ],
          }
        : { role: message.role, content: message.content },
    );
    const exerciseOutput =
      schema.properties &&
      typeof schema.properties === "object" &&
      "questions" in schema.properties;
    if (exerciseOutput) {
      // Large nested exercise schemas can stall constrained decoding. JSON mode
      // remains machine-readable; the shared generator validates every question.
      input.unshift({
        role: "system",
        content:
          "Réponds uniquement avec un objet JSON valide conforme à ce schéma : " +
          JSON.stringify(schema),
      });
    }
    try {
      const result = await this.binding.run(
        CLOUD_MODEL,
        {
          messages: input,
          response_format: exerciseOutput
            ? { type: "json_object" }
            : {
                type: "json_schema",
                json_schema: { name: "revision", schema, strict: true },
              },
          temperature: 0,
          max_completion_tokens: 10000,
          chat_template_kwargs: { enable_thinking: false },
        },
        {
          signal: signal
            ? AbortSignal.any([signal, AbortSignal.timeout(600000)])
            : AbortSignal.timeout(600000),
        },
      );
      const choice = result.choices[0];
      if (!choice?.message.content || choice.finish_reason === "length")
        throw new Error("incomplete");
      return JSON.parse(choice.message.content);
    } catch (error) {
      if (signal?.aborted)
        throw new Error(
          "La préparation a été interrompue. Relancez-la depuis Mes préparations.",
        );
      const message = error instanceof Error ? error.message : "";
      if (/quota|neuron|daily.{0,30}limit|limit.{0,30}daily/i.test(message))
        throw new Error(
          "Le quota gratuit de l’IA Cloudflare est atteint. Réessayez après son renouvellement quotidien ; vos documents sont conservés.",
        );
      if (/\b429\b|rate.?limit/i.test(message))
        throw new Error(
          "L’IA Cloudflare est momentanément très sollicitée. Patientez puis relancez la préparation.",
        );
      throw new Error(
        "L’IA Cloudflare n’a pas fourni de résultat exploitable. Réessayez avec moins de pages ou de questions. Vos documents sont conservés.",
      );
    }
  }
}

const extractionSchema = {
  type: "object",
  properties: { text: { type: "string" }, uncertain: { type: "boolean" } },
  required: ["text", "uncertain"],
  additionalProperties: false,
};
export function cloudExtractor(
  files: PrivateFiles,
): typeof import("../server/ai").extractUpload {
  return async (
    upload: StoredUpload,
    client: AiClient,
    settings: AiSettings,
    _tempRoot: string,
    signal?: AbortSignal,
  ): Promise<ExtractedPage[]> => {
    async function vision(
      images: Uint8Array[],
      page: number,
    ): Promise<ExtractedPage> {
      const result = await client.json(
        settings,
        [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content:
              "Transcris fidèlement le texte visible de cette page de cours dans son ordre. Conserve les signes, les fractions, les accents et les exemples. Ne résume pas. Indique [illisible] et uncertain=true si une zone est illisible. Les éventuelles images jointes appartiennent à la même page.",
            images: images.map((bytes) =>
              Buffer.from(bytes).toString("base64"),
            ),
          },
        ],
        extractionSchema,
        signal,
      );
      const value =
        result && typeof result === "object"
          ? (result as Record<string, unknown>)
          : {};
      const text = typeof value.text === "string" ? value.text.trim() : "";
      if (text.length < 20)
        throw new Error(
          "Cette page est trop peu lisible. Ajoutez une photo plus nette ou saisissez son texte.",
        );
      return {
        sourceId: upload.id,
        name: upload.name,
        page,
        text,
        uncertain: true,
      };
    }
    const bytes = await files.read(upload.path);
    if (upload.mimeType !== "application/pdf")
      return [await vision([bytes], 1)];
    const pdf = await getDocumentProxy(Uint8Array.from(bytes), {
      isOffscreenCanvasSupported: false,
      isImageDecoderSupported: false,
      maxImageSize: 12_500_000,
      disableFontFace: true,
    });
    try {
      if (pdf.numPages > 20)
        throw new Error(
          "Ce PDF contient plus de 20 pages. Séparez-le en plusieurs cours.",
        );
      const { text } = await extractText(pdf, { mergePages: false });
      const pages: ExtractedPage[] = [];
      for (let index = 0; index < pdf.numPages; index++) {
        signal?.throwIfAborted();
        const content = text[index]?.trim() ?? "";
        if (content.length >= 35 && !content.includes("\uFFFD")) {
          pages.push({
            sourceId: upload.id,
            name: upload.name,
            page: index + 1,
            text: content,
            uncertain: false,
          });
        } else {
          const images = await extractImages(pdf, index + 1, { format: "png" });
          // Full-page scans contain one raster. Reject complex composites instead of losing content.
          if (!images.length || images.length > 4)
            throw new Error(
              `La page ${index + 1} nécessite une photo séparée ou un texte saisi pour être lue fidèlement.`,
            );
          pages.push(
            await vision(
              images.map((image) => image.data),
              index + 1,
            ),
          );
        }
      }
      return pages;
    } finally {
      await pdf.cleanup();
    }
  };
}
