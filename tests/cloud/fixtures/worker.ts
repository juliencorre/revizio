// Explicit test-only model, never imported by cloud/index.ts or a deployment config.
import { FamilyServer as CloudFamily } from "../../../cloud/index";
import type { AiClient, AiMessage, AiSettings } from "../../../server/types";
export { default } from "../../../cloud/index";
class FixtureAi implements AiClient {
  async available() {
    return true;
  }
  async json(
    _settings: AiSettings,
    messages: AiMessage[],
    schema: Record<string, unknown>,
  ) {
    await new Promise((resolve) => setTimeout(resolve, 150));
    const properties = schema.properties as Record<string, unknown>;
    if (properties.text)
      return {
        text: "Un nombre relatif est positif, négatif ou nul. Pour additionner deux nombres de même signe, on additionne les distances à zéro et on garde le signe.",
        uncertain: true,
      };
    const task = JSON.parse(
      messages.findLast((message) => message.role === "user")!.content,
    ) as { pages: Array<{ sourceId: string; page: number; text: string }> };
    return {
      title: "Fiche de test",
      description: "Double de test",
      sections: [
        {
          kind: "essential",
          title: "L’essentiel",
          content: task.pages[0].text,
          example: "",
          sourceRefs: [
            {
              sourceId: task.pages[0].sourceId,
              page: task.pages[0].page,
              excerpt: task.pages[0].text,
            },
          ],
        },
      ],
    };
  }
}
export class FamilyServer extends CloudFamily {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env, new FixtureAi());
  }
}
