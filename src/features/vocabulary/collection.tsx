import { useMemo, useState } from "react";
import { View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ActionCard,
  AppIcon,
  AppText,
  Button,
  Card,
  EmptyState,
  PageHeading,
} from "@/components/ui";
import { useLearning } from "@/state/learning-store";
import {
  languageLabel,
  vocabularyLanguage,
  vocabularyProgress,
  wordKey,
} from "@/domain/vocabulary";
import { Field } from "@/features/parent/shared";
import { normalizeAnswer } from "@/domain/answers";
import { vocabularyRepertoire } from "@/domain/vocabulary-repertoire";
import { ChildShell, Loading } from "@/features/child/shared";
import { useTheme, spacing } from "@/theme";
import {
  LanguagePicker,
  WordProgressList,
  MasteryRule,
  VocabularySummary,
  useVocabularyStyles,
} from "./shared";

export function VocabularyCollection() {
  const { colors } = useTheme();
  const vocabularyStyles = useVocabularyStyles();
  const data = useLearning();
  const router = useRouter();
  const params = useLocalSearchParams<{ language?: string; view?: string }>();
  const language = vocabularyLanguage(params.language);
  const allWords = params.view === "words";
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const repertoire = useMemo(
    () =>
      vocabularyRepertoire(
        {
          vocabularyLists: data.vocabularyLists,
          vocabularyRetainedWords: data.vocabularyRetainedWords,
        },
        language,
      ),
    [data.vocabularyLists, data.vocabularyRetainedWords, language],
  );
  const progress = useMemo(
    () => vocabularyProgress(repertoire, data.vocabularySessions),
    [repertoire, data.vocabularySessions],
  );
  const bySense = useMemo(
    () => new Map(progress.map((item) => [wordKey(item.word), item])),
    [progress],
  );
  const matching = progress.filter(({ word }) =>
    normalizeAnswer(word.term + " " + word.translation).includes(
      normalizeAnswer(query),
    ),
  );
  const pending = data.vocabularySessions.some(
    (session) =>
      session.source === "repertoire" &&
      session.language === language &&
      !session.completedAt,
  );
  function review() {
    try {
      const id = data.startGeneralReview(language);
      if (id)
        router.push({
          pathname: "/student/vocabulary/practice/[id]",
          params: { id },
        });
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "La séance est indisponible.",
      );
    }
  }
  const lists = data.vocabularyLists.filter(
    (list) =>
      list.language === language &&
      list.status === "published" &&
      !list.archived,
  );
  return (
    <ChildShell
      active="courses"
      subject={data.subjects.find((subject) => subject.id === language)}
    >
      <View style={vocabularyStyles.section} testID="child-vocabulary">
        <PageHeading title={allWords ? "Tous mes mots" : "Mon vocabulaire"} />
        <LanguagePicker
          language={language}
          onChange={(language) => {
            setQuery("");
            setError("");
            router.setParams({ language });
          }}
        />
        {!data.isReady ? (
          <Loading />
        ) : allWords ? (
          <Card style={{ gap: spacing.lg }}>
            <Button
              variant="ghost"
              icon="arrow-left"
              onPress={() =>
                router.replace({
                  pathname: "/student/vocabulary",
                  params: { language },
                })
              }
            >
              Mon vocabulaire
            </Button>
            <VocabularySummary progress={progress} />
            <MasteryRule />
            <Field
              label="Chercher un mot ou une traduction"
              value={query}
              onChangeText={setQuery}
            />
            {query.trim() && !matching.length ? (
              <AppText>Aucun mot trouvé.</AppText>
            ) : (
              <WordProgressList
                key={language + query}
                language={language}
                progress={matching}
                paginate
              />
            )}
          </Card>
        ) : !repertoire.words.length ? (
          <EmptyState
            icon="languages"
            title={`Pas encore de liste en ${languageLabel(language).toLocaleLowerCase("fr")}`}
            description="Un parent peut préparer une liste avec les mots étudiés en classe. Elle apparaîtra ici après publication."
          />
        ) : (
          <>
            <Card style={{ gap: spacing.lg }}>
              <AppText variant="heading">Révision générale</AppText>
              <VocabularySummary progress={progress} />
              <View style={vocabularyStyles.row}>
                <Button
                  icon="play"
                  testID="general-vocabulary-review"
                  onPress={review}
                >
                  {pending ? "Reprendre ma révision" : "Réviser 5 minutes"}
                </Button>
                <Button
                  variant="secondary"
                  icon="book"
                  onPress={() => {
                    setQuery("");
                    router.push({
                      pathname: "/student/vocabulary",
                      params: { language, view: "words" },
                    });
                  }}
                >
                  Tous mes mots
                </Button>
              </View>
              {error && <AppText color={colors.danger}>{error}</AppText>}
            </Card>
            {lists.length > 0 && (
              <AppText variant="heading">Apprendre une liste</AppText>
            )}
            {lists.map((list) => (
              <ActionCard
                key={list.id}
                testID={`vocabulary-list-${list.id}`}
                accessibilityLabel={`Ouvrir la liste ${list.title}`}
                onPress={() =>
                  router.push({
                    pathname: "/student/vocabulary/[id]",
                    params: { id: list.id },
                  })
                }
                style={{ gap: spacing.lg }}
              >
                <View style={[vocabularyStyles.row, { flexWrap: "nowrap" }]}>
                  <AppIcon name="languages" />
                  <AppText variant="heading" style={{ flex: 1 }}>
                    {list.title}
                  </AppText>
                  <AppIcon name="chevron-right" color={colors.muted} />
                </View>
                <VocabularySummary
                  progress={list.words.map((word) =>
                    bySense.get(wordKey(word))!,
                  )}
                />
              </ActionCard>
            ))}
          </>
        )}
        {language === "english" && (
          <Button
            variant="ghost"
            icon="book"
            onPress={() => router.push("/student/english")}
          >
            Verbes et temps d’anglais
          </Button>
        )}
      </View>
    </ChildShell>
  );
}
