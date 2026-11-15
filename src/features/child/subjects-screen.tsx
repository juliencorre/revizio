import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import {
  AppIcon,
  AppText,
  Card,
  PageHeading,
  useContentWidth,
} from "@/components/ui";
import { colors } from "@/theme";
import { ChildShell, Loading, latestAttempt, useChildData } from "./shared";

export function SubjectGrid() {
  const data = useChildData();
  const router = useRouter();
  const width = useContentWidth();
  const columns = width >= 1000 ? 5 : width >= 650 ? 3 : 2;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14 }}>
      {data.subjects.map((subject) => {
        const count = data.publishedCourses.filter(
          (course) => course.subjectId === subject.id,
        ).length;
        const todo = data.publishedSeries.filter(
          (series) =>
            series.subjectId === subject.id &&
            !latestAttempt(data.attempts, series.id)?.completedAt,
        ).length;
        return (
          <Pressable
            key={subject.id}
            testID={`subject-card-${subject.id}`}
            accessibilityRole="button"
            accessibilityLabel={`Ouvrir ${subject.title}`}
            onPress={() => router.push(`/student/subject/${subject.id}`)}
            style={({ pressed }) => ({
              width: Math.max(120, (width - (columns - 1) * 14) / columns),
              minHeight: 142,
              borderRadius: 18,
              padding: 18,
              backgroundColor: subject.color + "16",
              borderWidth: 1,
              borderColor: subject.color + "30",
              gap: 16,
              opacity: pressed ? 0.75 : 1,
            })}
          >
            <AppIcon name={subject.icon} color={subject.color} size={30} />
            <View style={{ gap: 6 }}>
              <AppText variant="label">{subject.title}</AppText>
              <AppText variant="small" color={colors.muted}>
                {count ? `${count} cours` : "À découvrir"}
                {todo ? ` · ${todo} à faire` : ""}
              </AppText>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

export function StudentSubjectsScreen() {
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
          Les cours, le vocabulaire et les verbes d’anglais sont réunis dans la
          matière Anglais.
        </AppText>
      </Card>
    </ChildShell>
  );
}
