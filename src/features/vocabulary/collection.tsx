import { View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ActionCard,
  AppIcon,
  AppText,
  Badge,
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
import { ParentLayout, localId } from "@/features/parent/shared";
import { ChildShell, Loading } from "@/features/child/shared";
import { colors, spacing } from "@/theme";
import { LanguagePicker, VocabularySummary, vocabularyStyles } from "./shared";

export function VocabularyCollection({ role }: { role: "parent" | "child" }) {
  const data = useLearning();
  const router = useRouter();
  const params = useLocalSearchParams<{ language?: string }>();
  const language = vocabularyLanguage(params.language);
  const root = role === "parent" ? "/parent/vocabulary" : "/student/vocabulary";
  const lists = data.vocabularyLists.filter(
    (list) =>
      list.language === language &&
      (role === "parent" || list.status === "published"),
  );
  const add = () =>
    router.push({
      pathname: "/parent/vocabulary/[id]",
      params: { id: localId("vocabulary-list"), language },
    });
  const content = (
    <View style={vocabularyStyles.section} testID={`${role}-vocabulary`}>
      <PageHeading
        title={role === "parent" ? "Listes de vocabulaire" : "Mon vocabulaire"}
        description={
          role === "parent"
            ? `Préparez les listes de ${data.childName} et suivez les mots retenus dans les deux sens.`
            : "Apprends tes mots, entraîne-toi à les traduire et retrouve ceux à revoir."
        }
        action={
          role === "parent" ? (
            <Button icon="plus" testID="add-vocabulary-list" onPress={add}>
              Créer une liste
            </Button>
          ) : undefined
        }
      />
      {role === "child" && (
        <LanguagePicker
          language={language}
          onChange={(language) => router.setParams({ language })}
        />
      )}
      {!data.isReady ? (
        <Loading />
      ) : !lists.length ? (
        <EmptyState
          icon="languages"
          title={`Pas encore de liste en ${languageLabel(language).toLocaleLowerCase("fr")}`}
          description={
            role === "parent"
              ? "Créez une liste, ajoutez les mots et leurs traductions, puis publiez-la pour votre enfant."
              : "Un parent peut préparer une liste avec les mots étudiés en classe. Elle apparaîtra ici après publication."
          }
        >
          {role === "parent" && (
            <Button icon="plus" onPress={add}>
              Ajouter du vocabulaire
            </Button>
          )}
        </EmptyState>
      ) : (
        lists.map((list) => (
          <ActionCard
            key={list.id}
            testID={`vocabulary-list-${list.id}`}
            accessibilityLabel={`Ouvrir la liste ${list.title}`}
            onPress={() =>
              router.push({ pathname: `${root}/[id]`, params: { id: list.id } })
            }
            style={{ gap: spacing.lg }}
          >
            <View style={[vocabularyStyles.row, { flexWrap: "nowrap" }]}>
              <AppIcon name="languages" />
              <AppText variant="heading" style={{ flex: 1 }}>
                {list.title}
              </AppText>
              {role === "parent" && (
                <Badge tone={list.status === "published" ? "green" : "muted"}>
                  {list.status === "published" ? "Publiée" : "Brouillon privé"}
                </Badge>
              )}
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
          onPress={() =>
            router.push(
              role === "parent"
                ? "/parent/english?section=conjugaison"
                : "/student/english",
            )
          }
        >
          Verbes et temps d’anglais
        </Button>
      )}
    </View>
  );
  return role === "parent" ? (
    <ParentLayout active="vocabulary" subjectId={language}>
      {content}
    </ParentLayout>
  ) : (
    <ChildShell
      active="courses"
      subject={data.subjects.find((subject) => subject.id === language)}
    >
      {content}
    </ChildShell>
  );
}
