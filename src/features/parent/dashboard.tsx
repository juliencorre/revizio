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
import { colors } from "@/theme";
import { useLearning } from "@/state/learning-store";
import { dateOnly, stepIsLate } from "@/domain/planning";
import { learningOverview, preparationStatus } from "@/domain/study-overview";
import { LoadingParent, Notice, ParentLayout } from "./shared";
import { usePreparationJobs } from "./preparations";

export function ParentDashboard() {
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
      <View testID="parent-dashboard" style={{ gap: compact ? 18 : 24 }}>
        <View
          style={{
            backgroundColor: colors.primaryLight,
            borderRadius: 24,
            padding: compact ? 18 : 28,
          }}
        >
          <PageHeading
            eyebrow="Ensemble, à son rythme"
            title="Bonjour !"
            description={`Voici où en est ${data.childName}, et ce que vous pouvez préparer.`}
            action={
              <Button icon="plus" onPress={() => router.push("/parent/import")}>
                Ajouter un cours
              </Button>
            }
          />
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          <Button
            icon="book"
            variant="secondary"
            onPress={() => router.push("/parent/library")}
          >
            Retrouver les cours et exercices
          </Button>
          <Button
            icon="chart"
            variant="secondary"
            onPress={() => router.push("/parent/progress")}
          >
            Voir le suivi de {data.childName}
          </Button>
        </View>
        <Card style={{ gap: 16 }}>
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 12,
              alignItems: "center",
            }}
          >
            <AppIcon name="pencil" />
            <AppText variant="heading">
              Vos contenus à préparer et vérifier
            </AppText>
            <Badge tone="orange">{drafts.length + draftSeries.length}</Badge>
          </View>
          <AppText color={colors.muted}>
            Les brouillons restent privés. Relisez les fiches, les questions et
            leurs corrections avant de les publier.
          </AppText>
          {drafts.slice(0, 3).map((course) => (
            <View key={course.id} style={{ gap: 6 }}>
              <AppText variant="label">{course.title}</AppText>
              <AppText variant="small" color={colors.muted}>
                Fiche · {preparationStatus(course)}
              </AppText>
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
              <View key={series.id} style={{ gap: 6 }}>
                <AppText variant="label">{series.title}</AppText>
                <AppText variant="small" color={colors.muted}>
                  Exercices · {preparationStatus(series)}
                </AppText>
                <Button
                  variant="secondary"
                  icon="pencil"
                  onPress={() =>
                    router.push({
                      pathname: "/parent/exercises",
                      params: { draftId: series.id },
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
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 18 }}>
          <Card style={{ flexGrow: 1, flexBasis: 300, gap: 16 }}>
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
          <Card style={{ flexGrow: 1, flexBasis: 300, gap: 16 }}>
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
