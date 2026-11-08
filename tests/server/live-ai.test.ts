import { describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import type { FastifyInstance } from "fastify";
import { createApp } from "../../server/app";
import { questionError } from "../../src/domain/learning";
import type { AiJob, Course, LearningData } from "../../src/domain/model";
import { numericKey, requestedCalculation, calculate } from "../../server/arithmetic";
import { OllamaClient } from "../../server/ai";
import type { AiMessage, AiSettings } from "../../server/types";

function samplePdf(): Buffer {
  const lines = [
    "LES PRIORITES OPERATOIRES",
    "Calculer les parentheses en premier.",
    "Puis les multiplications et divisions.",
    "Enfin les additions et soustractions.",
    "Exemple : 3 + 4 * 2 = 11.",
    "Exemple : (3 + 4) * 2 = 14.",
  ];
  const stream =
    "BT /F1 16 Tf 50 780 Td " +
    lines
      .map(
        (line, index) =>
          (index ? "0 -32 Td " : "") +
          "(" +
          line.replace(/[()\\]/g, "\\$&") +
          ") Tj",
      )
      .join("\n") +
    " ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let output = "%PDF-1.4\n";
  const offsets = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(output));
    output += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(output);
  output +=
    `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
    offsets
      .slice(1)
      .map((n) => String(n).padStart(10, "0") + " 00000 n \n")
      .join("") +
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(output);
}
async function upload(
  app: FastifyInstance,
  token: string,
  profileId: string,
  name: string,
  mime: string,
  bytes: Buffer,
) {
  const boundary = "live-ollama-fixture";
  const response = await app.inject({
    method: "POST",
    url: "/api/uploads?profileId=" + profileId,
    headers: {
      authorization: "Bearer " + token,
      "content-type": "multipart/form-data; boundary=" + boundary,
    },
    payload: Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: ${mime}\r\n\r\n`,
      ),
      bytes,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]),
  });
  expect(response.statusCode, response.body).toBe(200);
  return response.json();
}
async function wait(
  app: FastifyInstance,
  token: string,
  id: string,
): Promise<AiJob> {
  const start = Date.now();
  let stage = "";
  while (Date.now() - start < 600000) {
    const response = await app.inject({
      url: "/api/jobs/" + id,
      headers: { authorization: "Bearer " + token },
    });
    expect(response.statusCode, response.body).toBe(200);
    const job = response.json().job as AiJob;
    if (job.stage !== stage) {
      stage = job.stage ?? "";
      console.log("IA locale :", job.message);
    }
    if (job.status === "succeeded") return job;
    if (job.status === "failed")
      throw new Error(job.error ?? "Échec de génération.");
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("Le test IA a dépassé dix minutes.");
}

describe.runIf(process.env.REVIZIO_LIVE_AI === "1")(
  "Ollama réel — vision, PDF et cinq formats",
  () => {
    it("lit une image et un PDF, propose des fiches et génère une série multi-cours relisible", async () => {
      const started = Date.now(),
        dir = await mkdtemp(join(tmpdir(), "revizio-live-"));
      const app = await createApp({
        dataDir: dir,
        staticDir: join(dir, "none"),
        rateLimit: false,
        aiClient: new class extends OllamaClient {
          sequence = 0;
          override async json(settings: AiSettings, messages: AiMessage[], schema: Record<string, unknown>, signal?: AbortSignal) {
            const result = await super.json(settings, messages, schema, signal);
            await mkdir("artifacts", { recursive: true });
            await writeFile(`artifacts/live-ai-raw-${++this.sequence}.json`, JSON.stringify({ messages, result }, null, 2));
            return result;
          }
        }(),
      });
      try {
        expect((await app.inject("/api/health")).json().ai.available).toBe(
          true,
        );
        const setup = await app.inject({
          method: "POST",
          url: "/api/setup",
          payload: {
            parentName: "Validation IA réelle",
            email: "live@example.test",
            password: "Live-testing-42!",
            childName: "Profil de test",
            grade: "5e",
            pin: "2468",
          },
        });
        expect(setup.statusCode, setup.body).toBe(200);
        const { token, profiles } = setup.json();
        const profileId = profiles[0].id,
          headers = { authorization: "Bearer " + token };
        const image = await sharp(
          Buffer.from(
            '<svg xmlns="http://www.w3.org/2000/svg" width="1500" height="850"><rect width="1500" height="850" fill="white"/><g fill="black" font-family="DejaVu Sans" font-size="36"><text x="70" y="90">LES NOMBRES RELATIFS</text><text x="70" y="170">Un nombre relatif est positif, negatif ou nul.</text><text x="70" y="250">Meme signe : additionner les distances a zero</text><text x="70" y="310">et garder le signe commun.</text><text x="70" y="390">Exemple : (-3) + (-4) = -7.</text><text x="70" y="470">Signes contraires : soustraire les distances a zero</text><text x="70" y="530">et garder le signe du nombre le plus eloigne de zero.</text><text x="70" y="610">Exemple : (-8) + (+5) = -3.</text></g></svg>',
          ),
        )
          .png()
          .toBuffer();
        const photo = await upload(
          app,
          token,
          profileId,
          "relatifs.png",
          "image/png",
          image,
        );
        const photoRequest = await app.inject({
          method: "POST",
          url: "/api/ai/course",
          headers,
          payload: {
            profileId,
            subjectId: "maths",
            title: "Les nombres relatifs",
            sourceIds: [photo.id],
          },
        });
        expect(photoRequest.statusCode, photoRequest.body).toBe(200);
        const photoJob = await wait(app, token, photoRequest.json().job.id);
        const photoCourse = photoJob.result!.course!;
        expect(photoCourse.sourceText?.toLowerCase()).toContain("relatif");
        expect(photoCourse.sourceText!.length).toBeGreaterThan(250);
        expect(photoCourse.sourceText).toContain("(-3)");
        expect(photoCourse.sourceText?.toLowerCase()).toContain("signe");
        expect(
          photoCourse.sections?.some(
            (section) =>
              section.kind === "essential" && section.content.length > 20,
          ),
        ).toBe(true);
        for (const section of photoCourse.sections!) {
          expect(section.sourceRefs?.length).toBeGreaterThan(0);
          expect(section.content).toBe(section.sourceRefs!.map((ref) => ref.excerpt).join("\n\n"));
        }
        const pdf = await upload(
          app,
          token,
          profileId,
          "priorites.pdf",
          "application/pdf",
          samplePdf(),
        );
        const pdfRequest = await app.inject({
          method: "POST",
          url: "/api/ai/course",
          headers,
          payload: {
            profileId,
            subjectId: "maths",
            title: "Les priorités opératoires",
            sourceIds: [pdf.id],
          },
        });
        const pdfJob = await wait(app, token, pdfRequest.json().job.id);
        const pdfCourse = pdfJob.result!.course!;
        expect(pdfCourse.sourceText?.toLowerCase()).toContain("parentheses");
        const data = (
          await app.inject({ url: "/api/data", headers })
        ).json() as { data: LearningData; revision: number };
        const courses = [photoCourse, pdfCourse].map(
          (course, index) =>
            ({
              ...course,
              id: "live-course-" + index,
              subjectId: "maths",
              title: course.title ?? "Cours de test",
              description: course.description ?? "",
              status: "published",
              updatedAt: new Date().toISOString(),
              sections: course.sections ?? [],
              sources: course.sources ?? [],
            }) as Course,
        );
        const saved = await app.inject({
          method: "PUT",
          url: "/api/data",
          headers,
          payload: {
            data: { ...data.data, courses },
            revision: data.revision,
            profileId,
          },
        });
        expect(saved.statusCode, saved.body).toBe(200);
        const exerciseRequest = await app.inject({
          method: "POST",
          url: "/api/ai/exercises",
          headers,
          payload: {
            profileId,
            courseIds: courses.map((course) => course.id),
            types: [
              "single-choice",
              "true-false",
              "fill-blank",
              "short-answer",
              "problem",
            ],
            level: "practice",
            count: 5,
          },
        });
        expect(exerciseRequest.statusCode, exerciseRequest.body).toBe(200);
        const exerciseJob = await wait(
          app,
          token,
          exerciseRequest.json().job.id,
        );
        const questions = exerciseJob.result!.questions!;
        expect(questions).toHaveLength(5);
        expect(new Set(questions.map((q) => q.type)).size).toBe(5);
        for (const question of questions) {
          expect(questionError(question)).toBeNull();
          expect(new Set(question.choices.map((choice) => numericKey(choice.label))).size).toBe(question.choices.length);
          expect(question.expectedAnswers?.every((answer) => answer.length <= 80) ?? true).toBe(true);
          const calculation = requestedCalculation(question.prompt);
          if (calculation && ["problem", "fill-blank", "short-answer"].includes(question.type ?? ""))
            expect(question.expectedAnswers?.some((answer) => calculate(answer) === calculation.value)).toBe(true);
        }
        expect(
          (await app.inject({ url: "/api/data", headers })).json().data.series,
        ).toEqual([]);
        await mkdir("artifacts", { recursive: true });
        await writeFile(
          "artifacts/live-ai-report.json",
          JSON.stringify(
            {
              checkedAt: new Date().toISOString(),
              model: "ministral-3:8b",
              durationSeconds: Math.round((Date.now() - started) / 1000),
              photoCourse,
              pdfCourse,
              questions,
              autoPublished: false,
            },
            null,
            2,
          ),
        );
        console.log(
          "Validation Ollama réelle terminée en",
          Math.round((Date.now() - started) / 1000),
          "secondes.",
        );
      } finally {
        await app.close();
        await rm(dir, { recursive: true, force: true });
      }
    }, 900000);
  },
);
