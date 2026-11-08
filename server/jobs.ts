import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type {
  AiJob,
  Course,
  CourseSource,
  EnglishSettings,
  QuestionType,
} from "../src/domain/model";
import { FamilyDatabase } from "./database";
import {
  extractUpload,
  generateCourse,
  generateEnglish,
  generateExercises,
  type ExtractedPage,
} from "./ai";
import { HttpError, isoNow, type AiClient, type StoredJob } from "./types";

export class JobQueue {
  private running = false;
  private stopped = false;
  private controller: AbortController | null = null;
  constructor(
    private database: FamilyDatabase,
    private client: AiClient,
  ) {
    for (const job of database.jobs())
      if (job.status === "running")
        database.updateJob(job.id, {
          status: "queued",
          stage: "reprise",
          message: "Reprise après redémarrage du serveur.",
        });
  }
  enqueue(
    familyId: string,
    profileId: string,
    kind: AiJob["kind"],
    payload: Record<string, unknown>,
  ): StoredJob {
    if (
      this.database
        .jobs(familyId)
        .filter((j) => j.status === "queued" || j.status === "running")
        .length >= 20
    )
      throw new HttpError(
        429,
        "Plusieurs générations sont déjà en attente. Laissez-les terminer.",
      );
    const job: StoredJob = {
      id: randomUUID(),
      familyId,
      profileId,
      kind,
      payload,
      status: "queued",
      createdAt: isoNow(),
      updatedAt: isoNow(),
      stage: "attente",
      message: "En attente de génération.",
    };
    this.database.saveJob(job);
    this.start();
    return job;
  }
  retry(id: string): StoredJob {
    const job = this.database.job(id);
    if (!job) throw new HttpError(404, "Cette génération est introuvable.");
    if (job.status !== "failed")
      throw new HttpError(
        409,
        "Cette génération n’a pas besoin d’être relancée.",
      );
    this.database.updateJob(id, {
      status: "queued",
      error: undefined,
      result: undefined,
      stage: "attente",
      message: "Nouvel essai en attente.",
    });
    this.start();
    return this.database.job(id)!;
  }
  start() {
    if (!this.running && !this.stopped) {
      this.running = true;
      void this.drain();
    }
  }
  async close() {
    this.stopped = true;
    this.controller?.abort();
    for (let i = 0; this.running && i < 100; i++)
      await new Promise((resolve) => setTimeout(resolve, 20));
  }
  private async drain() {
    try {
      while (!this.stopped) {
        const job = this.database
          .jobs()
          .reverse()
          .find((j) => j.status === "queued");
        if (!job) break;
        this.controller = new AbortController();
        try {
          await this.run(job, this.controller.signal);
        } catch (error) {
          this.database.updateJob(job.id, {
            status: this.stopped ? "queued" : "failed",
            stage: "erreur",
            message:
              "La génération n’a pas abouti. Vos documents sont conservés.",
            error:
              error instanceof Error
                ? error.message
                : "La génération a échoué.",
          });
        }
      }
    } finally {
      this.running = false;
      this.controller = null;
    }
  }
  private async run(job: StoredJob, signal: AbortSignal) {
    this.database.updateJob(job.id, {
      status: "running",
      stage: "lecture",
      message: "Lecture des documents et préparation du contenu.",
    });
    const settings = this.database.settings(job.familyId);
    const payload = job.payload;
    const ids = Array.isArray(payload.sourceIds)
      ? payload.sourceIds.filter((id): id is string => typeof id === "string")
      : [];
    const pages: ExtractedPage[] = [];
    const sources: CourseSource[] = [];
    for (const id of ids) {
      const upload = this.database.upload(id);
      if (
        !upload ||
        upload.familyId !== job.familyId ||
        upload.profileId !== job.profileId
      )
        throw new Error("Un document source est introuvable pour ce profil.");
      this.database.updateJob(job.id, {
        stage: "lecture",
        message: `Lecture de ${upload.name} (${sources.length + 1}/${ids.length}).`,
      });
      const extracted = await extractUpload(
        upload,
        this.client,
        settings,
        join(this.database.dataDir, "temporary"),
        signal,
      );
      pages.push(...extracted);
      sources.push({
        id: upload.id,
        storageId: upload.id,
        name: upload.name,
        uri: `/api/uploads/${upload.id}`,
        mimeType: upload.mimeType,
        rotation: upload.rotation,
        extractedText: extracted
          .map((p) => `Page ${p.page}\n${p.text}`)
          .join("\n\n"),
        uncertain: extracted.some((p) => p.uncertain),
      });
    }
    const data = this.database.data(job.profileId).data;
    let result: AiJob["result"];
    if (job.kind === "course") {
      const old =
        typeof payload.existingCourseId === "string"
          ? data.courses.find((c) => c.id === payload.existingCourseId)
          : undefined;
      let sourceText = [
        old?.sourceText,
        typeof payload.sourceText === "string" ? payload.sourceText : "",
        ...pages.map(
          (p) =>
            `[${p.name} · page ${p.page} · source ${p.sourceId}]\n${p.text}`,
        ),
      ]
        .filter(Boolean)
        .join("\n\n");
      if (!sourceText.trim())
        throw new Error(
          "Ajoutez un document lisible ou le texte du cours avant de générer la fiche.",
        );
      if (sourceText.length > 150000)
        throw new Error(
          "Ce cours est trop volumineux. Séparez-le en plusieurs chapitres.",
        );
      this.database.updateJob(job.id, {
        stage: "fiche",
        message: "L’IA prépare les notions, méthodes et exemples à relire.",
      });
      const allSources = [...(old?.sources ?? []), ...sources].filter(
        (source, index, array) =>
          array.findIndex((other) => other.id === source.id) === index,
      );
      const course = await generateCourse(
        this.client,
        settings,
        {
          title: String(payload.title ?? old?.title ?? "Nouveau cours"),
          subjectId: String(payload.subjectId ?? old?.subjectId ?? ""),
          sourceText,
          pages,
          sources: allSources,
        },
        signal,
      );
      result = {
        course: {
          ...course,
          ...(old
            ? {
                originId: old.originId ?? old.id,
                revision: (old.revision ?? 1) + 1,
              }
            : {}),
          generationJobId: job.id,
        },
      };
    } else if (job.kind === "exercises") {
      const courseIds = Array.isArray(payload.courseIds)
        ? payload.courseIds.filter((id): id is string => typeof id === "string")
        : [];
      const courses = courseIds
        .map((id) =>
          data.courses.find(
            (course) => course.id === id && course.status === "published",
          ),
        )
        .filter((v): v is Course => !!v);
      if (!courses.length || courses.length !== courseIds.length)
        throw new Error(
          "Sélectionnez des cours publiés pour préparer les exercices.",
        );
      if (courses.some((course) => course.subjectId !== courses[0].subjectId))
        throw new Error(
          "Les cours sélectionnés doivent appartenir à une même matière.",
        );
      this.database.updateJob(job.id, {
        stage: "exercices",
        message: "L’IA prépare les questions et leurs corrections.",
      });
      const english = payload.english
        ? (payload.english as unknown as EnglishSettings)
        : undefined;
      result = {
        questions: await generateExercises(
          this.client,
          settings,
          {
            courses,
            types: payload.types as QuestionType[],
            level: String(payload.level ?? "practice"),
            count: Number(payload.count ?? 5),
            english,
          },
          signal,
        ),
      };
    } else {
      this.database.updateJob(job.id, {
        stage: "anglais",
        message: "L’IA repère les mots, verbes et temps à vérifier.",
      });
      if (!pages.length)
        throw new Error(
          "Ajoutez au moins un document pour extraire le vocabulaire.",
        );
      result = await generateEnglish(this.client, settings, pages, signal);
    }
    this.database.updateJob(job.id, {
      status: "succeeded",
      stage: "relecture",
      message: "Le brouillon est prêt. Vérifiez-le avant de le publier.",
      result,
      error: undefined,
    });
  }
}
export function publicJob(job: StoredJob): AiJob {
  return {
    id: job.id,
    kind: job.kind,
    status: job.status,
    stage: job.stage,
    message: job.message,
    createdAt: job.createdAt,
    result: job.result,
    error: job.error,
  };
}
