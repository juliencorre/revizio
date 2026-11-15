import React from "react";
import { View } from "react-native";
import Svg, { Defs, LinearGradient, Stop, Path, Rect } from "react-native-svg";
import { useRouter } from "expo-router";
import {
  AppIcon,
  AppText,
  Button,
  Card,
  useWindowClass,
} from "@/components/ui";
import { colors } from "@/theme";
import { useChildData, ChildShell, Loading } from "./shared";
import { SubjectGrid } from "./subjects-screen";
import { nextStudySession } from "@/domain/study-overview";
import type { Href } from "expo-router";

/** Decorative landscape only on home. Study and exercise pages stay neutral. */
function MountainHeader({ name, grade }: { name: string; grade: string }) {
  const compact = useWindowClass() === "compact";
  return (
    <View
      style={{
        height: compact ? 132 : 160,
        borderRadius: 26,
        overflow: "hidden",
        backgroundColor: "#DDE6FF",
        justifyContent: "space-between",
        padding: compact ? 20 : 28,
      }}
    >
      <Svg
        viewBox="0 0 1100 200"
        preserveAspectRatio="xMidYMid slice"
        style={{ position: "absolute", top: 0, right: 0, left: 0, bottom: 0 }}
      >
        <Defs>
          <LinearGradient id="sky" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#DCE5FF" />
            <Stop offset="0.68" stopColor="#F8E5EB" />
            <Stop offset="1" stopColor="#C7D9FA" />
          </LinearGradient>
          <LinearGradient id="veil" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#F0F3FF" stopOpacity="0.98" />
            <Stop offset="0.62" stopColor="#F0F3FF" stopOpacity="0.35" />
            <Stop offset="1" stopColor="#F0F3FF" stopOpacity="0" />
          </LinearGradient>
        </Defs>
        <Rect width="1100" height="200" fill="url(#sky)" />
        <Path
          d="M0 145 L85 100 L125 119 L230 60 L280 92 L360 132 L455 63 L530 108 L600 147 L710 91 L750 120 L900 37 L1040 125 L1100 100 L1100 200 L0 200 Z"
          fill="#A5B8E3"
        />
        <Path
          d="M0 165 L125 120 L185 139 L270 98 L390 158 L540 126 L665 159 L794 91 L905 143 L995 100 L1100 156 L1100 200 L0 200 Z"
          fill="#7898D2"
        />
        <Path
          d="M215 72 L230 60 L248 75 L238 72 L231 82 L224 72 Z M883 53 L900 37 L923 59 L908 55 L900 66 L892 57 Z M449 71 L455 63 L465 76 L455 71 Z"
          fill="#FFFFFF"
          opacity="0.95"
        />
        <Path
          d="M0 175 Q200 155 400 184 T800 171 T1100 182 L1100 200 L0 200 Z"
          fill="#4D71AF"
          opacity="0.45"
        />
        <Rect width="1100" height="200" fill="url(#veil)" />
      </Svg>
      <View style={{ gap: 4 }}>
        <AppText
          variant="title"
          style={{ fontSize: compact ? 27 : 38, lineHeight: compact ? 35 : 46 }}
        >
          Bonjour {name} 👋
        </AppText>
        <AppText color="#455176" style={{ fontSize: compact ? 15 : 18 }}>
          Prêt à apprendre aujourd’hui ?
        </AppText>
      </View>
      <View
        style={{
          alignSelf: "flex-start",
          backgroundColor: "rgba(255,255,255,0.85)",
          borderRadius: 100,
          paddingHorizontal: 15,
          paddingVertical: 8,
        }}
      >
        <AppText
          variant="small"
          color={colors.primaryDark}
          style={{ fontWeight: "700" }}
        >
          {grade} · Mon espace de révision
        </AppText>
      </View>
    </View>
  );
}

export function StudentDashboard() {
  const router = useRouter();
  const data = useChildData();
  const compact = useWindowClass() === "compact";
  const next = nextStudySession({ ...data, version: 1 });
  const subject = data.subjects.find(
    (subject) => subject.id === next?.subjectId,
  );
  const completed = data.attempts.filter((attempt) => attempt.completedAt);
  const answers = completed.flatMap((attempt) => attempt.answers);
  const correct = answers.filter((answer) => answer.isCorrect).length;
  return (
    <ChildShell>
      <View testID="student-home" style={{ gap: compact ? 18 : 24 }}>
        <MountainHeader name={data.childName} grade={data.childGrade} />
        {!data.isReady ? (
          <Loading />
        ) : (
          <>
            <Card
              testID="next-study-session"
              style={{ gap: 14, backgroundColor: colors.primaryLight }}
            >
              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <AppIcon name={next?.resume ? "play" : "calendar"} />
                <AppText variant="heading">Ma prochaine séance</AppText>
                {next && (
                  <AppText variant="small" color={colors.primaryDark}>
                    {next.estimated ? "Environ " : ""}
                    {next.minutes} min · {subject?.title}
                  </AppText>
                )}
              </View>
              <AppText variant="title" style={{ fontSize: compact ? 23 : 28 }}>
                {next?.title ?? "Tu es à jour !"}
              </AppText>
              <AppText color={colors.muted}>
                {next?.reason ??
                  "Tu peux choisir une matière pour relire un cours ou refaire un exercice."}
              </AppText>
              <Button
                testID="start-next-session"
                icon={next ? "play" : "book"}
                onPress={() =>
                  router.push(
                    (next?.destination ?? "/student/subjects") as Href,
                  )
                }
              >
                {next
                  ? next.resume
                    ? "Reprendre ma séance"
                    : "Commencer ma séance"
                  : "Explorer mes matières"}
              </Button>
            </Card>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
              <Button
                variant="secondary"
                icon="calendar"
                onPress={() => router.push("/student/plans")}
              >
                Mes contrôles
              </Button>
              <Button
                variant="ghost"
                icon="chart"
                onPress={() => router.push("/student/progress")}
              >
                Mes progrès
                {answers.length
                  ? ` · ${correct} bonnes réponses sur ${answers.length}`
                  : ""}
              </Button>
            </View>
            <View style={{ gap: 16 }}>
              <AppText variant="heading">Mes matières</AppText>
              <SubjectGrid />
            </View>
          </>
        )}
      </View>
    </ChildShell>
  );
}
