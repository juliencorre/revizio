import { useMemo } from "react";
import { View } from "react-native";
import { AppText, Card } from "@/components/ui";
import type { VocabularySession } from "@/domain/model";
import { vocabularyActivity } from "@/domain/study-overview";
import { plural } from "@/domain/format";
import { spacing, useTheme } from "@/theme";

export function VocabularyActivityCard({
  sessions,
}: {
  sessions: VocabularySession[];
}) {
  const { colors } = useTheme();
  const activity = useMemo(() => vocabularyActivity(sessions), [sessions]);
  if (!activity.length) return null;
  return (
    <Card style={{ gap: spacing.md }} testID="vocabulary-activity">
      <AppText variant="heading">Vocabulaire travaillé</AppText>
      {activity.map((item) => (
        <View key={item.language} style={{ gap: spacing.xs }}>
          <AppText variant="label">
            {item.label} ·{" "}
            {plural(item.words, "mot travaillé", "mots travaillés")}
          </AppText>
          <AppText variant="small" color={colors.muted}>
            {plural(item.completed, "séance terminée", "séances terminées")}
            {item.pending
              ? ` · ${plural(item.pending, "séance en cours", "séances en cours")}`
              : ""}
          </AppText>
        </View>
      ))}
    </Card>
  );
}
