import React from "react";
import { Pressable, View } from "react-native";
import Svg, { Defs, LinearGradient, Stop, Path, Rect } from "react-native-svg";
import { useRouter } from "expo-router";
import { AppIcon, AppText, Button, Card, ProgressBar, useContentWidth, useWindowClass } from "@/components/ui";
import { colors } from "@/theme";
import { useChildData, ChildShell, Loading, latestAttempt, plural } from "./shared";
import { NextControl } from "./next-control";

/** Decorative landscape only on home. Study and exercise pages stay neutral. */
function MountainHeader({ name, grade }: { name: string; grade: string }) {
  const compact = useWindowClass() === "compact";
  return (
    <View style={{ height: compact ? 176 : 194, borderRadius: 26, overflow: "hidden", backgroundColor: "#DDE6FF", justifyContent: "space-between", padding: compact ? 20 : 28 }}>
      <Svg viewBox="0 0 1100 200" preserveAspectRatio="xMidYMid slice" style={{ position: "absolute", top: 0, right: 0, left: 0, bottom: 0 }}>
        <Defs>
          <LinearGradient id="sky" x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor="#DCE5FF"/><Stop offset="0.68" stopColor="#F8E5EB"/><Stop offset="1" stopColor="#C7D9FA"/></LinearGradient>
          <LinearGradient id="veil" x1="0" y1="0" x2="1" y2="0"><Stop offset="0" stopColor="#F0F3FF" stopOpacity="0.98"/><Stop offset="0.62" stopColor="#F0F3FF" stopOpacity="0.35"/><Stop offset="1" stopColor="#F0F3FF" stopOpacity="0"/></LinearGradient>
        </Defs>
        <Rect width="1100" height="200" fill="url(#sky)"/>
        <Path d="M0 145 L85 100 L125 119 L230 60 L280 92 L360 132 L455 63 L530 108 L600 147 L710 91 L750 120 L900 37 L1040 125 L1100 100 L1100 200 L0 200 Z" fill="#A5B8E3"/>
        <Path d="M0 165 L125 120 L185 139 L270 98 L390 158 L540 126 L665 159 L794 91 L905 143 L995 100 L1100 156 L1100 200 L0 200 Z" fill="#7898D2"/>
        <Path d="M215 72 L230 60 L248 75 L238 72 L231 82 L224 72 Z M883 53 L900 37 L923 59 L908 55 L900 66 L892 57 Z M449 71 L455 63 L465 76 L455 71 Z" fill="#FFFFFF" opacity="0.95"/>
        <Path d="M0 175 Q200 155 400 184 T800 171 T1100 182 L1100 200 L0 200 Z" fill="#4D71AF" opacity="0.45"/>
        <Rect width="1100" height="200" fill="url(#veil)"/>
      </Svg>
      <View style={{ gap: 4 }}>
        <AppText variant="title" style={{ fontSize: compact ? 27 : 38, lineHeight: compact ? 35 : 46 }}>Bonjour {name} 👋</AppText>
        <AppText color="#455176" style={{ fontSize: compact ? 15 : 18 }}>Prêt à apprendre aujourd’hui ?</AppText>
      </View>
      <View style={{ alignSelf: "flex-start", backgroundColor: "rgba(255,255,255,0.85)", borderRadius: 100, paddingHorizontal: 15, paddingVertical: 8 }}>
        <AppText variant="small" color={colors.primaryDark} style={{ fontWeight: "700" }}>{grade} · Mon espace de révision</AppText>
      </View>
    </View>
  );
}

export function StudentDashboard() {
  const router = useRouter();
  const data = useChildData();
  const width = useContentWidth();
  const compact = useWindowClass() === "compact";
  const wide = width >= 860;
  const gap = compact ? 12 : 18;
  const columns = width >= 1100 ? 5 : width >= 730 ? 4 : width >= 460 ? 3 : 2;
  const subjectsWidth = wide ? (width - gap) * 0.56 : width;
  const subjectWidth = Math.max(106, (subjectsWidth - 48 - (columns - 1) * gap) / columns);
  const published = data.publishedCourses;
  const completed = data.attempts.filter(a => !!a.completedAt);
  const answers = completed.flatMap(a => a.answers);
  const correct = answers.filter(a => a.isCorrect).length;
  const success = answers.length ? Math.round(correct * 100 / answers.length) : 0;
  const nextSeries = [...data.publishedSeries]
    .sort((a, b) => {
      const aStarted = data.attempts.some(t => t.seriesId === a.id && !t.completedAt);
      const bStarted = data.attempts.some(t => t.seriesId === b.id && !t.completedAt);
      return Number(bStarted) - Number(aStarted) || (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999");
    })
    .find(s => !latestAttempt(data.attempts, s.id)?.completedAt);
  const nextAttempt = nextSeries ? latestAttempt(data.attempts, nextSeries.id) : undefined;
  const reviews = (data.spacedReviews ?? []).filter(r =>
    r.dueDate <= new Date().toLocaleDateString("en-CA") && published.some(c => c.id === r.courseId)
  );
  const recentCourse = published.find(c => data.reviewedCourseIds.includes(c.id)) ?? published[0];
  const recentSubject = recentCourse ? data.subjects.find(s => s.id === recentCourse.subjectId) : undefined;
  return (
    <ChildShell>
      <View testID="student-home" style={{ gap: compact ? 18 : 22 }}>
        <MountainHeader name={data.childName} grade={data.childGrade}/>
        {!data.isReady ? <Loading/> : <>
          <NextControl/>
          <View style={{ flexDirection: wide ? "row" : "column", gap }}>
            <Card style={{ flex: wide ? 1.4 : undefined, gap: 18 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 11 }}>
                <AppIcon name="book" size={25}/><AppText variant="heading">Mes matières</AppText>
              </View>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap }}>
                {data.subjects.map(subject => {
                  const count = published.filter(c => c.subjectId === subject.id).length;
                  const todo = data.publishedSeries.filter(s =>
                    s.subjectId === subject.id && !latestAttempt(data.attempts, s.id)?.completedAt
                  ).length;
                  const palette: Record<string, string> = {
                    "Français": "#EAE0FF",
                    "Mathématiques": "#DDEEFF",
                    "Maths": "#DDEEFF",
                    "Sciences": "#DDF4EF",
                    "Histoire-géographie": "#FFF0D7",
                    "Histoire-Géo": "#FFF0D7",
                    "Anglais": "#E8E9FF",
                  };
                  return (
                    <Pressable
                      key={subject.id}
                      testID={`subject-card-${subject.id}`}
                      accessibilityRole="button"
                      accessibilityLabel={`Ouvrir ${subject.title}`}
                      onPress={() => router.push(`/student/subject/${subject.id}`)}
                      style={{ width: subjectWidth, flexGrow: 1, minHeight: 138, backgroundColor: palette[subject.title] ?? "#EEF0FC", borderRadius: 18, padding: compact ? 13 : 16, justifyContent: "space-between", gap: 12 }}
                    >
                      <AppIcon name={subject.icon} color={colors.ink} size={compact ? 26 : 31}/>
                      <View style={{ gap: 4 }}>
                        <AppText style={{ fontWeight: "800", fontSize: compact ? 15 : 16, lineHeight: 21 }}>{subject.title}</AppText>
                        <AppText variant="small" color={colors.muted}>{count ? `${count} cours` : "À découvrir"}{todo ? ` · ${todo} à faire` : ""}</AppText>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
              <AppText variant="small" color={colors.muted}>{plural(published.length, "cours disponible", "cours disponibles")}</AppText>
            </Card>
            <Card style={{ flex: wide ? 1 : undefined, gap: 17 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 11 }}>
                <AppIcon name="check" size={25}/><AppText variant="heading">Ma mission du jour</AppText>
              </View>
              {reviews.length > 0 ? reviews.slice(0, 3).map((review, i) => {
                const course = published.find(c => c.id === review.courseId);
                if (!course) return null;
                return (
                  <Pressable key={review.courseId} accessibilityRole="button" accessibilityLabel={`Revoir ${course.title}`}
                    onPress={() => router.push(`/student/course/${review.courseId}`)}
                    style={{ backgroundColor: i === 0 ? colors.primaryLight : colors.background, padding: 14, borderRadius: 15, flexDirection: "row", gap: 12, alignItems: "center" }}>
                    <AppIcon name="refresh" size={20}/>
                    <AppText style={{ flex: 1, fontWeight: "600" }}>{course.title}</AppText>
                    <AppIcon name="arrow-right" size={18}/>
                  </Pressable>
                );
              }) : nextSeries ? <>
                <AppText color={colors.muted}>Une petite séance pour continuer tes progrès.</AppText>
                <AppText style={{ fontWeight: "800" }}>{nextSeries.title}</AppText>
                <Button icon="play" onPress={() => router.push(`/student/exercise/${nextSeries.id}`)}>
                  {nextAttempt ? "Reprendre mon exercice" : "Commencer la mission"}
                </Button>
              </> : <>
                <AppText color={colors.muted}>Tu es à jour ! Choisis une matière pour relire un cours.</AppText>
                <Button variant="secondary" icon="book" onPress={() => router.push("/student")}>Explorer mes cours</Button>
              </>}
            </Card>
          </View>
          <View style={{ flexDirection: wide ? "row" : "column", gap }}>
            <Card style={{ flex: 1, gap: 15 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 11 }}>
                <AppIcon name="chart" size={25}/><AppText variant="heading">Ma progression</AppText>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 20 }}>
                <View style={{ width: 92, height: 92, borderRadius: 46, borderWidth: 10, borderColor: answers.length ? colors.primary : colors.primaryLight, alignItems: "center", justifyContent: "center" }}>
                  <AppText style={{ fontSize: 26, fontWeight: "800" }}>{answers.length ? `${success}%` : "—"}</AppText>
                </View>
                <View style={{ flex: 1, gap: 9 }}>
                  <AppText color={colors.muted}>{answers.length ? `${correct} bonnes réponses sur ${answers.length}` : "Tes résultats apparaîtront après tes exercices."}</AppText>
                  <ProgressBar value={success}/>
                  <Button variant="ghost" icon="arrow-right" onPress={() => router.push("/student/progress")}>Voir mes progrès</Button>
                </View>
              </View>
            </Card>
            <Card style={{ flex: 1.2, gap: 15 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 11 }}>
                <AppIcon name="play" size={25}/><AppText variant="heading">Reprendre mon travail</AppText>
              </View>
              {recentCourse ? <View style={{ backgroundColor: colors.background, borderRadius: 18, padding: 16, gap: 12 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <View style={{ backgroundColor: colors.primaryLight, padding: 12, borderRadius: 13 }}>
                    <AppIcon name={recentSubject?.icon ?? "book"} size={26}/>
                  </View>
                  <View style={{ flex: 1, gap: 4 }}>
                    <AppText style={{ fontWeight: "800" }}>{recentCourse.title}</AppText>
                    <AppText variant="small" color={colors.muted}>{recentSubject?.title ?? "Cours"} · {data.childGrade}</AppText>
                  </View>
                </View>
                <Button icon="play" onPress={() => router.push(`/student/course/${recentCourse.id}`)}>Ouvrir le cours</Button>
              </View> : <>
                <AppText color={colors.muted}>Tes cours apparaîtront ici dès qu’ils seront disponibles.</AppText>
                <Button variant="secondary" icon="book" onPress={() => router.push("/student")}>Mes matières</Button>
              </>}
            </Card>
          </View>
        </>}
      </View>
    </ChildShell>
  );
}
