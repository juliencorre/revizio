import { useRef, useState } from "react";
import { View, type ScrollViewInstance } from "react-native";
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
import { useLearning } from "@/state/learning-store";
import type { VocabularySession } from "@/domain/model";
import {
  directionLabel,
  languageLabel,
  vocabularyProgress,
} from "@/domain/vocabulary";
import { ChildShell, Loading } from "@/features/child/shared";
import { Field } from "@/features/parent/shared";
import { useTheme, spacing } from "@/theme";
import { VocabularySummary, useVocabularyStyles } from "./shared";

export function VocabularyPractice() {
  const data = useLearning();
  const { id } = useLocalSearchParams<{ id: string }>();
  const session = data.vocabularySessions.find((session) => session.id === id);
  if (!data.isReady)
    return (
      <ChildShell active="courses" focus>
        <Loading />
      </ChildShell>
    );
  if (!session)
    return (
      <ChildShell active="courses">
        <EmptyState
          icon="languages"
          title="Cette séance n’est pas disponible"
          description="Retrouve ta liste de vocabulaire pour commencer une séance."
        />
      </ChildShell>
    );
  return (
    <PracticeSession key={`${data.activeProfileId}.${id}`} initial={session} />
  );
}
function PracticeSession({ initial }: { initial: VocabularySession }) {
  const { colors } = useTheme();
  const vocabularyStyles = useVocabularyStyles();
  const data = useLearning();
  const router = useRouter();
  const scrollRef = useRef<ScrollViewInstance>(null);
  const [index, setIndex] = useState(
    Math.min(initial.answers.length, initial.questions.length - 1),
  );
  const [response, setResponse] = useState("");
  const [error, setError] = useState("");
  const session = data.vocabularySessions.find(
    (session) => session.id === initial.id,
  )!;
  const list = data.vocabularyLists.find(
    (list) =>
      !session.source &&
      list.id === session.listId &&
      list.status === "published" &&
      !list.archived,
  );
  const question = session.questions[index];
  const answer = session.answers.find(
    (answer) => answer.questionId === question.id,
  );
  const target =
    question.direction === "to-french"
      ? "français"
      : languageLabel(session.language).toLocaleLowerCase("fr");
  const back = () =>
    list
      ? router.replace({
          pathname: "/student/vocabulary/[id]",
          params: { id: list.id },
        })
      : router.replace({
          pathname: "/student/vocabulary",
          params: { language: session.language },
        });
  function verify() {
    if (!response.trim()) {
      setError("Écris une traduction avant de vérifier.");
      return;
    }
    try {
      data.answerVocabulary(session.id, question.id, response);
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
    if (index === session.questions.length - 1)
      data.completeVocabulary(session.id);
    else {
      setIndex(index + 1);
      setResponse("");
      setError("");
    }
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }
  const footer = session.completedAt ? undefined : (
    <Button
      icon={answer ? "arrow-right" : "check"}
      style={{ flex: 1 }}
      testID={answer ? "vocabulary-next" : "vocabulary-check"}
      onPress={answer ? next : verify}
    >
      {answer
        ? index === session.questions.length - 1
          ? "Voir mon bilan"
          : "Question suivante"
        : "Vérifier ma traduction"}
    </Button>
  );
  return (
    <ChildShell
      active="courses"
      focus
      footer={footer}
      scrollRef={scrollRef}
      subject={data.subjects.find((subject) => subject.id === session.language)}
    >
      <View style={vocabularyStyles.section} testID="vocabulary-practice">
        <Button icon="arrow-left" variant="ghost" onPress={back}>
          Quitter et garder ma place
        </Button>
        {session.completedAt ? (
          <>
            <PageHeading
              title="Séance terminée"
              description={session.listTitle}
            />
            <Card style={{ gap: spacing.lg }}>
              <AppText variant="heading">Tes traductions</AppText>
              <AppText variant="title" testID="vocabulary-score">
                {session.answers.filter((answer) => answer.isCorrect).length} /{" "}
                {session.questions.length}
              </AppText>
              <AppText>
                {session.source
                  ? "Les mots à revoir reviendront dans une prochaine révision."
                  : "Chaque réponse fait avancer le suivi de tes mots dans le sens travaillé."}
              </AppText>
              {list && (
                <VocabularySummary
                  progress={vocabularyProgress(list, data.vocabularySessions)}
                />
              )}
              <Button
                icon="book"
                testID="vocabulary-back-to-list"
                onPress={back}
              >
                {session.source
                  ? "Mon vocabulaire"
                  : "Retrouver mes mots et mon suivi"}
              </Button>
              {list && (
                <Button
                  icon="refresh"
                  variant="secondary"
                  onPress={() => {
                    const id = data.startVocabularySession(
                      list.id,
                      session.mode,
                      session.scope,
                      true,
                    );
                    if (id)
                      router.replace({
                        pathname: "/student/vocabulary/practice/[id]",
                        params: { id },
                      });
                    else back();
                  }}
                >
                  Refaire une séance
                </Button>
              )}
            </Card>
            <View style={{ gap: spacing.lg }}>
              <AppText variant="heading">Les réponses de cette séance</AppText>
              {session.questions.map((question) => {
                const answer = session.answers.find(
                  (answer) => answer.questionId === question.id,
                )!;
                return (
                  <View key={question.id} style={vocabularyStyles.wordRow}>
                    <View style={vocabularyStyles.row}>
                      <AppIcon
                        name={answer.isCorrect ? "check" : "refresh"}
                        color={answer.isCorrect ? colors.green : colors.orange}
                      />
                      <AppText variant="label" style={{ flex: 1 }}>
                        {question.prompt}
                      </AppText>
                      <Badge tone={answer.isCorrect ? "green" : "orange"}>
                        {answer.isCorrect ? "Réussi" : "À revoir"}
                      </Badge>
                    </View>
                    <AppText variant="small">
                      {question.context && question.context + " · "}
                      {directionLabel(session.language, question.direction)} ·
                      Ta réponse : {answer.response ?? answer.choiceId}
                    </AppText>
                    <AppText color={colors.muted}>
                      Traduction :{" "}
                      {(
                        question.guide?.models ?? question.expectedAnswers
                      ).join(" / ")}
                    </AppText>
                  </View>
                );
              })}
            </View>
          </>
        ) : (
          <>
            <PageHeading
              title={session.listTitle}
              description={directionLabel(session.language, session.mode)}
            />
            <View
              style={[
                vocabularyStyles.row,
                { justifyContent: "space-between" },
              ]}
            >
              <AppText variant="label">
                Question {index + 1} sur {session.questions.length}
              </AppText>
              <Badge>
                {directionLabel(session.language, question.direction)}
              </Badge>
            </View>
            <ProgressBar
              value={(session.answers.length / session.questions.length) * 100}
            />
            <Card style={{ gap: spacing.xl }}>
              <AppText>
                {question.guide?.instruction ??
                  `Écris la traduction en ${target}.`}
              </AppText>
              {question.context && (
                <AppText variant="small">Contexte · {question.context}</AppText>
              )}
              <AppText variant="title" testID="vocabulary-prompt">
                {question.prompt}
              </AppText>
              <Field
                key={question.id}
                label={`Ta traduction en ${target}`}
                testID="vocabulary-answer"
                value={answer ? (answer.response ?? answer.choiceId) : response}
                editable={!answer}
                autoCorrect={false}
                spellCheck={false}
                autoCapitalize="none"
                autoComplete="off"
                textContentType="none"
                maxLength={300}
                returnKeyType="done"
                onChangeText={(value) => {
                  setResponse(value);
                  setError("");
                }}
                onSubmitEditing={() => {
                  if (!answer) verify();
                }}
              />
              {error && (
                <AppText color={colors.danger} testID="vocabulary-answer-error">
                  {error}
                </AppText>
              )}
            </Card>
            {answer && (
              <View
                accessibilityLiveRegion="polite"
                testID="vocabulary-feedback"
                onLayout={() =>
                  scrollRef.current?.scrollToEnd({ animated: false })
                }
                style={{
                  padding: spacing.xl,
                  borderRadius: 24,
                  backgroundColor: answer.isCorrect
                    ? colors.greenLight
                    : colors.dangerLight,
                  gap: spacing.sm,
                }}
              >
                <AppText
                  variant="heading"
                  color={answer.isCorrect ? colors.green : colors.danger}
                >
                  {answer.isCorrect ? "Bien joué !" : "Ce mot est à revoir"}
                </AppText>
                <AppText
                  color={answer.isCorrect ? colors.green : colors.danger}
                >
                  Traduction :{" "}
                  {(question.guide?.models ?? question.expectedAnswers).join(
                    " / ",
                  )}
                </AppText>
              </View>
            )}
          </>
        )}
      </View>
    </ChildShell>
  );
}
