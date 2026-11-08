import React, { type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { useRouter } from "expo-router";
import {
  AppIcon,
  AppShell,
  AppText,
  Badge,
  Button,
  Card,
  EmptyState,
  type NavigationItem,
} from "@/components/ui";
import { colors } from "@/theme";
import { useLearning } from "@/state/learning-store";
import type { Attempt, Course, ExerciseSeries, Subject } from "@/domain/model";
export function useChildData() {
  const data = useLearning();
  const publishedCourses = data.courses.filter((c) => c.status === "published");
  const ids = new Set(publishedCourses.map((c) => c.id));
  const publishedSeries = data.series.filter(
    (s) =>
      s.status === "published" &&
      s.questions.length > 0 &&
      s.courseIds.every((id) => ids.has(id)),
  );
  return { ...data, publishedCourses, publishedSeries };
}
export function ChildShell({
  children,
  active = "home",
  subject,
}: {
  children: ReactNode;
  active?: "home" | "courses" | "exercises" | "progress";
  subject?: Subject;
}) {
  const navigation: NavigationItem[] = [
    {
      label: "Mes matières",
      href: "/student",
      icon: "home",
      active: active === "home",
    },
    ...(subject
      ? [
          {
            label: "Mes cours",
            href: `/student/subject/${subject.id}` as const,
            icon: "book" as const,
            active: active === "courses",
          },
        ]
      : []),
    {
      label: "Mes exercices",
      href: subject
        ? `/student/exercises?subjectId=${subject.id}`
        : "/student/exercises",
      icon: "pencil",
      active: active === "exercises",
    },
    {
      label: "Mes progrès",
      href: "/student/progress",
      icon: "chart",
      active: active === "progress",
    },
    { label: "Mes contrôles", href: "/student/plans", icon: "calendar" },
    { label: "Mon anglais", href: "/student/english", icon: "languages" },
  ];
  return (
    <AppShell role="child" navigation={navigation} subject={subject}>
      {children}
    </AppShell>
  );
}
export function Loading() {
  return (
    <Card style={{ alignItems: "center", gap: 14, paddingVertical: 48 }}>
      <ActivityIndicator color={colors.primary} size="large" />
      <AppText color={colors.muted}>On retrouve tes cours…</AppText>
    </Card>
  );
}
export function Unavailable({ kind = "cours" }: { kind?: string }) {
  const router = useRouter();
  return (
    <EmptyState
      icon="book"
      title={`Ce ${kind} n’est pas disponible`}
      description="Il a peut-être été retiré ou n’est pas encore prêt. Retrouve les contenus préparés pour toi dans ton espace."
    >
      <Button icon="home" onPress={() => router.replace("/student")}>
        Mes matières
      </Button>
    </EmptyState>
  );
}
export function useContentWidth() {
  const { width } = useWindowDimensions();
  return Math.max(
    240,
    Math.min(1360, width >= 1000 ? width - 336 : width - 40),
  );
}
export function subjectFor(subjects: Subject[], id: string) {
  return subjects.find((s) => s.id === id);
}
export function formatDate(date: string) {
  const d = new Date(
    /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T12:00:00` : date,
  );
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
}
export function latestAttempt(attempts: Attempt[], seriesId: string) {
  return attempts
    .filter((a) => a.seriesId === seriesId)
    .reverse()
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
}
export function levelLabel(level: ExerciseSeries["level"]) {
  return {
    discovery: "Découverte",
    practice: "Entraînement",
    challenge: "Défi",
  }[level];
}
export function plural(
  count: number,
  singular: string,
  multiple = `${singular}s`,
) {
  return `${count} ${count === 1 ? singular : multiple}`;
}
export function CourseCard({
  course,
  series,
}: {
  course: Course;
  series: ExerciseSeries[];
}) {
  const router = useRouter();
  return (
    <View testID={`course-card-${course.id}`} style={{ flex: 1 }}>
      <Card style={{ gap: 16, flex: 1 }}>
        <View style={styles.row}>
          <View
            style={[styles.smallIcon, { backgroundColor: colors.primaryLight }]}
          >
            <AppIcon name="file" />
          </View>
          <Badge tone="green">Fiche vérifiée</Badge>
        </View>
        <AppText variant="heading">{course.title}</AppText>
        <AppText color={colors.muted}>{course.description}</AppText>
        <View style={{ flex: 1 }} />
        <View style={styles.wrap}>
          <Button
            icon="book"
            onPress={() => router.push(`/student/course/${course.id}`)}
          >
            Lire la fiche
          </Button>
          {series.length > 0 && (
            <Badge tone="muted">{plural(series.length, "série")}</Badge>
          )}
        </View>
      </Card>
    </View>
  );
}
export function SeriesCard({
  series,
  attempts,
  subjects,
}: {
  series: ExerciseSeries;
  attempts: Attempt[];
  subjects: Subject[];
}) {
  const router = useRouter();
  const last = latestAttempt(attempts, series.id);
  const subject = subjectFor(subjects, series.subjectId);
  const completed = !!last?.completedAt;
  return (
    <Card style={{ gap: 15 }}>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <AppText
            variant="small"
            color={subject?.color ?? colors.primary}
            style={{ fontWeight: "700" }}
          >
            {subject?.title ?? "Mes exercices"}
          </AppText>
        </View>
        <Badge tone={completed ? "green" : last ? "orange" : "muted"}>
          {completed
            ? "Terminée"
            : last
              ? "À reprendre"
              : levelLabel(series.level)}
        </Badge>
      </View>
      <AppText variant="heading">{series.title}</AppText>
      <AppText color={colors.muted}>
        {plural(series.questions.length, "question")}
        {series.dueDate ? ` · Pour le ${formatDate(series.dueDate)}` : ""}
      </AppText>
      {last && (
        <AppText
          variant="small"
          color={completed ? colors.green : colors.muted}
        >
          {completed
            ? `${last.answers.filter((a) => a.isCorrect).length} bonnes réponses sur ${last.questions.length} au dernier essai`
            : `${last.answers.length} réponse${last.answers.length > 1 ? "s" : ""} enregistrée${last.answers.length > 1 ? "s" : ""} sur ${last.questions.length}`}
        </AppText>
      )}
      <Button
        icon={completed ? "chart" : "play"}
        variant={completed ? "secondary" : "primary"}
        onPress={() => router.push(`/student/exercise/${series.id}`)}
      >
        {completed ? "Voir mon bilan" : last ? "Reprendre" : "Commencer"}
      </Button>
    </Card>
  );
}
export function Tappable({
  children,
  onPress,
  label,
  style,
  testID,
}: {
  children: ReactNode;
  onPress: () => void;
  label: string;
  style?: object;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [{ opacity: pressed ? 0.82 : 1 }, style]}
    >
      {children}
    </Pressable>
  );
}
export const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 18 },
  smallIcon: {
    width: 44,
    height: 44,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
    flexWrap: "wrap",
  },
  stack: { gap: 18 },
});
