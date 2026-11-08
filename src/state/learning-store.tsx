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
import type {
  Course,
  CourseDraftInput,
  LearningData,
  SeriesDraftInput,
  Subject,
} from "../domain/model";
import { createLearningPersistence } from "./persistence";
export interface LearningContextValue extends Omit<LearningData, "version"> {
  subjects: Subject[];
  isReady: boolean;
  storageError: string | null;
  addCourse(input: CourseDraftInput): string;
  updateCourse(id: string, updates: Partial<Omit<Course, "id">>): void;
  publishCourse(id: string): PublicationResult;
  addSeries(input: SeriesDraftInput): string;
  publishSeries(id: string): PublicationResult;
  startAttempt(seriesId: string, restart?: boolean): string | null;
  answerQuestion(
    attemptId: string,
    questionId: string,
    choiceId: string,
    usedHint: boolean,
  ): void;
  completeAttempt(attemptId: string): void;
  markReviewed(courseId: string): void;
  resetDemo(): void;
}
const LearningContext = createContext<LearningContextValue | null>(null);
let sequence = 0;
const newId = (prefix: string) =>
  prefix +
  "-" +
  Date.now().toString(36) +
  "-" +
  (++sequence).toString(36) +
  "-" +
  Math.random().toString(36).slice(2, 8);
const now = () => new Date().toISOString();
export function LearningProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<LearningData>(() => clone(initialData));
  const [isReady, setIsReady] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const dataRef = useRef(data);
  const readyRef = useRef(false);
  const mountedRef = useRef(false);
  const persistenceRef = useRef<ReturnType<
    typeof createLearningPersistence
  > | null>(null);
  if (!persistenceRef.current)
    persistenceRef.current = createLearningPersistence(AsyncStorage);
  useEffect(() => {
    let active = true;
    mountedRef.current = true;
    void persistenceRef.current!.load().then((result) => {
      if (!active) return;
      dataRef.current = result.data;
      readyRef.current = true;
      setData(result.data);
      setStorageError(result.error);
      setIsReady(true);
    });
    return () => {
      active = false;
      mountedRef.current = false;
    };
  }, []);
  const assertReady = useCallback(() => {
    if (!readyRef.current)
      throw new Error("Les données sont encore en cours de chargement.");
  }, []);
  const commit = useCallback((next: LearningData) => {
    if (next === dataRef.current) return;
    dataRef.current = next;
    setData(next);
    void persistenceRef.current!.save(next).then(
      () => {
        if (mountedRef.current) setStorageError(null);
      },
      () => {
        if (mountedRef.current)
          setStorageError(
            "Impossible de sauvegarder sur cet appareil. Gardez cette page ouverte et vérifiez le stockage disponible.",
          );
      },
    );
  }, []);
  const addCourse = useCallback(
    (input: CourseDraftInput) => {
      assertReady();
      const id = newId("course");
      const course: Course = {
        id,
        subjectId: input.subjectId,
        title: input.title.trim(),
        description: input.description?.trim() ?? "",
        sections: clone(input.sections ?? []),
        sources: clone(input.sources ?? []),
        status: "draft",
        updatedAt: now(),
      };
      commit({
        ...dataRef.current,
        courses: [...dataRef.current.courses, course],
      });
      return id;
    },
    [assertReady, commit],
  );
  const updateCourse = useCallback(
    (id: string, updates: Partial<Omit<Course, "id">>) => {
      assertReady();
      const course = dataRef.current.courses.find((item) => item.id === id);
      if (!course || course.status === "published") return;
      const updated: Course = {
        ...course,
        ...clone(updates),
        id,
        status: course.status,
        updatedAt: now(),
      };
      commit({
        ...dataRef.current,
        courses: dataRef.current.courses.map((item) =>
          item.id === id ? updated : item,
        ),
      });
    },
    [assertReady, commit],
  );
  const publishCourse = useCallback(
    (id: string) => {
      assertReady();
      const outcome = publishCourseInData(dataRef.current, id);
      commit(outcome.data);
      return outcome.result;
    },
    [assertReady, commit],
  );
  const addSeries = useCallback(
    (input: SeriesDraftInput) => {
      assertReady();
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
    [assertReady, commit],
  );
  const publishSeries = useCallback(
    (id: string) => {
      assertReady();
      const outcome = publishSeriesInData(dataRef.current, id);
      commit(outcome.data);
      return outcome.result;
    },
    [assertReady, commit],
  );
  const startAttempt = useCallback(
    (seriesId: string, restart = false) => {
      assertReady();
      const outcome = startAttemptInData(
        dataRef.current,
        seriesId,
        newId("attempt"),
        now(),
        restart,
      );
      commit(outcome.data);
      return outcome.attemptId;
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
    (attemptId: string) => {
      assertReady();
      commit(completeAttemptInData(dataRef.current, attemptId, now()));
    },
    [assertReady, commit],
  );
  const markReviewed = useCallback(
    (courseId: string) => {
      assertReady();
      commit(markReviewedInData(dataRef.current, courseId));
    },
    [assertReady, commit],
  );
  const resetDemo = useCallback(() => {
    assertReady();
    commit(clone(initialData));
  }, [assertReady, commit]);
  const value = useMemo<LearningContextValue>(
    () => ({
      subjects,
      courses: data.courses,
      series: data.series,
      attempts: data.attempts,
      reviewedCourseIds: data.reviewedCourseIds,
      isReady,
      storageError,
      addCourse,
      updateCourse,
      publishCourse,
      addSeries,
      publishSeries,
      startAttempt,
      answerQuestion,
      completeAttempt,
      markReviewed,
      resetDemo,
    }),
    [
      data,
      isReady,
      storageError,
      addCourse,
      updateCourse,
      publishCourse,
      addSeries,
      publishSeries,
      startAttempt,
      answerQuestion,
      completeAttempt,
      markReviewed,
      resetDemo,
    ],
  );
  return (
    <LearningContext.Provider value={value}>
      {children}
    </LearningContext.Provider>
  );
}
export function useLearning(): LearningContextValue {
  const context = useContext(LearningContext);
  if (!context)
    throw new Error("useLearning doit être utilisé dans LearningProvider.");
  return context;
}
