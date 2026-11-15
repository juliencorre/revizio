import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { AppText, Badge, Button, ProgressBar } from "@/components/ui";
import { colors, spacing } from "@/theme";
import type { VocabularyLanguage } from "@/domain/model";
import {
  directionLabel,
  vocabularyKnownStreak,
  vocabularyLanguages,
  vocabularyStatusLabels,
  type VocabularyWordProgress,
} from "@/domain/vocabulary";

export function LanguagePicker({
  language,
  onChange,
}: {
  language: VocabularyLanguage;
  onChange: (language: VocabularyLanguage) => void;
}) {
  return (
    <View style={vocabularyStyles.row}>
      {vocabularyLanguages.map((item) => (
        <Button
          key={item.id}
          testID={`vocabulary-language-${item.id}`}
          selected={item.id === language}
          variant={item.id === language ? "primary" : "secondary"}
          icon="languages"
          onPress={() => onChange(item.id)}
        >
          {item.label}
        </Button>
      ))}
    </View>
  );
}
export function VocabularySummary({
  progress,
}: {
  progress: VocabularyWordProgress[];
}) {
  const known = progress.filter((item) => item.status === "known").length;
  const review = progress.filter((item) => item.status === "review").length;
  return (
    <View style={{ gap: spacing.sm }}>
      <AppText variant="small" color={colors.muted}>
        {known} {known === 1 ? "mot connu" : "mots connus"} sur{" "}
        {progress.length}
        {review ? ` · ${review} à revoir` : ""}
      </AppText>
      <ProgressBar
        value={progress.length ? (known / progress.length) * 100 : 0}
        color={colors.green}
      />
    </View>
  );
}
export function MasteryRule() {
  return (
    <AppText variant="small" color={colors.muted}>
      Un mot est connu après {vocabularyKnownStreak} réussites de suite dans
      chaque sens. Une erreur le remet à revoir. Regarder les traductions ne
      change pas le suivi.
    </AppText>
  );
}
export function WordProgressList({
  language,
  progress,
}: {
  language: VocabularyLanguage;
  progress: VocabularyWordProgress[];
}) {
  const [filter, setFilter] = useState<"all" | "review" | "known">("all");
  const visible = progress.filter(
    (item) =>
      filter === "all" ||
      (filter === "known" ? item.status === "known" : item.status !== "known"),
  );
  return (
    <View style={{ gap: spacing.lg }}>
      <View style={vocabularyStyles.row}>
        {(
          [
            ["all", "Tous les mots"],
            ["review", "À travailler"],
            ["known", "Connus"],
          ] as const
        ).map(([id, label]) => (
          <Button
            key={id}
            selected={filter === id}
            variant={filter === id ? "primary" : "secondary"}
            testID={`vocabulary-filter-${id}`}
            onPress={() => setFilter(id)}
          >
            {label}
          </Button>
        ))}
      </View>
      {!visible.length ? (
        <View style={{ gap: spacing.sm, paddingVertical: spacing.lg }}>
          <AppText variant="heading">Aucun mot dans cette catégorie</AppText>
          <AppText color={colors.muted}>
            {!progress.length
              ? "Le suivi apparaîtra ici quand la liste contiendra des mots et leurs traductions."
              : filter === "known"
                ? "Les mots connus apparaîtront ici après des réussites dans les deux sens."
                : "Tous les mots de la liste sont connus. Tu peux continuer à les réviser."}
          </AppText>
        </View>
      ) : (
        visible.map((item) => (
          <View
            key={item.word.id}
            testID={`vocabulary-word-${item.word.id}`}
            style={vocabularyStyles.wordRow}
          >
            <View
              style={[
                vocabularyStyles.row,
                { justifyContent: "space-between", alignItems: "flex-start" },
              ]}
            >
              <View style={{ flex: 1, minWidth: 0, gap: spacing.xs }}>
                <AppText variant="label">{item.word.term}</AppText>
                <AppText color={colors.muted}>{item.word.translation}</AppText>
              </View>
              <Badge
                tone={
                  item.status === "known"
                    ? "green"
                    : item.status === "review"
                      ? "orange"
                      : "muted"
                }
              >
                {vocabularyStatusLabels[item.status]}
              </Badge>
            </View>
            <View style={{ gap: spacing.xs }}>
              {(["to-french", "from-french"] as const).map((direction) => {
                const result = item.directions[direction];
                return (
                  <AppText key={direction} variant="small" color={colors.muted}>
                    {directionLabel(language, direction)} :{" "}
                    {result.answered === 0
                      ? "pas encore testé"
                      : result.lastCorrect === false
                        ? "à revoir"
                        : `${result.streak} ${result.streak === 1 ? "réussite" : "réussites"} de suite`}
                  </AppText>
                );
              })}
            </View>
          </View>
        ))
      )}
    </View>
  );
}
export const vocabularyStyles = StyleSheet.create({
  section: { gap: spacing.xl },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing.md,
  },
  wordRow: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.lg,
    gap: spacing.md,
  },
});
