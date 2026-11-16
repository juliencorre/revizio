import { useCallback, useRef, useState } from "react";
import { View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import * as Speech from "expo-speech";
import {
  AppText,
  Button,
  Card,
  EmptyState,
  PageHeading,
  ProgressBar,
} from "@/components/ui";
import { conjugationVerbs, type ConjugationSheet } from "@/domain/conjugation";
import {
  conjugationSeriesId,
  conjugationTitle,
} from "@/domain/conjugation-practice";
import type { Attempt } from "@/domain/model";
import { ChildShell, Loading } from "@/features/child/shared";
import { Field } from "@/features/parent/shared";
import { speechSupported } from "@/services/speech-supported";
import { useLearning } from "@/state/learning-store";
import { spacing, useTheme } from "@/theme";
import { ConjugationTable } from "./conjugation-table";

const actions = {
  flexDirection: "row",
  flexWrap: "wrap",
  alignItems: "center",
  gap: spacing.md,
} as const;

export function StudentConjugationScreen() {
  const data = useLearning();
  const router = useRouter();
  const [selection, setSelection] = useState("");
  const [choosing, setChoosing] = useState(false);
  const sheet =
    data.conjugationSheets.find(
      (item) => conjugationSeriesId(item) === selection,
    ) ?? data.conjugationSheets[0];
  return (
    <ChildShell active="courses">
      <View style={{ gap: spacing.xl }} testID="student-conjugation">
        <PageHeading
          eyebrow="Anglais"
          title="Ma conjugaison"
          action={
            <Button
              variant="ghost"
              icon="arrow-left"
              onPress={() => router.navigate("/student/subject/english")}
            >
              Mes cours d’anglais
            </Button>
          }
        />
        {!data.isReady ? (
          <Loading />
        ) : !sheet ? (
          <EmptyState
            icon="book"
            title="Tes fiches de conjugaison arriveront ici"
            description="Un parent peut choisir un verbe et un temps, puis ajouter la fiche à ta révision."
          />
        ) : (
          <>
            {data.conjugationSheets.length > 1 && (
              <View style={{ gap: spacing.sm }}>
                <Button
                  variant="secondary"
                  icon="chevron-down"
                  expanded={choosing}
                  testID="choose-conjugation-sheet"
                  onPress={() => setChoosing(!choosing)}
                >
                  Changer de fiche
                </Button>
                {choosing && (
                  <View style={actions}>
                    {data.conjugationSheets.map((item) => (
                      <Button
                        key={conjugationSeriesId(item)}
                        variant={item === sheet ? "primary" : "secondary"}
                        selected={item === sheet}
                        onPress={() => {
                          setSelection(conjugationSeriesId(item));
                          setChoosing(false);
                        }}
                      >
                        {conjugationTitle(item)}
                      </Button>
                    ))}
                  </View>
                )}
              </View>
            )}
            <ConjugationLesson
              key={data.activeProfileId + conjugationSeriesId(sheet)}
              sheet={sheet}
            />
          </>
        )}
      </View>
    </ChildShell>
  );
}

function ConjugationLesson({ sheet }: { sheet: ConjugationSheet }) {
  const { colors } = useTheme();
  const data = useLearning();
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const seriesId = conjugationSeriesId(sheet);
  const attempt = data.attempts.find(
    (item) => item.id === attemptId && item.seriesId === seriesId,
  );
  const pending = data.attempts.some(
    (item) => item.seriesId === seriesId && !item.completedAt,
  );
  const verb = conjugationVerbs.find((item) => item.base === sheet.verb);
  function practice() {
    try {
      const id = data.startConjugationAttempt(sheet);
      if (!id) throw new Error("Cette fiche est indisponible.");
      setAttemptId(id);
      setError("");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "La séance est indisponible.",
      );
    }
  }
  return (
    <Card style={{ gap: spacing.lg }}>
      <View style={{ gap: spacing.xs }}>
        <AppText variant="title">{conjugationTitle(sheet)}</AppText>
        {verb && <AppText color={colors.muted}>{verb.meaning}</AppText>}
      </View>
      <View style={actions}>
        <Button
          icon="book"
          selected={!attempt}
          variant={attempt ? "secondary" : "primary"}
          testID="conjugation-learn"
          onPress={() => {
            setAttemptId(null);
            setError("");
          }}
        >
          Apprendre
        </Button>
        <Button
          icon="pencil"
          selected={!!attempt}
          variant={attempt ? "primary" : "secondary"}
          testID="conjugation-practice"
          onPress={practice}
        >
          {pending && !attempt
            ? "Reprendre l’entraînement"
            : attempt?.completedAt
              ? "M’entraîner à nouveau"
              : "M’entraîner"}
        </Button>
      </View>
      {!!error && <AppText color={colors.danger}>{error}</AppText>}
      {attempt ? (
        <ConjugationPractice key={attempt.id} attempt={attempt} />
      ) : (
        <SpokenTable sheet={sheet} />
      )}
    </Card>
  );
}

function SpokenTable({ sheet }: { sheet: ConjugationSheet }) {
  const { colors } = useTheme();
  const generation = useRef(0);
  const [error, setError] = useState("");
  useFocusEffect(
    useCallback(
      () => () => {
        generation.current++;
        if (speechSupported()) void Speech.stop().catch(() => undefined);
      },
      [],
    ),
  );
  async function speak(phrase: string) {
    const current = ++generation.current;
    const unavailable = () => {
      if (generation.current === current)
        setError("La lecture audio est indisponible sur cet appareil.");
    };
    if (!speechSupported()) {
      unavailable();
      return;
    }
    setError("");
    try {
      await Speech.stop();
      if (generation.current === current)
        Speech.speak(phrase, {
          language: "en-GB",
          rate: 0.85,
          onError: unavailable,
        });
    } catch {
      unavailable();
    }
  }
  return (
    <View style={{ gap: spacing.md }}>
      <AppText color={colors.muted}>Touche une forme pour l’écouter.</AppText>
      <ConjugationTable sheet={sheet} onSpeak={speak} />
      {!!error && <AppText color={colors.orange}>{error}</AppText>}
    </View>
  );
}

function ConjugationPractice({ attempt }: { attempt: Attempt }) {
  const { colors } = useTheme();
  const data = useLearning();
  const [response, setResponse] = useState("");
  const [checkedId, setCheckedId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const questions = attempt.questions;
  const nextOpen = questions.find(
    (item) => !attempt.answers.some((answer) => answer.questionId === item.id),
  );
  const question =
    questions.find((item) => item.id === checkedId) ??
    nextOpen ??
    questions[questions.length - 1];
  const answer = attempt.answers.find(
    (item) => item.questionId === question.id,
  );
  const initialCount = questions.filter(
    (item) => !item.id.endsWith("-retry"),
  ).length;
  const index = questions.indexOf(question);
  const retry = question.id.endsWith("-retry");
  const number = retry ? index - initialCount + 1 : index + 1;
  const total = retry ? questions.length - initialCount : initialCount;
  function verify() {
    if (!response.trim() || answer) return;
    try {
      data.answerQuestion(attempt.id, question.id, response.trim(), false);
      setCheckedId(question.id);
      setError("");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Ta réponse n’a pas pu être enregistrée.",
      );
    }
  }
  function next() {
    try {
      if (!nextOpen) data.completeAttempt(attempt.id);
      setResponse("");
      setCheckedId(null);
      setError("");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Ta séance n’a pas pu être enregistrée.",
      );
    }
  }
  if (attempt.completedAt) {
    const correctFirst = attempt.answers.filter(
      (item) => item.isCorrect && !item.questionId.endsWith("-retry"),
    ).length;
    const missedAgain = questions.filter(
      (item) =>
        item.id.endsWith("-retry") &&
        attempt.answers.some(
          (answer) => answer.questionId === item.id && !answer.isCorrect,
        ),
    );
    return (
      <View
        style={{ gap: spacing.md }}
        testID="conjugation-finished"
        accessibilityLiveRegion="polite"
      >
        <AppText variant="heading">Séance terminée</AppText>
        <AppText>{`Bonnes réponses du premier coup · ${correctFirst} sur ${initialCount}`}</AppText>
        {missedAgain.length > 0 && (
          <>
            <AppText variant="label">Formes à revoir</AppText>
            {missedAgain.map((item) => (
              <AppText key={item.id}>{item.explanation}</AppText>
            ))}
          </>
        )}
      </View>
    );
  }
  return (
    <View style={{ gap: spacing.lg }} testID="conjugation-exercise">
      <View style={{ gap: spacing.sm }}>
        <AppText variant="label">
          {retry ? "À revoir" : "Personne"} {number} sur {total}
        </AppText>
        <ProgressBar value={((number - (answer ? 0 : 1)) / total) * 100} />
      </View>
      <View style={{ gap: spacing.xs }} accessibilityLiveRegion="polite">
        <AppText variant="hero" testID="conjugation-prompt">
          {question.prompt}
        </AppText>
        {!!question.hint && (
          <AppText color={colors.muted}>{question.hint}</AppText>
        )}
      </View>
      {answer ? (
        <View style={{ gap: spacing.md }} accessibilityLiveRegion="polite">
          <AppText color={answer.isCorrect ? colors.green : colors.ink}>
            {answer.isCorrect
              ? "Bonne réponse !"
              : `Tu as écrit « ${answer.choiceId} ».`}
          </AppText>
          <AppText variant="heading" testID="conjugation-correction">
            {question.explanation}
          </AppText>
          <Button testID="conjugation-next" icon="arrow-right" onPress={next}>
            {nextOpen ? "Continuer" : "Terminer"}
          </Button>
        </View>
      ) : (
        <>
          <Field
            key={question.id}
            label="Complète avec la forme du verbe"
            placeholder="Ta réponse"
            testID="conjugation-answer"
            value={response}
            accessibilityLabel={`Complète la forme du verbe pour « ${question.prompt} »`}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            maxLength={120}
            onChangeText={setResponse}
            returnKeyType="done"
            onSubmitEditing={verify}
          />
          <Button
            testID="conjugation-check"
            icon="check"
            disabled={!response.trim()}
            onPress={verify}
          >
            Vérifier
          </Button>
        </>
      )}
      {!!error && <AppText color={colors.danger}>{error}</AppText>}
    </View>
  );
}
