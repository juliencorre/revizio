import { View } from "react-native";
import { useRouter } from "expo-router";
import {
  AppIcon,
  AppText,
  Badge,
  Button,
  Card,
  PageHeading,
  useWindowClass,
} from "@/components/ui";
import { plural } from "@/domain/format";
import { createThemedStyles, useTheme, spacing } from "@/theme";
import { useLearning } from "@/state/learning-store";
import { dateOnly, stepIsLate } from "@/domain/planning";
import { learningOverview, preparationStatus } from "@/domain/study-overview";
import { LoadingParent, Notice, ParentLayout } from "./shared";
import { usePreparationJobs } from "./preparations";
import { ParentSubjectGrid } from "./subjects";

export function ParentDashboard() {
  const { colors } = useTheme();
  const styles = useStyles();
  const router = useRouter();
  const data = useLearning();
  const compact = useWindowClass() === "compact";
  const jobs = usePreparationJobs(
    data.isDemo,
    data.activeProfileId,
    data.serverAvailable,
  );
  if (!data.isReady) return <LoadingParent />;
  const drafts = data.courses.filter((course) => course.status === "draft");
  const draftSeries = data.series.filter((series) => series.status === "draft");
  const overview = learningOverview({ ...data, version: 1 });
  const upcoming = data.plans
    .filter(
      (plan) => plan.status === "published" && plan.examDate >= dateOnly(),
    )
    .sort((a, b) => a.examDate.localeCompare(b.examDate))
    .slice(0, 3);
  const activeJobs = jobs.jobs.filter(
    (job) => job.status === "queued" || job.status === "running",
  );
  const failedJobs = jobs.jobs.filter((job) => job.status === "failed");
  return (
    <ParentLayout active="dashboard">
      <View testID="parent-dashboard" style={{ gap: spacing.xl }}>
        <PageHeading
          title="Choisir une matière"
          description={`Quelle matière souhaitez-vous préparer pour ${data.childName} ?`}
        />
        <ParentSubjectGrid preview />
        <Button
          icon="book"
          variant="ghost"
          style={{ alignSelf: "flex-start" }}
          onPress={() => router.push("/parent/subjects")}
        >
          Voir toutes les matières
        </Button>
        <Card style={{ gap: spacing.lg }}>
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 12,
              alignItems: "center",
            }}
          >
            <AppIcon name="pencil" />
            <AppText variant="heading" style={{ flex: 1 }}>
              Reprendre un brouillon
            </AppText>
            <Badge tone="orange">{drafts.length + draftSeries.length}</Badge>
          </View>
          <AppText color={colors.muted}>
            Les brouillons restent privés. Relisez les fiches, les questions et
            leurs corrections avant de les publier.
          </AppText>
          {drafts.slice(0, 3).map((course) => (
            <View key={course.id} style={styles.draftRow}>
              <View style={styles.draftTitle}>
                <AppText variant="label">{course.title}</AppText>
                <AppText variant="small" color={colors.muted}>
                  {
                    data.subjects.find((s) => s.id === course.subjectId)
                      ?.shortLabel
                  }{" "}
                  · Fiche · {preparationStatus(course)}
                </AppText>
              </View>
              <Button
                testID={`review-course-${course.id}`}
                variant="secondary"
                icon="file"
                accessibilityLabel={`Vérifier la fiche ${course.title}`}
                onPress={() => router.push(`/parent/review/${course.id}`)}
              >
                Reprendre la fiche
              </Button>
            </View>
          ))}
          {draftSeries
            .slice(0, Math.max(0, 3 - drafts.length))
            .map((series) => (
              <View key={series.id} style={styles.draftRow}>
                <View style={styles.draftTitle}>
                  <AppText variant="label">{series.title}</AppText>
                  <AppText variant="small" color={colors.muted}>
                    {
                      data.subjects.find((s) => s.id === series.subjectId)
                        ?.shortLabel
                    }{" "}
                    · Exercices · {preparationStatus(series)}
                  </AppText>
                </View>
                <Button
                  variant="secondary"
                  icon="pencil"
                  onPress={() =>
                    router.push({
                      pathname: "/parent/exercises",
                      params: {
                        draftId: series.id,
                        subjectId: series.subjectId,
                      },
                    })
                  }
                >
                  Reprendre les exercices
                </Button>
              </View>
            ))}
          {!drafts.length && !draftSeries.length && (
            <AppText>
              Aucun brouillon en attente. Vos contenus publiés restent
              accessibles dans la bibliothèque.
            </AppText>
          )}
          <Button
            variant="ghost"
            icon="arrow-right"
            onPress={() => router.push("/parent/library?status=review")}
          >
            Voir tous les contenus à vérifier
          </Button>
        </Card>
        <Button
          variant="ghost"
          icon="book"
          onPress={() => router.push("/parent/library")}
        >
          Bibliothèque
        </Button>
        <View
          style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.lg }}
        >
          <Card
            style={{
              flexGrow: 1,
              flexBasis: compact ? "100%" : 300,
              minWidth: 0,
              gap: spacing.lg,
            }}
          >
            <AppText variant="heading">Le suivi de {data.childName}</AppText>
            <AppText>
              {plural(
                overview.completed.length,
                "séance terminée",
                "séances terminées",
              )}
            </AppText>
            <AppText color={colors.muted}>
              {overview.concepts.length
                ? `${plural(overview.concepts.length, "notion")} à revoir à partir des derniers exercices.`
                : "Les réussites et les notions à revoir sont réunies dans le suivi."}
            </AppText>
            <Button
              icon="chart"
              variant="secondary"
              onPress={() => router.push("/parent/progress")}
            >
              Consulter les résultats et les erreurs
            </Button>
          </Card>
          <Card
            style={{
              flexGrow: 1,
              flexBasis: compact ? "100%" : 300,
              minWidth: 0,
              gap: spacing.lg,
            }}
          >
            <AppText variant="heading">Prochains contrôles</AppText>
            {upcoming.length ? (
              upcoming.map((plan) => (
                <View key={plan.id} style={{ gap: 8 }}>
                  <AppText variant="label">{plan.title}</AppText>
                  <AppText variant="small" color={colors.muted}>
                    {new Date(plan.examDate + "T12:00:00").toLocaleDateString(
                      "fr-FR",
                      { day: "numeric", month: "long" },
                    )}{" "}
                    ·{" "}
                    {plural(
                      plan.steps.filter((step) => step.completedAt).length,
                      "séance",
                    )}{" "}
                    sur {plan.steps.length}
                    {plan.steps.some((step) => stepIsLate(step))
                      ? " · À reprogrammer"
                      : ""}
                  </AppText>
                  <Button
                    variant="ghost"
                    icon="calendar"
                    accessibilityLabel={`Voir le plan ${plan.title}`}
                    onPress={() =>
                      router.push({
                        pathname: "/parent/controls",
                        params: { id: plan.id },
                      })
                    }
                  >
                    Voir le plan de révision
                  </Button>
                </View>
              ))
            ) : (
              <AppText color={colors.muted}>
                Aucun contrôle à venir n’a encore été partagé.
              </AppText>
            )}
            <Button
              variant="secondary"
              icon="plus"
              onPress={() => router.push("/parent/controls")}
            >
              Préparer un contrôle
            </Button>
          </Card>
        </View>
        <Card style={{ gap: 14 }}>
          <AppText variant="heading">Préparations IA</AppText>
          {data.isDemo ? (
            <AppText color={colors.muted}>
              Connectez votre espace familial pour lancer de vraies préparations
              à partir de vos cours.
            </AppText>
          ) : (
            <>
              <AppText color={colors.muted}>
                {activeJobs.length} en cours · {failedJobs.length} à relancer
              </AppText>
              {jobs.error && <Notice error>{jobs.error}</Notice>}
            </>
          )}
          <Button
            variant="ghost"
            icon="refresh"
            onPress={() => router.push("/parent/preparations")}
          >
            Suivre les préparations IA
          </Button>
        </Card>
      </View>
    </ParentLayout>
  );
}
const useStyles = createThemedStyles(({ colors }) => ({
  draftRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.lg,
  },
  draftTitle: { flexGrow: 1, flexShrink: 1, flexBasis: 240, gap: spacing.xs },
}));
