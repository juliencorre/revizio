import { type ComponentRef, useEffect, useRef, useState } from "react";
import { type Pressable, Text, View } from "react-native";
import { AppText, Button, Card } from "@/components/ui";
import type { Attempt } from "@/domain/model";
import { Field } from "@/features/parent/shared";
import { useLearning } from "@/state/learning-store";
import { radius, spacing, useTheme } from "@/theme";
import { useCompactPractice } from "./conjugation-practice-frame";

export function ConjugationExercise({
  attempt,
  onRestart,
}: {
  attempt: Attempt;
  onRestart: () => void;
}) {
  const data = useLearning();
  const { colors } = useTheme();
  const compact = useCompactPractice();
  const [response, setResponse] = useState("");
  const [checkedId, setCheckedId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const nextButton = useRef<ComponentRef<typeof Pressable>>(null);
  const { questions, answers } = attempt;
  const nextOpen = questions.find(
    (item) => !answers.some((answer) => answer.questionId === item.id),
  );
  const question =
    questions.find((item) => item.id === checkedId) ??
    nextOpen ??
    questions[questions.length - 1];
  const answer = answers.find((item) => item.questionId === question?.id);
  useEffect(() => {
    if (answer) nextButton.current?.focus();
  }, [answer?.questionId]);

  const initialCount = questions.filter(
    (item) => !item.id.endsWith("-retry"),
  ).length;
  const cardStyle = {
    width: "100%",
    paddingHorizontal: compact ? spacing.lg : 36,
    paddingVertical: compact ? spacing.lg : 28,
  } as const;

  if (attempt.completedAt) {
    const correctFirst = answers.filter(
      (item) => item.isCorrect && !item.questionId.endsWith("-retry"),
    ).length;
    const missedAgain = questions.filter(
      (item) =>
        item.id.endsWith("-retry") &&
        answers.some(
          (answer) => answer.questionId === item.id && !answer.isCorrect,
        ),
    );
    return (
      <Card
        style={[cardStyle, { gap: spacing.lg }]}
        testID="conjugation-finished"
      >
        <View style={{ gap: spacing.xs }} accessibilityLiveRegion="polite">
          <AppText color={colors.muted}>{attempt.seriesTitle}</AppText>
          <AppText variant="title">Séance terminée</AppText>
          <AppText>{`Bonnes réponses du premier coup · ${correctFirst} sur ${initialCount}`}</AppText>
        </View>
        {missedAgain.length > 0 && (
          <View style={{ gap: spacing.xs }}>
            <AppText variant="label">Formes à revoir</AppText>
            {missedAgain.map((item) => (
              <AppText key={item.id}>{item.explanation}</AppText>
            ))}
          </View>
        )}
        <Button icon="rotate" testID="conjugation-restart" onPress={onRestart}>
          M’entraîner à nouveau
        </Button>
      </Card>
    );
  }

  if (!question) {
    return (
      <Card>
        <AppText>Cette séance ne contient aucune question.</AppText>
      </Card>
    );
  }
  const index = questions.indexOf(question);
  const retry = question.id.endsWith("-retry");
  const number = retry ? index - initialCount + 1 : index + 1;
  const total = retry ? questions.length - initialCount : initialCount;
  const subject = question.prompt.replace(/\s*_+\s*$/u, "");
  const prefix = subject + " ";
  const correctionForm = question.explanation.startsWith(prefix)
    ? question.explanation.slice(prefix.length)
    : "";
  const compoundForms = questions.some((item) =>
    item.expectedAnswers?.[0]?.includes(" "),
  );
  const phraseHeight = compact ? 58 : 70;
  const phraseStyle = {
    fontSize: compact ? 32 : 42,
    lineHeight: compact ? 40 : 52,
    fontWeight: "700",
  } as const;

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

  return (
    <Card style={cardStyle} testID="conjugation-exercise">
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          justifyContent: "space-between",
          alignItems: "center",
          gap: spacing.sm,
          borderBottomWidth: 1,
          borderColor: colors.border,
          paddingBottom: compact ? spacing.md : 20,
        }}
      >
        <AppText variant="heading" style={{ fontSize: compact ? 21 : 26 }}>
          {attempt.seriesTitle}
        </AppText>
        <AppText variant="label" color={colors.muted}>
          {`${retry ? "À revoir" : "Question"} ${number} sur ${total}`}
        </AppText>
      </View>
      <View
        style={{ marginTop: compact ? spacing.md : 20 }}
        accessibilityLiveRegion="polite"
      >
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            alignItems: "center",
            gap: spacing.sm,
          }}
        >
          <AppText color={colors.muted}>
            {answer
              ? answer.isCorrect
                ? "Bonne réponse !"
                : "La forme correcte est"
              : "Complète la phrase."}
          </AppText>
          {!!question.hint && (
            <AppText variant="label" color={colors.muted}>
              {question.hint}
            </AppText>
          )}
        </View>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: spacing.lg,
            minHeight: phraseHeight,
            marginTop: compact ? spacing.sm : spacing.lg,
          }}
        >
          {answer ? (
            <AppText testID="conjugation-correction" style={phraseStyle}>
              {correctionForm ? prefix : ""}
              <Text style={{ color: colors.green }}>
                {correctionForm || question.explanation}
              </Text>
            </AppText>
          ) : (
            <>
              <AppText
                testID="conjugation-prompt"
                style={[phraseStyle, { flexShrink: 0 }]}
              >
                {subject}
              </AppText>
              <View
                style={{
                  width: compoundForms ? 350 : 220,
                  flexShrink: 1,
                  minWidth: 0,
                }}
              >
                <Field
                  key={question.id}
                  hideLabel
                  label={`Complète la forme du verbe pour « ${subject} »${question.hint ? " (" + question.hint + ")" : ""}`}
                  testID="conjugation-answer"
                  value={response}
                  style={{
                    ...phraseStyle,
                    borderWidth: 2,
                    borderRadius: radius.sm,
                    minHeight: phraseHeight,
                    paddingVertical: spacing.xs,
                    outlineWidth: 0,
                  }}
                  autoFocus
                  autoCapitalize="none"
                  autoCorrect={false}
                  spellCheck={false}
                  maxLength={120}
                  returnKeyType="done"
                  submitBehavior="submit"
                  onChangeText={setResponse}
                  onSubmitEditing={verify}
                />
              </View>
            </>
          )}
        </View>
        <View
          style={{
            minHeight: compact ? 58 : 38,
            paddingTop: spacing.xs,
          }}
        >
          {answer && !answer.isCorrect && (
            <AppText color={colors.muted}>
              {`Tu as écrit « ${answer.choiceId} ».`}
              {correctionForm && (
                <>
                  {" Avec "}
                  <Text style={{ fontWeight: "700" }}>
                    {subject === "I" ? "I" : subject.toLowerCase()}
                  </Text>
                  {", on utilise "}
                  <Text style={{ fontWeight: "700" }}>{correctionForm}</Text>
                  {"."}
                </>
              )}
            </AppText>
          )}
          {!!error && <AppText color={colors.danger}>{error}</AppText>}
        </View>
      </View>
      <Button
        ref={nextButton}
        testID={answer ? "conjugation-next" : "conjugation-check"}
        icon={answer ? "arrow-right" : "check"}
        disabled={!answer && !response.trim()}
        onPress={answer ? next : verify}
        style={{
          alignSelf: "flex-end",
          minWidth: 156,
          minHeight: 50,
          borderRadius: radius.sm,
          flexDirection: answer ? "row-reverse" : "row",
          marginTop: compact ? spacing.xs : spacing.sm,
        }}
      >
        {answer ? (nextOpen ? "Continuer" : "Terminer") : "Vérifier"}
      </Button>
    </Card>
  );
}
