import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import {
  ActionCard,
  AppIcon,
  AppText,
  Badge,
  Card,
  PageHeading,
  useContentWidth,
} from "@/components/ui";
import { useTheme, radius, spacing } from "@/theme";
import { ChildShell, Loading, latestAttempt, useChildData } from "./shared";

export function SubjectGrid() {
  const { colors, subjectAccent } = useTheme();
  const data = useChildData();
  const router = useRouter();
  const width = useContentWidth();
  const columns = width >= 1100 ? 4 : width >= 650 ? 3 : 2;
  const gap = spacing.lg;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap }}>
      {data.subjects.map((subject) => {
        const count = data.publishedCourses.filter(
          (course) => course.subjectId === subject.id,
        ).length;
        const todo = data.publishedSeries.filter(
          (series) =>
            series.subjectId === subject.id &&
            !latestAttempt(data.attempts, series.id)?.completedAt,
        ).length;
        const lists = data.vocabularyLists.filter(
          (list) => list.language === subject.id && list.status === "published",
        ).length;
        const accent = subjectAccent(subject.color);
        return (
          <ActionCard
            key={subject.id}
            testID={`subject-card-${subject.id}`}
            accessibilityLabel={`Ouvrir ${subject.title}`}
            onPress={() => router.push(`/student/subject/${subject.id}`)}
            style={[
              styles.subject,
              { width: Math.max(120, (width - (columns - 1) * gap) / columns) },
            ]}
          >
            <View style={styles.top}>
              <View style={[styles.icon, { backgroundColor: accent + "14" }]}>
                <AppIcon name={subject.icon} color={accent} size={25} />
              </View>
              <AppIcon name="chevron-right" size={18} color={colors.muted} />
            </View>
            <View style={{ gap: spacing.xs, flex: 1 }}>
              <AppText variant="label">{subject.title}</AppText>
              <AppText variant="small" color={colors.muted}>
                {[
                  count ? `${count} cours` : "",
                  lists
                    ? `${lists} ${lists === 1 ? "liste de vocabulaire" : "listes de vocabulaire"}`
                    : "",
                ]
                  .filter(Boolean)
                  .join(" · ") || "À découvrir"}
              </AppText>
            </View>
            {todo > 0 && <Badge>{todo} à faire</Badge>}
          </ActionCard>
        );
      })}
    </View>
  );
}

export function StudentSubjectsScreen() {
  const { colors } = useTheme();
  const data = useChildData();
  return (
    <ChildShell active="courses">
      <PageHeading
        title="Mes matières"
        description="Choisis une matière pour retrouver ses cours et ses exercices."
      />
      {!data.isReady ? <Loading /> : <SubjectGrid />}
      <Card inset>
        <AppText color={colors.muted}>
          Retrouve les listes de vocabulaire dans les matières Anglais, Espagnol
          et Latin. Les verbes et les temps d’anglais restent dans la matière
          Anglais.
        </AppText>
      </Card>
    </ChildShell>
  );
}
const styles = StyleSheet.create({
  subject: {
    minHeight: 176,
    padding: spacing.lg,
    borderRadius: radius.md,
    gap: spacing.md,
    boxShadow: "none",
  },
  top: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
});
