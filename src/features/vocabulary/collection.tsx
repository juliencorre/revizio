import { View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ActionCard,
  AppIcon,
  AppText,
  Button,
  EmptyState,
  PageHeading,
} from "@/components/ui";
import { useLearning } from "@/state/learning-store";
import {
  languageLabel,
  vocabularyLanguage,
  vocabularyProgress,
} from "@/domain/vocabulary";
import { ChildShell, Loading } from "@/features/child/shared";
import { useTheme, spacing } from "@/theme";
import {
  LanguagePicker,
  VocabularySummary,
  useVocabularyStyles,
} from "./shared";

export function VocabularyCollection() {
  const { colors } = useTheme();
  const vocabularyStyles = useVocabularyStyles();
  const data = useLearning();
  const router = useRouter();
  const params = useLocalSearchParams<{ language?: string }>();
  const language = vocabularyLanguage(params.language);
  const lists = data.vocabularyLists.filter(
    (list) => list.language === language && list.status === "published",
  );
  return (
    <ChildShell
      active="courses"
      subject={data.subjects.find((subject) => subject.id === language)}
    >
      <View style={vocabularyStyles.section} testID="child-vocabulary">
        <PageHeading
          title="Mon vocabulaire"
          description="Apprends tes mots, entraîne-toi à les traduire et retrouve ceux à revoir."
        />
        <LanguagePicker
          language={language}
          onChange={(language) => router.setParams({ language })}
        />
        {!data.isReady ? (
          <Loading />
        ) : !lists.length ? (
          <EmptyState
            icon="languages"
            title={`Pas encore de liste en ${languageLabel(language).toLocaleLowerCase("fr")}`}
            description="Un parent peut préparer une liste avec les mots étudiés en classe. Elle apparaîtra ici après publication."
          />
        ) : (
          lists.map((list) => (
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
                progress={vocabularyProgress(list, data.vocabularySessions)}
              />
            </ActionCard>
          ))
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
