import type { AiClient, AiMessage, AiSettings } from "./types";

export const ANTHROPIC_URL = "https://api.anthropic.com";
export const ANTHROPIC_MODEL = "claude-sonnet-5-5";
export const anthropicDefaults = (model = ANTHROPIC_MODEL): AiSettings => ({
  baseUrl: ANTHROPIC_URL,
  model,
});

// Claude's JSON grammar supports only a subset of JSON Schema. Keep the
// original constraints as instructions; ai-core still validates the result.
function outputSchema(
  schema: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...schema };
  const constraints: string[] = [];
  for (const key of [
    "minimum",
    "maximum",
    "minLength",
    "maxLength",
    "minItems",
    "maxItems",
  ]) {
    if (!(key in result)) continue;
    if (key === "minItems" && (result[key] === 0 || result[key] === 1))
      continue;
    constraints.push(`${key}=${result[key]}`);
    delete result[key];
  }
  if (constraints.length)
    result.description = [
      schema.description,
      `Contraintes à respecter : ${constraints.join(", ")}.`,
    ]
      .filter(Boolean)
      .join(" ");
  if (schema.properties && typeof schema.properties === "object")
    result.properties = Object.fromEntries(
      Object.entries(schema.properties).map(([key, value]) => [
        key,
        outputSchema(value as Record<string, unknown>),
      ]),
    );
  if (schema.items && typeof schema.items === "object")
    result.items = outputSchema(schema.items as Record<string, unknown>);
  if (schema.type === "object") result.additionalProperties = false;
  return result;
}

export class AnthropicClient implements AiClient {
  constructor(private readonly apiKey: string | undefined) {}

  private headers() {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.apiKey!.trim()}`,
      "anthropic-version": "2026-10-21",
    };
  }

  async available(settings: AiSettings): Promise<boolean> {
    if (!this.apiKey?.trim()) return false;
    try {
      const response = await fetch(
        `${ANTHROPIC_URL}/v1/models/${encodeURIComponent(settings.model)}`,
        {
          headers: this.headers(),
          // workerd supports manual redirects; response.ok rejects any 3xx.
          redirect: "manual",
          signal: AbortSignal.timeout(5000),
        },
      );
      if (!response.ok) return false;
      const model = (await response.json()) as { id?: unknown };
      return typeof model.id === "string" && !!model.id;
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
    if (!this.apiKey?.trim())
      throw new Error(
        "La clé Anthropic n’est pas configurée sur le serveur (ANTHROPIC_API_KEY).",
      );
    const requestSignal = signal
      ? AbortSignal.any([signal, AbortSignal.timeout(600_000)])
      : AbortSignal.timeout(600_000);
    let response: Response;
    try {
      // Never use a client-supplied URL for an authenticated request.
      response = await fetch(`${ANTHROPIC_URL}/v1/messages`, {
        method: "POST",
        headers: this.headers(),
        // Never forward the API key to a redirect target, including on Workers.
        redirect: "manual",
        signal: requestSignal,
        body: JSON.stringify({
          model: settings.model,
          max_tokens: 14000,
          system: messages
            .filter((message) => message.role === "system")
            .map((message) => message.content)
            .join("\n\n"),
          messages: messages
            .filter((message) => message.role !== "system")
            .map((message) => ({
              role: message.role,
              content: [
                ...(message.images ?? []).map((data) => ({
                  type: "image",
                  source: { type: "base64", media_type: "image/png", data },
                })),
                { type: "text", text: message.content },
              ],
            })),
          output_config: {
            format: { type: "json_schema", schema: outputSchema(schema) },
          },
        }),
      });
    } catch {
      throw new Error(
        signal?.aborted
          ? "La génération a été interrompue. Vous pouvez la relancer."
          : "Le service Anthropic est indisponible ou a dépassé le délai. Réessayez plus tard.",
      );
    }
    // Do not store provider response bodies: they may echo private inputs.
    if (!response.ok) {
      if (response.status === 401 || response.status === 403)
        throw new Error(
          "Anthropic refuse l’accès. Vérifiez la clé API et ses autorisations sur le serveur.",
        );
      if (response.status === 402)
        throw new Error(
          "La facturation Anthropic bloque l’accès. Vérifiez les crédits et les informations de paiement du compte API.",
        );
      if (response.status === 429)
        throw new Error(
          "La limite d’utilisation Anthropic est atteinte. Vérifiez les quotas ou crédits du compte API, puis relancez la préparation.",
        );
      if (response.status === 404)
        throw new Error(
          "Ce modèle Anthropic est indisponible. Vérifiez ANTHROPIC_MODEL sur le serveur.",
        );
      throw new Error(
        `Anthropic a refusé la génération (${response.status}). Vérifiez le modèle, les crédits et la disponibilité du service.`,
      );
    }
    try {
      const result = (await response.json()) as {
        stop_reason?: string;
        content?: { type: string; text?: string }[];
      };
      if (result.stop_reason !== "end_turn") throw new Error("incomplete");
      const content = result.content
        ?.filter((block) => block.type === "text")
        .map((block) => block.text ?? "")
        .join("");
      if (!content) throw new Error("empty");
      return JSON.parse(content);
    } catch {
      if (signal?.aborted)
        throw new Error(
          "La génération a été interrompue. Vous pouvez la relancer.",
        );
      throw new Error(
        "Anthropic n’a pas fourni un résultat JSON complet. Relancez avec moins de pages ou de questions ; vos documents sont conservés.",
      );
    }
  }
}
