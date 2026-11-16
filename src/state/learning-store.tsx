import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { initialData, subjects } from "../domain/fixtures";
import {
  answerQuestionInData,
  clone,
  completeAttemptInData,
  markReviewedInData,
  publishCourseInData,
  publishSeriesInData,
  startAttemptInData,
  type PublicationResult,
} from "../domain/learning";
import {
  buildEnglishMaterial,
  emptyEnglishSettings,
  englishValidation,
  normalizeEnglish,
} from "../domain/english";
import { createGeneralReview } from "../domain/vocabulary-repertoire";
import {
  dateOnly,
  moveRevisionStep,
  planValidation,
  reschedulePlan,
} from "../domain/planning";
import {
  answerVocabularySession,
  createVocabularySession,
  isVocabularyList,
  legacyEnglishListId,
  legacyEnglishVocabulary,
  normalizeVocabularyList,
  retainRemovedVocabulary,
  vocabularyListError,
  vocabularyListsFor,
} from "../domain/vocabulary";
import type {
  AiJob,
  ChildProfile,
  Course,
  CourseDraftInput,
  CourseSource,
  EnglishSettings,
  ExerciseSeries,
  LearningData,
  PlanDraftInput,
  QuestionType,
  RevisionPlan,
  SeriesDraftInput,
  VocabularyLanguage,
  VocabularyList,
  VocabularyMode,
  VocabularySession,
} from "../domain/model";
import { createLearningPersistence, STORAGE_KEY } from "./persistence";
import { useSession } from "./session";
import { FamilySync, type SyncStatus } from "./family-sync";
import { apiFetch, uploadCourseSource, waitForJob } from "@/services/api";
import { cacheSource } from "@/services/source-cache";

export interface AttemptOptions {
  restart?: boolean;
  mode?: "practice" | "exam";
  timeLimitSeconds?: number;
  planId?: string;
  stepId?: string;
}
export interface GenerateSeriesInput {
  title: string;
  courseIds: string[];
  subjectId: string;
  types: QuestionType[];
  level: ExerciseSeries["level"];
  count: number;
  dueDate?: string;
}
export interface LearningContextValue extends Omit<
  LearningData,
  "version" | "plans" | "english" | "vocabularyLists" | "vocabularySessions"
> {
  subjects: typeof subjects;
  plans: RevisionPlan[];
  english: EnglishSettings;
  vocabularyLists: VocabularyList[];
  vocabularySessions: VocabularySession[];
  isReady: boolean;
  storageError: string | null;
  childName: string;
  childGrade: string;
  profiles: ChildProfile[];
  activeProfileId: string;
  isDemo: boolean;
  serverAvailable: boolean;
  syncStatus: SyncStatus;
  syncNow(): Promise<void>;
  reloadFromServer(): Promise<void>;
  resolveSyncConflict(strategy: "local" | "server"): Promise<void>;
  addCourse(input: CourseDraftInput): string;
  updateCourse(id: string, updates: Partial<Omit<Course, "id">>): void;
  publishCourse(id: string): PublicationResult;
  deleteCourse(id: string): PublicationResult;
  addSeries(input: SeriesDraftInput): string;
  updateSeries(id: string, updates: Partial<Omit<ExerciseSeries, "id">>): void;
  publishSeries(id: string): PublicationResult;
  deleteSeries(id: string): void;
  startAttempt(
    seriesId: string,
    restartOrOptions?: boolean | AttemptOptions,
  ): string | null;
  answerQuestion(
    attemptId: string,
    questionId: string,
    choiceId: string,
    usedHint: boolean,
  ): void;
  completeAttempt(attemptId: string): void;
  submitAttempt(attemptId: string): void;
  markReviewed(courseId: string): void;
  resetDemo(): void;
  addPlan(input: PlanDraftInput): string;
  updatePlan(id: string, updates: Partial<Omit<RevisionPlan, "id">>): void;
  movePlanStep(planId: string, stepId: string, date: string): void;
  deletePlan(id: string): void;
  publishPlan(id: string): PublicationResult;
  completePlanStep(planId: string, stepId: string): void;
  postponePlan(id: string, examDate: string): PublicationResult;
  updateEnglish(settings: EnglishSettings): void;
  saveVocabularyList(list: VocabularyList): void;
  deleteVocabularyList(id: string): void;
  startGeneralReview(language: VocabularyLanguage): string | null;
  startVocabularySession(
    listId: string,
    mode: VocabularyMode,
    scope: "all" | "review",
    restart?: boolean,
  ): string | null;
  answerVocabulary(
    sessionId: string,
    questionId: string,
    response: string,
  ): void;
  completeVocabulary(sessionId: string): void;
  extractEnglish(sources: CourseSource[]): Promise<EnglishSettings>;
  storeSources(sources: CourseSource[]): Promise<CourseSource[]>;
  generateCourse(id: string, onProgress?: (job: AiJob) => void): Promise<void>;
  generateExercises(
    input: GenerateSeriesInput,
    onProgress?: (job: AiJob) => void,
  ): Promise<string>;
  adoptJob(job: AiJob): string | null;
}
export const emptyLearningData = (): LearningData => ({
  version: 1,
  courses: [],
  series: [],
  attempts: [],
  reviewedCourseIds: [],
  plans: [],
  english: clone(emptyEnglishSettings),
  readingRecords: [],
  spacedReviews: [],
  vocabularyLists: [],
  vocabularySessions: [],
});
const LearningContext = createContext<LearningContextValue | null>(null);
let sequence = 0;
const newId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${(++sequence).toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const now = () => new Date().toISOString();
export function LearningProvider({ children }: { children: ReactNode }) {
  const session = useSession();
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const key =
    session.mode === "demo"
      ? STORAGE_KEY
      : session.user && session.activeProfileId
        ? `revizo.family.${session.user.familyId}.${session.activeProfileId}.${session.user.role}`
        : "revizo.choose";
  const [data, setData] = useState<LearningData>(emptyLearningData);
  const dataRef = useRef(data);
  const [loadedKey, setLoadedKey] = useState("");
  const readyRef = useRef(false);
  readyRef.current = session.ready && loadedKey === key;
  const [storageError, setStorageError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("local");
  const syncRef = useRef<FamilySync | null>(null);
  const persistenceRef = useRef<ReturnType<
    typeof createLearningPersistence
  > | null>(null);
  const statusRef = useRef<SyncStatus>("local");
  const setStatus = (status: SyncStatus) => {
    statusRef.current = status;
    setSyncStatus(status);
  };
  const apply = useCallback((next: LearningData) => {
    dataRef.current = next;
    setData(next);
  }, []);
  const prepareRemote = useCallback(async (snapshot: LearningData) => {
    const next = clone(snapshot);
    if (sessionRef.current.user?.role === "parent")
      for (const course of next.courses) {
        for (let index = 0; index < course.sources.length; index++) {
          const source = course.sources[index];
          if (
            source.uri &&
            !source.storageId &&
            !source.uri.startsWith("/api/")
          )
            course.sources[index] = await uploadCourseSource(
              source,
              sessionRef.current.activeProfileId,
            );
          delete course.sources[index].cachedUri;
        }
      }
    return next;
  }, []);
  useEffect(() => {
    if (!session.ready) return;
    let active = true;
    setLoadedKey("");
    setStorageError(null);
    setStatus("local");
    const fallback =
      session.mode === "demo" ? clone(initialData) : emptyLearningData();
    if (session.mode === "family" && session.user && session.activeProfileId) {
      const sync = new FamilySync(
        {
          key,
          profileId: session.activeProfileId,
          storage: AsyncStorage,
          getData: () => dataRef.current,
          apply: (next) => {
            if (active) apply(next);
          },
          request: apiFetch,
          prepare: prepareRemote,
          status: (status) => {
            if (active) setStatus(status);
          },
          error: (message) => {
            if (active) setStorageError(message);
          },
        },
        fallback,
      );
      syncRef.current = sync;
      persistenceRef.current = null;
      void sync.load(fallback).then((local) => {
        if (!active) return;
        apply(local);
        setLoadedKey(key);
        void sync.sync();
      });
      const interval = setInterval(() => {
        void sync.sync();
      }, 15000);
      const online = () => {
        void sync.sync();
      };
      if (typeof window !== "undefined")
        window.addEventListener("online", online);
      return () => {
        active = false;
        sync.dispose();
        clearInterval(interval);
        if (typeof window !== "undefined")
          window.removeEventListener("online", online);
        if (syncRef.current === sync) syncRef.current = null;
      };
    }
    syncRef.current = null;
    const persistence = createLearningPersistence(AsyncStorage, fallback, key);
    persistenceRef.current = persistence;
    void persistence.load().then((result) => {
      if (active) {
        apply(result.data);
        setStorageError(result.error);
        setLoadedKey(key);
      }
    });
    return () => {
      active = false;
    };
  }, [
    session.ready,
    session.mode,
    session.user?.id,
    session.user?.role,
    session.activeProfileId,
    key,
    apply,
    prepareRemote,
  ]);
  const assertReady = useCallback(() => {
    if (!readyRef.current)
      throw new Error("L’espace est encore en cours de chargement.");
  }, []);
  const assertParent = useCallback(() => {
    assertReady();
    if (
      sessionRef.current.mode !== "demo" &&
      sessionRef.current.user?.role !== "parent"
    )
      throw new Error("Cette action est réservée à un parent.");
  }, [assertReady]);
  const commit = useCallback(
    (next: LearningData) => {
      if (next === dataRef.current) return;
      apply(next);
      if (syncRef.current) syncRef.current.changed(next);
      else
        void persistenceRef.current?.save(next).then(
          () => setStorageError(null),
          () =>
            setStorageError(
              "Impossible de sauvegarder sur cet appareil. Gardez cette page ouverte.",
            ),
        );
    },
    [apply],
  );
  const syncNow = useCallback(async () => {
    await syncRef.current?.sync();
  }, []);
  const reloadFromServer = useCallback(async () => {
    if (syncRef.current) await syncRef.current.reload();
  }, []);
  const resolveSyncConflict = useCallback(
    async (strategy: "local" | "server") => {
      await syncRef.current?.resolve(strategy);
    },
    [],
  );
  const addCourse = useCallback(
    (input: CourseDraftInput) => {
      assertParent();
      const id = newId("course");
      commit({
        ...dataRef.current,
        courses: [
          ...dataRef.current.courses,
          {
            ...clone(input),
            id,
            subjectId: input.subjectId,
            title: input.title.trim(),
            description: input.description?.trim() ?? "",
            sections: clone(input.sections ?? []),
            sources: clone(input.sources ?? []),
            status: "draft",
            updatedAt: now(),
          },
        ],
      });
      return id;
    },
    [assertParent, commit],
  );
  const updateCourse = useCallback(
    (id: string, updates: Partial<Omit<Course, "id">>) => {
      assertParent();
      const course = dataRef.current.courses.find((item) => item.id === id);
      if (!course || course.status === "published") return;
      commit({
        ...dataRef.current,
        courses: dataRef.current.courses.map((item) =>
          item.id === id
            ? {
                ...item,
                ...clone(updates),
                id,
                status: "draft",
                updatedAt: now(),
              }
            : item,
        ),
      });
    },
    [assertParent, commit],
  );
  const publishCourse = useCallback(
    (id: string) => {
      assertParent();
      const outcome = publishCourseInData(dataRef.current, id);
      commit(outcome.data);
      return outcome.result;
    },
    [assertParent, commit],
  );
  const deleteCourse = useCallback(
    (id: string): PublicationResult => {
      assertParent();
      if (
        dataRef.current.series.some((s) => s.courseIds.includes(id)) ||
        (dataRef.current.plans ?? []).some((plan) =>
          plan.courseIds.includes(id),
        )
      )
        return {
          ok: false,
          error: "Retirez d’abord les séries et les plans liés à ce cours.",
        };
      commit({
        ...dataRef.current,
        courses: dataRef.current.courses.filter((course) => course.id !== id),
        reviewedCourseIds: dataRef.current.reviewedCourseIds.filter(
          (value) => value !== id,
        ),
      });
      return { ok: true };
    },
    [assertParent, commit],
  );
  const addSeries = useCallback(
    (input: SeriesDraftInput) => {
      assertParent();
      const id = newId("series");
      commit({
        ...dataRef.current,
        series: [
          ...dataRef.current.series,
          { ...clone(input), id, status: "draft" },
        ],
      });
      return id;
    },
    [assertParent, commit],
  );
  const updateSeries = useCallback(
    (id: string, updates: Partial<Omit<ExerciseSeries, "id">>) => {
      assertParent();
      commit({
        ...dataRef.current,
        series: dataRef.current.series.map((item) =>
          item.id === id && item.status === "draft"
            ? {
                ...item,
                ...clone(updates),
                ...(Object.prototype.hasOwnProperty.call(updates, "dueDate")
                  ? { dueDate: updates.dueDate }
                  : {}),
                id,
                status: "draft",
              }
            : item,
        ),
      });
    },
    [assertParent, commit],
  );
  const publishSeries = useCallback(
    (id: string) => {
      assertParent();
      const result = publishSeriesInData(dataRef.current, id);
      commit(result.data);
      return result.result;
    },
    [assertParent, commit],
  );
  const deleteSeries = useCallback(
    (id: string) => {
      assertParent();
      commit({
        ...dataRef.current,
        series: dataRef.current.series.filter((s) => s.id !== id),
        plans: (dataRef.current.plans ?? []).map((plan) => ({
          ...plan,
          status: plan.steps.some((step) => step.seriesId === id)
            ? "draft"
            : plan.status,
          steps: plan.steps.map((step) =>
            step.seriesId === id ? { ...step, seriesId: undefined } : step,
          ),
        })),
      });
    },
    [assertParent, commit],
  );
  const startAttempt = useCallback(
    (seriesId: string, restartOrOptions: boolean | AttemptOptions = false) => {
      assertReady();
      const options =
        typeof restartOrOptions === "boolean"
          ? { restart: restartOrOptions }
          : restartOrOptions;
      const result = startAttemptInData(
        dataRef.current,
        seriesId,
        newId("attempt"),
        now(),
        options.restart ?? false,
        { ...options, profileId: sessionRef.current.activeProfileId },
      );
      commit(result.data);
      return result.attemptId;
    },
    [assertReady, commit],
  );
  const answerQuestion = useCallback(
    (
      attemptId: string,
      questionId: string,
      choiceId: string,
      usedHint: boolean,
    ) => {
      assertReady();
      commit(
        answerQuestionInData(
          dataRef.current,
          attemptId,
          questionId,
          choiceId,
          usedHint,
          now(),
        ),
      );
    },
    [assertReady, commit],
  );
  const completeAttempt = useCallback(
    (id: string) => {
      assertReady();
      commit(completeAttemptInData(dataRef.current, id, now()));
    },
    [assertReady, commit],
  );
  const submitAttempt = useCallback(
    (id: string) => {
      assertReady();
      const attempt = dataRef.current.attempts.find((a) => a.id === id);
      if (!attempt || attempt.completedAt) return;
      const timestamp = now();
      const answers = [
        ...attempt.answers,
        ...attempt.questions
          .filter((q) => !attempt.answers.some((a) => a.questionId === q.id))
          .map((q) => ({
            questionId: q.id,
            choiceId: "",
            response: "",
            isCorrect: false,
            usedHint: false,
            answeredAt: timestamp,
          })),
      ];
      commit({
        ...dataRef.current,
        attempts: dataRef.current.attempts.map((a) =>
          a.id === id
            ? { ...a, answers, completedAt: timestamp, submittedAt: timestamp }
            : a,
        ),
      });
    },
    [assertReady, commit],
  );
  const markReviewed = useCallback(
    (courseId: string) => {
      assertReady();
      const course = dataRef.current.courses.find(
        (c) => c.id === courseId && c.status === "published",
      );
      if (!course) return;
      const timestamp = now();
      const old = dataRef.current.spacedReviews?.find(
        (item) => item.courseId === courseId,
      );
      const interval = old ? Math.min(60, old.interval * 2) : 1;
      const due = new Date();
      due.setDate(due.getDate() + interval);
      const next = markReviewedInData(dataRef.current, courseId);
      commit({
        ...next,
        readingRecords: [
          ...(next.readingRecords ?? []),
          { courseId, reviewedAt: timestamp },
        ],
        spacedReviews: [
          ...(next.spacedReviews ?? []).filter(
            (item) => item.courseId !== courseId,
          ),
          {
            courseId,
            dueDate: dateOnly(due),
            interval,
            lastReviewedAt: timestamp,
          },
        ],
      });
    },
    [assertReady, commit],
  );
  const resetDemo = useCallback(() => {
    assertParent();
    if (sessionRef.current.mode !== "demo")
      throw new Error(
        "Cette réinitialisation est réservée à la démonstration.",
      );
    commit(clone(initialData));
  }, [assertParent, commit]);
  const addPlan = useCallback(
    (input: PlanDraftInput) => {
      assertParent();
      const id = newId("plan");
      commit({
        ...dataRef.current,
        plans: [
          ...(dataRef.current.plans ?? []),
          { ...clone(input), id, status: "draft" },
        ],
      });
      return id;
    },
    [assertParent, commit],
  );
  const updatePlan = useCallback(
    (id: string, updates: Partial<Omit<RevisionPlan, "id">>) => {
      assertParent();
      commit({
        ...dataRef.current,
        plans: (dataRef.current.plans ?? []).map((plan) =>
          plan.id === id
            ? { ...plan, ...clone(updates), id, status: "draft" }
            : plan,
        ),
      });
    },
    [assertParent, commit],
  );
  const movePlanStep = useCallback(
    (planId: string, stepId: string, date: string) => {
      assertParent();
      const current = dataRef.current;
      const plans = current.plans ?? [];
      const plan = plans.find((item) => item.id === planId);
      if (!plan) throw new Error("Ce contrôle a été supprimé.");
      const moved = moveRevisionStep(plan, stepId, date);
      commit({
        ...current,
        plans: plans.map((item) => (item.id === planId ? moved : item)),
      });
    },
    [assertParent, commit],
  );
  const deletePlan = useCallback(
    (id: string) => {
      assertParent();
      commit({
        ...dataRef.current,
        plans: (dataRef.current.plans ?? []).filter((plan) => plan.id !== id),
      });
    },
    [assertParent, commit],
  );
  const publishPlan = useCallback(
    (id: string): PublicationResult => {
      assertParent();
      const plan = dataRef.current.plans?.find((p) => p.id === id);
      if (!plan) return { ok: false, error: "Ce plan est introuvable." };
      const error = planValidation(plan, dataRef.current.courses, dateOnly());
      if (error) return { ok: false, error };
      commit({
        ...dataRef.current,
        plans: (dataRef.current.plans ?? []).map((p) =>
          p.id === id ? { ...p, status: "published" } : p,
        ),
      });
      return { ok: true };
    },
    [assertParent, commit],
  );
  const completePlanStep = useCallback(
    (planId: string, stepId: string) => {
      assertReady();
      commit({
        ...dataRef.current,
        plans: (dataRef.current.plans ?? []).map((plan) =>
          plan.id === planId && plan.status === "published"
            ? {
                ...plan,
                steps: plan.steps.map((step) =>
                  step.id === stepId
                    ? { ...step, completedAt: step.completedAt ?? now() }
                    : step,
                ),
              }
            : plan,
        ),
      });
    },
    [assertReady, commit],
  );
  const postponePlan = useCallback(
    (id: string, examDate: string): PublicationResult => {
      assertParent();
      const plan = dataRef.current.plans?.find((p) => p.id === id);
      if (!plan) return { ok: false, error: "Ce plan est introuvable." };
      try {
        const next = reschedulePlan(plan, examDate, dateOnly());
        commit({
          ...dataRef.current,
          plans: (dataRef.current.plans ?? []).map((p) =>
            p.id === id ? next : p,
          ),
        });
        return { ok: true };
      } catch (error) {
        return {
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : "La date ne peut pas être modifiée.",
        };
      }
    },
    [assertParent, commit],
  );
  const updateEnglish = useCallback(
    (input: EnglishSettings, articlesOverride?: boolean) => {
      assertParent();
      const error = englishValidation(input);
      if (error) throw new Error(error);
      const current = dataRef.current;
      const normalized = normalizeEnglish(input);
      const english = {
        ...normalized,
        wordsRevision:
          (current.english?.wordsRevision ?? 0) +
          (JSON.stringify(normalized.words) ===
          JSON.stringify(current.english?.words ?? [])
            ? 0
            : 1),
      };
      const previousList = vocabularyListsFor(current).find(
        (list) => list.id === legacyEnglishListId,
      );
      const material = buildEnglishMaterial(
        english,
        articlesOverride ?? previousList?.requireArticles,
      );
      commit(
        retainRemovedVocabulary(current, {
          ...current,
          english,
          vocabularyLists: [
            ...vocabularyListsFor(current).filter(
              (list) => list.id !== legacyEnglishListId,
            ),
            ...legacyEnglishVocabulary(english, previousList).map((list) => ({
              ...list,
              ...(previousList?.archived && list.status === "published"
                ? { archived: true }
                : {}),
              words: list.words.map((word) => {
                const previous = previousList?.words.find(
                  (item) =>
                    item.id === word.id &&
                    item.term === word.term &&
                    item.translation === word.translation,
                );
                return previous?.context
                  ? { ...word, context: previous.context }
                  : word;
              }),
            })),
          ],
          courses: material
            ? [
                ...current.courses.filter((c) => c.id !== material.course.id),
                material.course,
              ]
            : current.courses.map((c) =>
                c.id === "english-repertoire-course"
                  ? { ...c, status: "draft" }
                  : c,
              ),
          series: material
            ? [
                ...current.series.filter((s) => s.id !== material.series.id),
                material.series,
              ]
            : current.series.map((s) =>
                s.id === "english-repertoire-practice"
                  ? { ...s, status: "draft" }
                  : s,
              ),
          plans: material
            ? current.plans
            : (current.plans ?? []).map((p) =>
                p.courseIds.includes("english-repertoire-course")
                  ? { ...p, status: "draft" }
                  : p,
              ),
        }),
      );
    },
    [assertParent, commit],
  );
  const saveVocabularyList = useCallback(
    (input: VocabularyList) => {
      assertParent();
      if (!isVocabularyList(input))
        throw new Error(
          "Cette liste de vocabulaire est invalide (200 mots maximum).",
        );
      const list = normalizeVocabularyList(input);
      if (!list.title) throw new Error("Donnez un titre à la liste.");
      const error =
        list.status === "published" ? vocabularyListError(list) : null;
      if (error) throw new Error(error);
      const current = dataRef.current;
      const lists = vocabularyListsFor(current);
      const previous = lists.find((item) => item.id === list.id);
      if (previous && previous.language !== list.language)
        throw new Error(
          "La langue d’une liste existante ne peut pas être changée.",
        );
      if (list.id === legacyEnglishListId && list.status === "published") {
        updateEnglish(
          {
            ...(current.english ?? clone(emptyEnglishSettings)),
            words: list.words.map((word) => ({
              id: word.id,
              en: word.term,
              fr: word.translation,
            })),
          },
          !!list.requireArticles,
        );
        list.englishWordsRevision = dataRef.current.english?.wordsRevision ?? 0;
      }
      commit(
        retainRemovedVocabulary(current, {
          ...dataRef.current,
          vocabularyLists: [
            ...lists.filter((item) => item.id !== list.id),
            clone(list),
          ],
        }),
      );
    },
    [assertParent, commit, updateEnglish],
  );
  const deleteVocabularyList = useCallback(
    (id: string) => {
      assertParent();
      if (id === legacyEnglishListId)
        updateEnglish({
          ...(dataRef.current.english ?? clone(emptyEnglishSettings)),
          words: [],
        });
      commit(
        retainRemovedVocabulary(dataRef.current, {
          ...dataRef.current,
          vocabularyLists: vocabularyListsFor(dataRef.current).filter(
            (list) => list.id !== id,
          ),
        }),
      );
    },
    [assertParent, commit, updateEnglish],
  );
  const startGeneralReview = useCallback(
    (language: VocabularyLanguage) => {
      assertReady();
      const current = dataRef.current;
      const sessions = current.vocabularySessions ?? [];
      const pending = [...sessions]
        .reverse()
        .find(
          (session) =>
            session.source === "repertoire" &&
            session.language === language &&
            !session.completedAt,
        );
      if (pending) return pending.id;
      const session = createGeneralReview(
        current,
        sessions,
        language,
        newId("vocabulary-session"),
        now(),
      );
      if (!session) return null;
      commit({ ...current, vocabularySessions: [...sessions, session] });
      return session.id;
    },
    [assertReady, commit],
  );

  const startVocabularySession = useCallback(
    (
      listId: string,
      mode: VocabularyMode,
      scope: "all" | "review",
      restart = false,
    ) => {
      assertReady();
      const current = dataRef.current;
      const list = vocabularyListsFor(current).find(
        (list) =>
          list.id === listId && list.status === "published" && !list.archived,
      );
      if (!list) return null;
      const sessions = current.vocabularySessions ?? [];
      const pending = [...sessions]
        .reverse()
        .find(
          (session) =>
            !session.source &&
            session.listId === listId &&
            session.mode === mode &&
            session.scope === scope &&
            !session.completedAt,
        );
      if (pending && !restart) return pending.id;
      const session = createVocabularySession(list, sessions, {
        id: newId("vocabulary-session"),
        mode,
        scope,
        startedAt: now(),
      });
      if (!session) return null;
      commit({
        ...current,
        vocabularyLists: vocabularyListsFor(current),
        vocabularySessions: [...sessions, session],
      });
      return session.id;
    },
    [assertReady, commit],
  );
  const answerVocabulary = useCallback(
    (id: string, questionId: string, response: string) => {
      assertReady();
      const current = dataRef.current;
      commit({
        ...current,
        vocabularySessions: (current.vocabularySessions ?? []).map((session) =>
          session.id === id
            ? answerVocabularySession(session, questionId, response, now())
            : session,
        ),
      });
    },
    [assertReady, commit],
  );
  const completeVocabulary = useCallback(
    (id: string) => {
      assertReady();
      const current = dataRef.current;
      commit({
        ...current,
        vocabularySessions: (current.vocabularySessions ?? []).map((session) =>
          session.id === id &&
          !session.completedAt &&
          session.answers.length === session.questions.length
            ? { ...session, completedAt: now() }
            : session,
        ),
      });
    },
    [assertReady, commit],
  );
  const storeSources = useCallback(
    async (sources: CourseSource[]) => {
      assertParent();
      const stored: CourseSource[] = [];
      for (const source of sources) {
        const cached = await cacheSource(source);
        stored.push(
          sessionRef.current.mode === "family" &&
            sessionRef.current.serverAvailable
            ? await uploadCourseSource(
                cached,
                sessionRef.current.activeProfileId,
              )
            : cached,
        );
      }
      return stored;
    },
    [assertParent],
  );
  const requireAi = useCallback(async () => {
    assertParent();
    if (sessionRef.current.mode !== "family")
      throw new Error(
        "Connectez-vous à votre espace familial pour utiliser la génération IA.",
      );
    await syncRef.current?.sync();
    if (statusRef.current !== "synced")
      throw new Error(
        "Synchronisez les cours avant de lancer une génération IA.",
      );
  }, [assertParent]);
  const extractEnglish = useCallback(
    async (sources: CourseSource[]): Promise<EnglishSettings> => {
      await requireAi();
      const stored = await storeSources(sources);
      const { job } = await apiFetch<{ job: AiJob }>("/ai/english", {
        method: "POST",
        body: JSON.stringify({
          profileId: sessionRef.current.activeProfileId,
          sourceIds: stored.map((source) => source.storageId || source.id),
        }),
      });
      const done = await waitForJob(job.id);
      return {
        words: done.result?.words ?? [],
        verbs: done.result?.verbs ?? [],
        tenses: done.result?.tenses ?? [],
        toolWords: done.result?.toolWords ?? [],
      };
    },
    [requireAi, storeSources],
  );
  const generateCourse = useCallback(
    async (id: string, onProgress?: (job: AiJob) => void) => {
      await requireAi();
      const course = dataRef.current.courses.find((c) => c.id === id);
      if (!course || course.status !== "draft")
        throw new Error("Ouvrez un brouillon pour préparer la fiche.");
      const sources = await storeSources(course.sources);
      updateCourse(id, { sources });
      await syncRef.current?.sync();
      const { job } = await apiFetch<{ job: AiJob }>("/ai/course", {
        method: "POST",
        body: JSON.stringify({
          profileId: sessionRef.current.activeProfileId,
          subjectId: course.subjectId,
          title: course.title,
          existingCourseId: id,
          sourceText: course.sourceText,
          sourceIds: [
            ...new Set(sources.map((source) => source.storageId || source.id)),
          ],
        }),
      });
      updateCourse(id, { generationJobId: job.id });
      const done = await waitForJob(job.id, onProgress);
      if (!done.result?.course)
        throw new Error("La génération n’a pas produit de fiche à relire.");
      updateCourse(id, {
        ...done.result.course,
        generationJobId: job.id,
        generationAppliedJobId: job.id,
      });
    },
    [requireAi, storeSources, updateCourse],
  );
  const generateExercises = useCallback(
    async (input: GenerateSeriesInput, onProgress?: (job: AiJob) => void) => {
      await requireAi();
      const { job } = await apiFetch<{ job: AiJob }>("/ai/exercises", {
        method: "POST",
        body: JSON.stringify({
          ...input,
          profileId: sessionRef.current.activeProfileId,
          ...(input.subjectId === "english"
            ? { english: dataRef.current.english }
            : {}),
        }),
      });
      const done = await waitForJob(job.id, onProgress);
      if (!done.result?.questions?.length)
        throw new Error("La génération n’a pas produit de questions.");
      return addSeries({
        title: input.title,
        courseIds: input.courseIds,
        subjectId: input.subjectId,
        level: input.level,
        dueDate: input.dueDate,
        questions: done.result.questions,
        generationJobId: job.id,
      });
    },
    [requireAi, addSeries],
  );
  const adoptJob = useCallback(
    (job: AiJob): string | null => {
      assertParent();
      if (job.status !== "succeeded") return null;
      if (job.profileId && job.profileId !== sessionRef.current.activeProfileId)
        throw new Error(
          "Sélectionnez le profil concerné avant de récupérer cette préparation.",
        );
      if (job.kind === "exercises" && job.result?.questions?.length) {
        const previous = dataRef.current.series.find(
          (s) => s.generationJobId === job.id,
        );
        if (previous) return previous.id;
        const input = job.input ?? {};
        const courseIds = Array.isArray(input.courseIds)
          ? input.courseIds.filter((id): id is string => typeof id === "string")
          : [];
        const courses = dataRef.current.courses.filter((c) =>
          courseIds.includes(c.id),
        );
        if (!courses.length)
          throw new Error(
            "Les cours de cette préparation ne sont plus disponibles.",
          );
        return addSeries({
          title:
            typeof input.title === "string"
              ? input.title
              : `Révision · ${courses.map((c) => c.title).join(", ")}`,
          courseIds,
          subjectId: courses[0].subjectId,
          level:
            input.level === "discovery" || input.level === "challenge"
              ? input.level
              : "practice",
          questions: job.result.questions,
          generationJobId: job.id,
          ...(typeof input.dueDate === "string"
            ? { dueDate: input.dueDate }
            : {}),
        });
      }
      const adopted = dataRef.current.courses.find(
        (c) =>
          c.generationAppliedJobId === job.id ||
          (c.status === "published" && c.generationJobId === job.id),
      );
      if (adopted) return adopted.id;
      if (job.kind === "course" && job.result?.course) {
        const course = job.result.course;
        const pending = dataRef.current.courses.find(
          (c) =>
            c.status === "draft" &&
            (c.generationJobId === job.id ||
              c.id === job.input?.existingCourseId),
        );
        if (
          pending &&
          !pending.sections.some((section) => section.content.trim())
        ) {
          updateCourse(pending.id, {
            ...course,
            generationJobId: job.id,
            generationAppliedJobId: job.id,
          });
          return pending.id;
        }
        return addCourse({
          subjectId: course.subjectId ?? "maths",
          title: course.title ?? "Cours à relire",
          description: course.description,
          sections: course.sections,
          sources: course.sources,
          sourceText: course.sourceText,
          generationJobId: job.id,
          generationAppliedJobId: job.id,
        });
      }
      return null;
    },
    [assertParent, addCourse, updateCourse, addSeries],
  );
  const value = useMemo<LearningContextValue>(
    () => ({
      ...data,
      subjects,
      plans: data.plans ?? [],
      english: data.english ?? clone(emptyEnglishSettings),
      vocabularyLists: vocabularyListsFor(data),
      vocabularySessions: data.vocabularySessions ?? [],
      isReady: session.ready && loadedKey === key,
      storageError,
      childName: session.childName,
      childGrade: session.childGrade,
      profiles: session.profiles,
      activeProfileId: session.activeProfileId,
      isDemo: session.mode === "demo",
      serverAvailable: session.serverAvailable,
      syncStatus,
      syncNow,
      reloadFromServer,
      resolveSyncConflict,
      addCourse,
      updateCourse,
      publishCourse,
      deleteCourse,
      addSeries,
      updateSeries,
      publishSeries,
      deleteSeries,
      startAttempt,
      answerQuestion,
      completeAttempt,
      submitAttempt,
      markReviewed,
      resetDemo,
      addPlan,
      updatePlan,
      movePlanStep,
      deletePlan,
      publishPlan,
      completePlanStep,
      postponePlan,
      updateEnglish,
      saveVocabularyList,
      deleteVocabularyList,
      startGeneralReview,
      startVocabularySession,
      answerVocabulary,
      completeVocabulary,
      extractEnglish,
      storeSources,
      generateCourse,
      generateExercises,
      adoptJob,
    }),
    [
      data,
      session,
      loadedKey,
      key,
      storageError,
      syncStatus,
      syncNow,
      reloadFromServer,
      resolveSyncConflict,
      addCourse,
      updateCourse,
      publishCourse,
      deleteCourse,
      addSeries,
      updateSeries,
      publishSeries,
      deleteSeries,
      startAttempt,
      answerQuestion,
      completeAttempt,
      submitAttempt,
      markReviewed,
      resetDemo,
      addPlan,
      updatePlan,
      movePlanStep,
      deletePlan,
      publishPlan,
      completePlanStep,
      postponePlan,
      updateEnglish,
      saveVocabularyList,
      deleteVocabularyList,
      startGeneralReview,
      startVocabularySession,
      answerVocabulary,
      completeVocabulary,
      extractEnglish,
      storeSources,
      generateCourse,
      generateExercises,
      adoptJob,
    ],
  );
  return (
    <LearningContext.Provider value={value}>
      {children}
    </LearningContext.Provider>
  );
}
export function useLearning() {
  const context = useContext(LearningContext);
  if (!context) throw new Error("LearningProvider manquant.");
  return context;
}
