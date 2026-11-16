import { useState } from "react";
import { View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  AppText,
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeading,
} from "@/components/ui";
import { useLearning } from "@/state/learning-store";
import type { VocabularyMode } from "@/domain/model";
import {
  directionLabel,
  vocabularyModes,
  vocabularyProgress,
} from "@/domain/vocabulary";
import { ChildShell, Loading } from "@/features/child/shared";
import { useTheme, spacing } from "@/theme";
import {
  MasteryRule,
  VocabularySummary,
  WordProgressList,
  useVocabularyStyles,
} from "./shared";

export function StudentVocabularyList() {
  const { colors } = useTheme();
  const vocabularyStyles = useVocabularyStyles();
  const data = useLearning();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const list = data.vocabularyLists.find(
    (list) => list.id === id && list.status === "published" && !list.archived,
  );
  const [mode, setMode] = useState<VocabularyMode>("both");
  const [error, setError] = useState("");
  const pending = [...data.vocabularySessions]
    .reverse()
    .find(
      (session) =>
        !session.source && session.listId === id && !session.completedAt,
    );
  const progress = list
    ? vocabularyProgress(list, data.vocabularySessions)
    : [];
  const hasReview = progress.some((item) => item.status !== "known");
  function start(scope: "all" | "review") {
    try {
      const sessionId = data.startVocabularySession(id, mode, scope);
      if (sessionId)
        router.push({
          pathname: "/student/vocabulary/practice/[id]",
          params: { id: sessionId },
        });
      else
        setError(
          "Aucun mot à travailler dans cette sélection. Tu peux réviser toute la liste.",
        );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "La séance n’a pas pu démarrer.",
      );
    }
  }
  return (
    <ChildShell
      active="courses"
      subject={data.subjects.find((subject) => subject.id === list?.language)}
    >
      <View style={vocabularyStyles.section} testID="student-vocabulary-list">
        <Button
          icon="arrow-left"
          variant="ghost"
          onPress={() =>
            router.push({
              pathname: "/student/vocabulary",
              params: { language: list?.language ?? "english" },
            })
          }
        >
          Mes listes de vocabulaire
        </Button>
        {!data.isReady ? (
          <Loading />
        ) : !list ? (
          <EmptyState
            icon="languages"
            title="Cette liste n’est pas disponible"
            description="Elle n’est peut-être pas encore publiée. Retrouve les autres listes dans ton vocabulaire."
          />
        ) : (
          <>
            <PageHeading
              title={list.title}
              description="Apprends les traductions, puis écris tes réponses pour vérifier ce que tu as retenu."
            />
            <VocabularySummary progress={progress} />
            <Card style={{ gap: spacing.lg }}>
              <View style={vocabularyStyles.row}>
                <AppText variant="heading">Je m’entraîne à traduire</AppText>
                <Badge>
                  {list.words.length} {list.words.length === 1 ? "mot" : "mots"}
                </Badge>
              </View>
              <View style={vocabularyStyles.row}>
                {vocabularyModes.map((item) => (
                  <Button
                    key={item}
                    selected={mode === item}
                    variant={mode === item ? "primary" : "secondary"}
                    testID={`vocabulary-mode-${item}`}
                    onPress={() => setMode(item)}
                  >
                    {directionLabel(list.language, item)}
                  </Button>
                ))}
              </View>
              <AppText variant="small">
                Écris une traduction à chaque question. Les accents comptent ;
                les majuscules et les espaces autour de la réponse ne comptent
                pas.
              </AppText>
              <View style={vocabularyStyles.row}>
                <Button
                  icon="play"
                  testID="start-vocabulary"
                  onPress={() => start("all")}
                >
                  M’entraîner sur toute la liste
                </Button>
                <Button
                  icon="refresh"
                  variant="secondary"
                  testID="review-vocabulary"
                  disabled={!hasReview}
                  onPress={() => start("review")}
                >
                  Travailler les mots non connus
                </Button>
              </View>
              {pending && (
                <Button
                  icon="play"
                  variant="ghost"
                  testID="resume-vocabulary"
                  onPress={() =>
                    router.push({
                      pathname: "/student/vocabulary/practice/[id]",
                      params: { id: pending.id },
                    })
                  }
                >
                  Reprendre ma séance · {pending.answers.length} /{" "}
                  {pending.questions.length}
                </Button>
              )}
              {error && <AppText color={colors.danger}>{error}</AppText>}
            </Card>
            <View style={{ gap: spacing.lg }}>
              <AppText variant="heading">Mes mots, un à un</AppText>
              <MasteryRule />
              <WordProgressList language={list.language} progress={progress} />
            </View>
          </>
        )}
      </View>
    </ChildShell>
  );
}
