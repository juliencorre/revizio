import React, { useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  AppIcon,
  AppText,
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeading,
  ProgressBar,
} from "@/components/ui";
import { colors } from "@/theme";
import type { Answer, Attempt, Question } from "@/domain/model";
import {
  ChildShell,
  Loading,
  Unavailable,
  styles,
  subjectFor,
  useChildData,
  useContentWidth,
} from "./shared";
export function StudentExerciseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const data = useChildData();
  const router = useRouter();
  const width = useContentWidth();
  const series = data.publishedSeries.find((s) => s.id === id);
  const subject = subjectFor(data.subjects, series?.subjectId ?? "");
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [questionIndex, setQuestionIndex] = useState<number | null>(null);
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [hintVisible, setHintVisible] = useState(false);
  const [hintUsed, setHintUsed] = useState(false);
  const [reviewingErrors, setReviewingErrors] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [startError, setStartError] = useState(false);
  const initializedRoute = useRef<string | null>(null);
  useEffect(() => {
    if (!data.isReady || !series || initializedRoute.current === id) return;
    initializedRoute.current = id;
    setQuestionIndex(null);
    setSelectedChoice(null);
    setHintVisible(false);
    setHintUsed(false);
    setReviewingErrors(false);
    setShowSummary(false);
    const existing = [...data.attempts]
      .filter((a) => a.seriesId === id)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    const existingAttempt = existing.find((a) => !a.completedAt) ?? existing[0];
    const next = existingAttempt?.id ?? data.startAttempt(id);
    setAttemptId(next);
    setStartError(!next);
  }, [data.isReady, id, series, data.attempts, data.startAttempt]);
  const attempt = data.attempts.find(
    (a) => a.id === attemptId && a.seriesId === id,
  );
  useEffect(() => {
    if (!attempt || questionIndex !== null) return;
    const first = attempt.questions.findIndex(
      (q) => !attempt.answers.some((a) => a.questionId === q.id),
    );
    if (first === -1) {
      setShowSummary(true);
      setQuestionIndex(0);
    } else {
      setQuestionIndex(first);
      setShowSummary(false);
    }
  }, [attempt, questionIndex]);
  useEffect(() => {
    if (
      attempt &&
      !attempt.completedAt &&
      attempt.questions.length > 0 &&
      attempt.answers.length === attempt.questions.length
    )
      data.completeAttempt(attempt.id);
  }, [attempt, data.completeAttempt]);
  function resetQuestion() {
    setSelectedChoice(null);
    setHintVisible(false);
    setHintUsed(false);
  }
  function restart() {
    const next = data.startAttempt(id, true);
    if (!next) {
      setStartError(true);
      return;
    }
    setAttemptId(next);
    setQuestionIndex(0);
    setReviewingErrors(false);
    setShowSummary(false);
    resetQuestion();
  }
  const mistakes =
    attempt?.questions.filter((q) =>
      attempt.answers.some((a) => a.questionId === q.id && !a.isCorrect),
    ) ?? [];
  const displayed = reviewingErrors ? mistakes : (attempt?.questions ?? []);
  const question =
    questionIndex === null ? undefined : displayed[questionIndex];
  const answer = attempt?.answers.find((a) => a.questionId === question?.id);
  function verify() {
    if (!attempt || !question || !selectedChoice || answer) return;
    data.answerQuestion(attempt.id, question.id, selectedChoice, hintUsed);
  }
  function next() {
    resetQuestion();
    if (!attempt || questionIndex === null) return;
    if (questionIndex + 1 >= displayed.length) {
      data.completeAttempt(attempt.id);
      setShowSummary(true);
      setReviewingErrors(false);
    } else setQuestionIndex(questionIndex + 1);
  }
  function reviewErrors() {
    setReviewingErrors(true);
    setShowSummary(false);
    setQuestionIndex(0);
    resetQuestion();
  }
  return (
    <ChildShell active="exercises" subject={subject}>
      {!data.isReady ? (
        <Loading />
      ) : !series ? (
        <Unavailable kind="exercice" />
      ) : startError ? (
        <EmptyState
          icon="refresh"
          title="La série n’a pas pu démarrer"
          description="Retourne à tes exercices pour essayer à nouveau."
        >
          <Button
            icon="arrow-left"
            onPress={() => router.replace("/student/exercises")}
          >
            Mes exercices
          </Button>
        </EmptyState>
      ) : !attempt || questionIndex === null ? (
        <Loading />
      ) : showSummary ? (
        <ExerciseSummary
          attempt={attempt}
          onRestart={restart}
          onReviewErrors={reviewErrors}
          onExit={() =>
            router.push(
              subject
                ? `/student/exercises?subjectId=${subject.id}`
                : "/student/exercises",
            )
          }
        />
      ) : !question ? (
        <Unavailable kind="exercice" />
      ) : (
        <>
          <View style={styles.sectionHeading}>
            <Button
              variant="ghost"
              icon="arrow-left"
              onPress={() =>
                router.push(
                  subject
                    ? `/student/exercises?subjectId=${subject.id}`
                    : "/student/exercises",
                )
              }
            >
              Quitter et garder ma place
            </Button>
            <Badge tone={reviewingErrors ? "orange" : "primary"}>
              {reviewingErrors ? "Je revois mes erreurs" : "À mon rythme"}
            </Badge>
          </View>
          <View style={{ gap: 12 }}>
            <View style={styles.sectionHeading}>
              <AppText
                variant="small"
                color={colors.primary}
                style={{ fontWeight: "700" }}
              >
                {subject?.title} · {attempt.seriesTitle}
              </AppText>
              <AppText variant="label">
                Question {questionIndex + 1} sur {displayed.length}
              </AppText>
            </View>
            <ProgressBar
              value={
                reviewingErrors
                  ? ((questionIndex + 1) / displayed.length) * 100
                  : (attempt.answers.length / attempt.questions.length) * 100
              }
            />
          </View>
          <Card style={{ gap: 26, padding: width >= 650 ? 34 : 22 }}>
            <View style={styles.sectionHeading}>
              <Badge>QCM · Une seule réponse</Badge>
              {!answer && question.hint && (
                <Button
                  variant="ghost"
                  icon="lightbulb"
                  onPress={() => {
                    setHintVisible(!hintVisible);
                    setHintUsed(true);
                  }}
                >
                  {hintVisible ? "Masquer l’indice" : "Un petit indice"}
                </Button>
              )}
            </View>
            <AppText
              variant="title"
              style={{
                fontSize: width >= 650 ? 32 : 26,
                lineHeight: width >= 650 ? 43 : 35,
              }}
            >
              {question.prompt}
            </AppText>
            {hintVisible && !answer && (
              <View
                style={{
                  backgroundColor: colors.orangeLight,
                  borderRadius: 18,
                  padding: 19,
                  gap: 7,
                }}
              >
                <AppText variant="label" color={colors.orange}>
                  Un coup de pouce
                </AppText>
                <AppText color={colors.orange}>{question.hint}</AppText>
              </View>
            )}
            <View style={styles.grid}>
              {question.choices.map((choice, index) => {
                const selected =
                  (answer?.choiceId ?? selectedChoice) === choice.id;
                const correct =
                  !!answer && choice.id === question.correctChoiceId;
                const wrong = !!answer && selected && !answer.isCorrect;
                const border = correct
                  ? colors.green
                  : wrong
                    ? colors.danger
                    : selected
                      ? colors.primary
                      : colors.border;
                return (
                  <Pressable
                    key={choice.id}
                    accessibilityRole="radio"
                    accessibilityLabel={`${String.fromCharCode(65 + index)}. ${choice.label}`}
                    accessibilityState={{
                      checked: selected,
                      disabled: !!answer,
                    }}
                    disabled={!!answer}
                    testID={`choice-${choice.id}`}
                    onPress={() => setSelectedChoice(choice.id)}
                    style={({ pressed }) => [
                      {
                        width: width >= 650 ? (width - 70 - 18) / 2 : "100%",
                        minHeight: 106,
                        borderRadius: 20,
                        borderWidth: 2,
                        borderColor: border,
                        backgroundColor: correct
                          ? colors.greenLight
                          : wrong
                            ? colors.dangerLight
                            : selected
                              ? colors.primaryLight
                              : "#F8F9FC",
                        flexDirection: "row",
                        alignItems: "center",
                        padding: 19,
                        gap: 15,
                      },
                      pressed && { opacity: 0.8 },
                    ]}
                  >
                    <View
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 19,
                        borderWidth: 1.5,
                        borderColor: border,
                        backgroundColor: colors.surface,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {correct ? (
                        <AppIcon name="check" color={colors.green} size={21} />
                      ) : wrong ? (
                        <AppIcon name="close" color={colors.danger} size={21} />
                      ) : (
                        <AppText
                          variant="label"
                          color={selected ? colors.primary : colors.muted}
                        >
                          {String.fromCharCode(65 + index)}
                        </AppText>
                      )}
                    </View>
                    <AppText
                      variant="heading"
                      style={{ flex: 1, fontSize: 21, lineHeight: 28 }}
                      color={
                        correct
                          ? colors.green
                          : wrong
                            ? colors.danger
                            : colors.ink
                      }
                    >
                      {choice.label}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
            {answer && <AnswerFeedback question={question} answer={answer} />}
            <View
              style={[
                styles.row,
                { justifyContent: "space-between", paddingTop: 6 },
              ]}
            >
              <AppText
                variant="small"
                color={colors.muted}
                style={{ flex: 1, minWidth: 150 }}
              >
                {reviewingErrors
                  ? "Tu retrouves ici ta réponse et son explication."
                  : answer
                    ? "Ta réponse est enregistrée."
                    : "Choisis une réponse, puis vérifie."}
              </AppText>
              {answer ? (
                <Button
                  testID="next-question"
                  icon="arrow-right"
                  onPress={next}
                >
                  {questionIndex + 1 === displayed.length
                    ? reviewingErrors
                      ? "Retour à mon bilan"
                      : "Voir mon bilan"
                    : "Question suivante"}
                </Button>
              ) : (
                <Button
                  testID="verify-answer"
                  icon="check"
                  disabled={!selectedChoice}
                  onPress={verify}
                >
                  Vérifier ma réponse
                </Button>
              )}
            </View>
          </Card>
          <View style={[styles.row, { justifyContent: "center" }]}>
            {displayed.map((q, index) => {
              const saved = attempt.answers.find((a) => a.questionId === q.id);
              return (
                <View
                  key={q.id}
                  accessibilityLabel={`Question ${index + 1} : ${saved ? (saved.isCorrect ? "bonne réponse" : "à revoir") : "sans réponse"}`}
                  style={{
                    width: 25,
                    height: 25,
                    borderRadius: 13,
                    borderWidth: index === questionIndex ? 2 : 0,
                    borderColor: colors.primary,
                    backgroundColor: saved
                      ? saved.isCorrect
                        ? colors.greenLight
                        : colors.orangeLight
                      : colors.border,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {saved && (
                    <AppIcon
                      name={saved.isCorrect ? "check" : "close"}
                      size={14}
                      color={saved.isCorrect ? colors.green : colors.orange}
                    />
                  )}
                </View>
              );
            })}
          </View>
        </>
      )}
    </ChildShell>
  );
}
function AnswerFeedback({
  question,
  answer,
}: {
  question: Question;
  answer: Answer;
}) {
  return (
    <View
      accessibilityLiveRegion="polite"
      style={{
        borderRadius: 20,
        padding: 22,
        gap: 9,
        backgroundColor: answer.isCorrect
          ? colors.greenLight
          : colors.orangeLight,
      }}
    >
      <View style={styles.row}>
        <AppIcon
          name={answer.isCorrect ? "check" : "lightbulb"}
          color={answer.isCorrect ? colors.green : colors.orange}
        />
        <AppText
          variant="heading"
          color={answer.isCorrect ? colors.green : colors.orange}
        >
          {answer.isCorrect ? "Bien joué !" : "On regarde ensemble."}
        </AppText>
      </View>
      {!answer.isCorrect && (
        <AppText style={{ fontWeight: "700" }}>
          La bonne réponse :{" "}
          {
            question.choices.find((c) => c.id === question.correctChoiceId)
              ?.label
          }
        </AppText>
      )}
      <AppText style={{ lineHeight: 27 }}>{question.explanation}</AppText>
      {answer.usedHint && (
        <AppText variant="small" color={colors.muted}>
          Tu as utilisé un indice pour cette question.
        </AppText>
      )}
    </View>
  );
}
function ExerciseSummary({
  attempt,
  onRestart,
  onReviewErrors,
  onExit,
}: {
  attempt: Attempt;
  onRestart: () => void;
  onReviewErrors: () => void;
  onExit: () => void;
}) {
  const correct = attempt.answers.filter((a) => a.isCorrect).length;
  const hints = attempt.answers.filter((a) => a.usedHint).length;
  const mistakes = attempt.answers.filter((a) => !a.isCorrect);
  const concepts = [
    ...new Set(
      attempt.questions
        .filter((q) => mistakes.some((a) => a.questionId === q.id))
        .map((q) => q.concept),
    ),
  ].filter(Boolean);
  return (
    <View testID="exercise-result" style={{ gap: 26 }}>
      <PageHeading
        eyebrow="Ma série terminée"
        title="Un pas de plus !"
        description={attempt.seriesTitle}
      />
      <Card
        style={{
          backgroundColor: colors.primaryLight,
          borderWidth: 0,
          alignItems: "center",
          gap: 16,
          paddingVertical: 34,
        }}
      >
        <View
          style={{
            width: 72,
            height: 72,
            borderRadius: 26,
            backgroundColor: colors.surface,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <AppIcon name="sparkles" size={34} />
        </View>
        <AppText testID="exercise-score" variant="hero" color={colors.primary}>
          {correct} / {attempt.questions.length}
        </AppText>
        <AppText variant="heading" style={{ textAlign: "center" }}>
          {correct === attempt.questions.length
            ? "Toutes tes réponses sont justes."
            : "Chaque essai t’aide à comprendre."}
        </AppText>
        <AppText
          color={colors.muted}
          style={{ textAlign: "center", maxWidth: 520 }}
        >
          Bonnes réponses sur cet essai ·{" "}
          {hints
            ? `${hints} indice${hints > 1 ? "s" : ""} utilisé${hints > 1 ? "s" : ""}`
            : "Sans indice"}
          . Tu peux reprendre les explications ou essayer à nouveau.
        </AppText>
      </Card>
      {concepts.length > 0 && (
        <Card style={{ gap: 13 }}>
          <AppText variant="heading">Mes pistes pour la prochaine fois</AppText>
          {concepts.map((concept) => (
            <View key={concept} style={styles.row}>
              <AppIcon name="lightbulb" color={colors.orange} size={19} />
              <AppText style={{ flex: 1 }}>{concept}</AppText>
            </View>
          ))}
        </Card>
      )}
      <View style={styles.wrap}>
        {mistakes.length > 0 && (
          <Button icon="book" onPress={onReviewErrors}>
            Revoir mes erreurs ({mistakes.length})
          </Button>
        )}
        <Button
          variant={mistakes.length ? "secondary" : "primary"}
          icon="refresh"
          onPress={onRestart}
        >
          Recommencer la série
        </Button>
        <Button variant="ghost" icon="arrow-left" onPress={onExit}>
          Mes exercices
        </Button>
      </View>
      <AppText variant="small" color={colors.muted}>
        Un nouvel essai conserve ce résultat dans ton historique.
      </AppText>
    </View>
  );
}
