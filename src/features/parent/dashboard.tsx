import { View } from "react-native";
import { useRouter, type Href } from "expo-router";
import {
  AppIcon,
  AppText,
  Button,
  Card,
  PageHeading,
  useWindowClass,
} from "@/components/ui";
import { plural } from "@/domain/format";
import { useTheme, spacing } from "@/theme";
import { useLearning } from "@/state/learning-store";
import { dateOnly, stepIsLate } from "@/domain/planning";
import { learningOverview } from "@/domain/study-overview";
import { LoadingParent, Notice, ParentLayout } from "./shared";
import { usePreparationJobs } from "./preparations";
import { ParentSubjectGrid } from "./subjects";

function resumableDraft(
  data: ReturnType<typeof useLearning>,
): { title: string; label: string; href: Href; testID?: string } | undefined {
  const course = data.courses
    .filter((item) => item.status === "draft")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  if (course)
    return {
      title: course.title,
      label: "Reprendre la fiche",
      href: { pathname: "/parent/review/[id]", params: { id: course.id } },
      testID: "review-course-" + course.id,
    };
  const series = data.series.findLast((item) => item.status === "draft");
  if (series)
    return {
      title: series.title,
      label: "Reprendre les exercices",
      href: {
        pathname: "/parent/exercises",
        params: { draftId: series.id, subjectId: series.subjectId },
      },
    };
  const list = data.vocabularyLists.findLast((item) => item.status === "draft");
  if (list)
    return {
      title: list.title,
      label: "Reprendre la liste",
      href: {
        pathname: "/parent/vocabulary/[id]",
        params: { id: list.id, language: list.language },
      },
    };
  const plan = data.plans.findLast((item) => item.status === "draft");
  if (plan)
    return {
      title: plan.title,
      label: "Reprendre le contrôle",
      href: { pathname: "/parent/controls", params: { id: plan.id } },
    };
}

export function ParentDashboard() {
  const { colors } = useTheme();
  const router = useRouter();
  const data = useLearning();
  const compact = useWindowClass() === "compact";
  const jobs = usePreparationJobs(
    data.isDemo,
    data.activeProfileId,
    data.serverAvailable,
  );
  if (!data.isReady) return <LoadingParent />;
  const resume = resumableDraft(data);
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
        {resume && (
          <Card style={{ gap: spacing.md }}>
            <AppText variant="label" color={colors.primaryDark}>
              Reprendre un brouillon
            </AppText>
            <AppText variant="heading">{resume.title}</AppText>
            <Button
              icon="pencil"
              testID={resume.testID}
              onPress={() => router.push(resume.href)}
            >
              {resume.label}
            </Button>
          </Card>
        )}
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
