import React from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Defs, LinearGradient, Stop, Path, Rect } from "react-native-svg";
import { useRouter } from "expo-router";
import {
  AppIcon,
  AppText,
  ActionCard,
  Badge,
  Button,
  Card,
  useWindowClass,
  useContentWidth,
} from "@/components/ui";
import { useTheme, radius, spacing } from "@/theme";
import { useChildData, ChildShell, Loading } from "./shared";
import { SubjectGrid } from "./subjects-screen";
import { nextStudySession } from "@/domain/study-overview";
import type { Href } from "expo-router";

/** Decorative landscape only on home. Study and exercise pages stay neutral. */
function MountainHeader({ name, grade }: { name: string; grade: string }) {
  const { colors } = useTheme();
  const compact = useWindowClass() === "compact";
  return (
    <View
      style={{
        minHeight: compact ? 148 : 152,
        borderRadius: radius.lg,
        overflow: "hidden",
        backgroundColor: colors.welcome,
        justifyContent: "space-between",
        padding: compact ? spacing.xl : spacing.xxl,
        gap: spacing.lg,
      }}
    >
      {!compact && (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            bottom: 0,
            width: "65%",
          }}
        >
          <Svg
            width="100%"
            height="100%"
            accessible={false}
            viewBox="0 0 1100 200"
            preserveAspectRatio="none"
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              left: 0,
              bottom: 0,
            }}
          >
            <Defs>
              <LinearGradient id="sky" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor={colors.welcome} />
                <Stop offset="0.68" stopColor={colors.skyMid} />
                <Stop offset="1" stopColor={colors.skyEnd} />
              </LinearGradient>
              <LinearGradient id="veil" x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor={colors.welcome} />
                <Stop
                  offset="0.62"
                  stopColor={colors.welcome}
                  stopOpacity="0.35"
                />
                <Stop offset="1" stopColor={colors.welcome} stopOpacity="0" />
              </LinearGradient>
            </Defs>
            <Rect width="1100" height="200" fill="url(#sky)" />
            <Path
              d="M0 145 L85 100 L125 119 L230 60 L280 92 L360 132 L455 63 L530 108 L600 147 L710 91 L750 120 L900 37 L1040 125 L1100 100 L1100 200 L0 200 Z"
              fill={colors.ridgeFar}
            />
            <Path
              d="M0 165 L125 120 L185 139 L270 98 L390 158 L540 126 L665 159 L794 91 L905 143 L995 100 L1100 156 L1100 200 L0 200 Z"
              fill={colors.ridgeNear}
            />
            <Path
              d="M215 72 L230 60 L248 75 L238 72 L231 82 L224 72 Z M883 53 L900 37 L923 59 L908 55 L900 66 L892 57 Z M449 71 L455 63 L465 76 L455 71 Z"
              fill={colors.snow}
              opacity="0.95"
            />
            <Path
              d="M0 175 Q200 155 400 184 T800 171 T1100 182 L1100 200 L0 200 Z"
              fill={colors.foothills}
              opacity="0.45"
            />
            <Rect width="1100" height="200" fill="url(#veil)" />
          </Svg>
        </View>
      )}
      <View style={{ gap: 4 }}>
        <AppText
          variant="title"
          style={{ fontSize: compact ? 27 : 38, lineHeight: compact ? 35 : 46 }}
        >
          Bonjour {name} 👋
        </AppText>
        <AppText color={colors.welcomeInk}>
          Prêt à apprendre aujourd’hui ?
        </AppText>
      </View>
      <View
        style={{
          alignSelf: "flex-start",
        }}
      >
        <AppText
          variant="small"
          color={colors.primaryDark}
          style={{ fontWeight: "700" }}
        >
          {grade} · À ton rythme
        </AppText>
      </View>
    </View>
  );
}

export function StudentDashboard() {
  const { colors } = useTheme();
  const router = useRouter();
  const data = useChildData();
  const compact = useWindowClass() === "compact";
  const wide = useContentWidth() >= 860;
  const next = nextStudySession({ ...data, version: 1 });
  const subject = data.subjects.find(
    (subject) => subject.id === next?.subjectId,
  );
  const completed = data.attempts.filter((attempt) => attempt.completedAt);
  const answers = completed.flatMap((attempt) => attempt.answers);
  const correct = answers.filter((answer) => answer.isCorrect).length;
  return (
    <ChildShell>
      <View testID="student-home" style={{ gap: spacing.xl }}>
        <MountainHeader name={data.childName} grade={data.childGrade} />
        {!data.isReady ? (
          <Loading />
        ) : (
          <>
            <View
              style={{
                flexDirection: wide ? "row" : "column",
                gap: spacing.lg,
              }}
            >
              <Card
                testID="next-study-session"
                style={{
                  gap: spacing.lg,
                  flex: wide ? 1 : undefined,
                  minWidth: 0,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    alignItems: "center",
                    gap: spacing.sm,
                  }}
                >
                  <AppIcon
                    name={next?.resume ? "play" : "calendar"}
                    size={20}
                  />
                  <AppText variant="label" color={colors.primaryDark}>
                    Ma prochaine séance
                  </AppText>
                </View>
                <View style={{ gap: spacing.sm }}>
                  <AppText
                    variant="title"
                    style={{
                      fontSize: compact ? 24 : 28,
                      lineHeight: compact ? 32 : 38,
                    }}
                  >
                    {next?.title ?? "Tu es à jour !"}
                  </AppText>
                  {next && (
                    <View style={styles.sessionMeta}>
                      {subject && <Badge>{subject.title}</Badge>}
                      <View style={styles.duration}>
                        <AppIcon name="clock" size={16} color={colors.muted} />
                        <AppText variant="small" color={colors.muted}>
                          {next.estimated ? "Environ " : ""}
                          {next.minutes} min
                        </AppText>
                      </View>
                    </View>
                  )}
                </View>
                <AppText color={colors.muted}>
                  {next?.reason ??
                    "Tu peux choisir une matière pour relire un cours ou refaire un exercice."}
                </AppText>
                <Button
                  testID="start-next-session"
                  icon={next ? "play" : "book"}
                  style={compact ? { alignSelf: "stretch" } : undefined}
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
              <View
                style={{
                  width: wide ? 240 : undefined,
                  gap: spacing.md,
                  flexDirection: wide || compact ? "column" : "row",
                }}
              >
                <ActionCard
                  accessibilityLabel="Mes contrôles"
                  style={styles.shortcut}
                  onPress={() => router.push("/student/plans")}
                >
                  <AppIcon name="calendar" color={colors.orange} />
                  <View style={styles.shortcutText}>
                    <AppText variant="label">Mes contrôles</AppText>
                    <AppText variant="small" color={colors.muted}>
                      Préparer les prochains
                    </AppText>
                  </View>
                  <AppIcon
                    name="chevron-right"
                    size={18}
                    color={colors.muted}
                  />
                </ActionCard>
                <ActionCard
                  accessibilityLabel="Mes progrès"
                  style={styles.shortcut}
                  onPress={() => router.push("/student/progress")}
                >
                  <AppIcon name="chart" color={colors.green} />
                  <View style={styles.shortcutText}>
                    <AppText variant="label">Mes progrès</AppText>
                    <AppText variant="small" color={colors.muted}>
                      {answers.length
                        ? `${correct} bonnes réponses sur ${answers.length}`
                        : "Chaque séance compte"}
                    </AppText>
                  </View>
                  <AppIcon
                    name="chevron-right"
                    size={18}
                    color={colors.muted}
                  />
                </ActionCard>
              </View>
            </View>
            <View style={{ gap: spacing.lg }}>
              <AppText variant="heading">Mes matières</AppText>
              <SubjectGrid />
            </View>
          </>
        )}
      </View>
    </ChildShell>
  );
}
const styles = StyleSheet.create({
  sessionMeta: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing.md,
  },
  duration: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  shortcut: {
    flexGrow: 1,
    flexBasis: 0,
    minWidth: 0,
    minHeight: 88,
    padding: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    boxShadow: "none",
  },
  shortcutText: { flex: 1, minWidth: 0, gap: spacing.xs },
});
