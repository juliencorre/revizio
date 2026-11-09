import { Pressable, View, useWindowDimensions } from "react-native";
import { useRouter } from "expo-router";
import {
  AppIcon,
  AppText,
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeading,
  ProgressBar,
  useWindowClass,
} from "@/components/ui";
import { colors } from "@/theme";
import { useLearning } from "@/state/learning-store";
import { useSession } from "@/state/session";
import { dateOnly, stepIsLate } from "@/domain/planning";
import type { IconName } from "@/domain/model";
import {
  LoadingParent,
  Notice,
  ParentLayout,
  parentStyles as common,
} from "./shared";
import { usePreparationJobs } from "./preparations";

export function ParentDashboard() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const compact = useWindowClass() === "compact";
  const data = useLearning();
  const session = useSession();
  const jobs = usePreparationJobs(
    data.isDemo,
    data.activeProfileId,
    data.serverAvailable,
  );
  if (!data.isReady) return <LoadingParent />;
  const drafts = data.courses.filter((course) => course.status === "draft");
  const published = data.courses.filter(
    (course) => course.status === "published",
  );
  const finished = data.attempts.filter((attempt) => attempt.completedAt);
  const upcoming = data.plans
    .filter(
      (plan) => plan.status === "published" && plan.examDate >= dateOnly(),
    )
    .sort((a, b) => a.examDate.localeCompare(b.examDate))
    .slice(0, 3);
  const draftPlans = data.plans.filter((plan) => plan.status === "draft");
  const activeJobs = jobs.jobs.filter(
    (job) => job.status === "queued" || job.status === "running",
  );
  const failedJobs = jobs.jobs.filter((job) => job.status === "failed");
  const completedJobs = jobs.jobs.filter((job) => job.status === "succeeded");
  const activities: Array<{
    id: string;
    date: string;
    icon: IconName;
    title: string;
    note: string;
    color?: string;
  }> = [
    ...finished.map((attempt) => ({
      id: "attempt-" + attempt.id,
      date: attempt.completedAt!,
      icon: "check" as const,
      title: attempt.seriesTitle,
      note: `${attempt.answers.filter((answer) => answer.isCorrect).length} bonnes réponses sur ${attempt.questions.length}${attempt.answers.some((answer) => answer.usedHint) ? " · avec indice" : ""}`,
      color: colors.green,
    })),
    ...(data.readingRecords ?? []).flatMap((record) => {
      const course = data.courses.find(
        (course) => course.id === record.courseId,
      );
      return course
        ? [
            {
              id: "read-" + record.courseId + "-" + record.reviewedAt,
              date: record.reviewedAt,
              icon: "book" as const,
              title: "Fiche relue : " + course.title,
              note: "Activité de lecture enregistrée",
            },
          ]
        : [];
    }),
    ...data.courses.map((course) => ({
      id: "course-" + course.id,
      date: course.updatedAt,
      icon: "file" as const,
      title:
        (course.status === "published"
          ? "Fiche disponible : "
          : "Brouillon préparé : ") + course.title,
      note:
        data.subjects.find((subject) => subject.id === course.subjectId)
          ?.title ?? "Cours",
    })),
  ]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 6);
  return (
    <ParentLayout active="dashboard">
      <View testID="parent-dashboard" style={{ gap: 26 }}>
        <PageHeading
          eyebrow="Ensemble, à son rythme"
          title="Bonjour !"
          description={
            "Voici où en est " +
            data.childName +
            ", et ce que vous pouvez préparer."
          }
          action={
            <View style={common.row}>
              <Button
                icon="pencil"
                variant="secondary"
                onPress={() => router.push("/parent/exercises")}
                style={compact && { flexGrow: 1 }}
              >
                Préparer des exercices
              </Button>
              <Button
                icon="plus"
                onPress={() => router.push("/parent/import")}
                style={compact && { flexGrow: 1 }}
              >
                Ajouter un cours
              </Button>
            </View>
          }
        />
        {data.profiles.length > 1 && (
          <View style={common.row}>
            <AppText variant="label">Suivre :</AppText>
            {data.profiles.map((profile) => (
              <Button
                key={profile.id}
                variant={
                  profile.id === data.activeProfileId ? "primary" : "secondary"
                }
                onPress={() => session.selectProfile(profile.id)}
                accessibilityLabel={"Suivre " + profile.name}
              >
                {profile.name}
              </Button>
            ))}
          </View>
        )}
        {data.storageError && <Notice error>{data.storageError}</Notice>}
        <View style={[common.grid, compact && { gap: 10 }]}>
          {[
            {
              value: published.length,
              label: "cours disponibles",
              icon: "book" as const,
            },
            {
              value: drafts.length,
              label: "fiches à vérifier",
              icon: "pencil" as const,
            },
            {
              value: finished.length,
              label: "séances terminées",
              icon: "check" as const,
            },
          ].map((stat) =>
            compact ? (
              // Three compact tiles on one line keep the essentials visible.
              <Card
                key={stat.label}
                style={{ flex: 1, padding: 12, gap: 4, alignItems: "center" }}
              >
                <AppText variant="title" color={colors.primary}>
                  {stat.value}
                </AppText>
                <AppText
                  variant="small"
                  color={colors.muted}
                  style={{ textAlign: "center", fontSize: 13, lineHeight: 17 }}
                >
                  {stat.label}
                </AppText>
              </Card>
            ) : (
              <Card
                key={stat.label}
                style={{ flex: 1, minWidth: 180, gap: 12 }}
              >
                <View style={common.row}>
                  <View style={common.bubble}>
                    <AppIcon name={stat.icon} />
                  </View>
                  <AppText variant="title">{stat.value}</AppText>
                </View>
                <AppText color={colors.muted}>{stat.label}</AppText>
              </Card>
            ),
          )}
        </View>
        <View
          style={[
            common.grid,
            { flexDirection: width >= 1100 ? "row" : "column" },
          ]}
        >
          <Card style={common.column}>
            <View style={[common.row, { justifyContent: "space-between" }]}>
              <AppText variant="heading">Fiches à vérifier</AppText>
              <Badge tone="orange">{drafts.length}</Badge>
            </View>
            <AppText color={colors.muted}>
              Comparez les pages du cours, les notions et les exemples avant de
              les partager avec {data.childName}.
            </AppText>
            {drafts.length ? (
              drafts.map((course) => {
                const subject = data.subjects.find(
                  (subject) => subject.id === course.subjectId,
                );
                return (
                  <Pressable
                    key={course.id}
                    accessibilityRole="button"
                    accessibilityLabel={"Vérifier la fiche " + course.title}
                    testID={"review-course-" + course.id}
                    onPress={() =>
                      router.push({
                        pathname: "/parent/review/[id]",
                        params: { id: course.id },
                      })
                    }
                    style={[common.choice, { padding: 16 }]}
                  >
                    <View
                      style={[
                        common.bubble,
                        {
                          backgroundColor:
                            (subject?.color ?? colors.primary) + "16",
                        },
                      ]}
                    >
                      <AppIcon
                        name={subject?.icon ?? "book"}
                        color={subject?.color}
                      />
                    </View>
                    <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
                      <AppText variant="label">{course.title}</AppText>
                      <AppText variant="small" color={colors.muted}>
                        {subject?.title} · {course.sources.length} document
                        {course.sources.length > 1 ? "s" : ""}
                      </AppText>
                    </View>
                    <AppIcon name="chevron-right" />
                  </Pressable>
                );
              })
            ) : (
              <View style={{ gap: 10, paddingVertical: 16 }}>
                <AppIcon name="check" color={colors.green} />
                <AppText>Toutes les fiches préparées sont vérifiées.</AppText>
                <AppText variant="small" color={colors.muted}>
                  Les prochains brouillons apparaîtront ici.
                </AppText>
              </View>
            )}
            <Button
              variant="ghost"
              icon="sparkles"
              onPress={() => router.push("/parent/preparations")}
            >
              Retrouver mes préparations
            </Button>
          </Card>
          <Card style={common.column}>
            <View style={[common.row, { justifyContent: "space-between" }]}>
              <AppText variant="heading">Prochains contrôles</AppText>
              <AppIcon name="calendar" color={colors.orange} />
            </View>
            {upcoming.length ? (
              upcoming.map((plan) => {
                const done = plan.steps.filter(
                  (step) => step.completedAt,
                ).length;
                const late = plan.steps.filter((step) =>
                  stepIsLate(step),
                ).length;
                return (
                  <View key={plan.id} style={{ gap: 12, paddingVertical: 10 }}>
                    <View style={common.row}>
                      <View style={{ flex: 1, minWidth: 170, gap: 5 }}>
                        <AppText variant="heading">{plan.title}</AppText>
                        <AppText variant="small" color={colors.muted}>
                          {new Date(
                            plan.examDate + "T12:00:00",
                          ).toLocaleDateString("fr-FR", {
                            weekday: "long",
                            day: "numeric",
                            month: "long",
                          })}
                        </AppText>
                      </View>
                      <Button
                        variant="secondary"
                        icon="arrow-right"
                        onPress={() =>
                          router.push({
                            pathname: "/parent/controls",
                            params: { id: plan.id },
                          })
                        }
                        accessibilityLabel={"Voir le plan " + plan.title}
                      >
                        Voir le plan
                      </Button>
                    </View>
                    <ProgressBar
                      value={
                        plan.steps.length ? (done / plan.steps.length) * 100 : 0
                      }
                    />
                    <AppText
                      variant="small"
                      color={late ? colors.orange : colors.muted}
                    >
                      {done} séance{done > 1 ? "s" : ""} sur {plan.steps.length}
                      {late ? ` · ${late} à reprogrammer` : ""}
                    </AppText>
                  </View>
                );
              })
            ) : (
              <View style={{ gap: 12, paddingVertical: 20 }}>
                <AppText>
                  Aucun contrôle à venir n’a encore été partagé.
                </AppText>
                <AppText variant="small" color={colors.muted}>
                  Choisissez une date et des chapitres pour construire un
                  programme adapté.
                </AppText>
              </View>
            )}
            {draftPlans.length > 0 && (
              <Badge tone="orange">
                {draftPlans.length} plan{draftPlans.length > 1 ? "s" : ""} en
                brouillon
              </Badge>
            )}
            <Button icon="plus" onPress={() => router.push("/parent/controls")}>
              Préparer un contrôle
            </Button>
          </Card>
        </View>
        <Card style={{ gap: 18 }}>
          <View style={[common.row, { justifyContent: "space-between" }]}>
            <AppText variant="heading">Préparations en cours</AppText>
            <Button
              variant="ghost"
              icon="arrow-right"
              onPress={() => router.push("/parent/preparations")}
            >
              Tout voir
            </Button>
          </View>
          {data.isDemo ? (
            <View style={{ gap: 12 }}>
              <AppText color={colors.muted}>
                Connectez votre espace familial pour lancer et suivre de vraies
                générations à partir de vos cours.
              </AppText>
              <Button
                variant="secondary"
                icon="users"
                onPress={() =>
                  router.push({
                    pathname: "/auth",
                    params: { target: "parent" },
                  })
                }
              >
                Créer ou ouvrir mon espace familial
              </Button>
            </View>
          ) : (
            <>
              <View style={common.row}>
                <Badge>{activeJobs.length} en préparation</Badge>
                <Badge tone="green">
                  {completedJobs.length} résultat
                  {completedJobs.length > 1 ? "s" : ""} disponible
                  {completedJobs.length > 1 ? "s" : ""}
                </Badge>
                {failedJobs.length > 0 && (
                  <Badge tone="orange">{failedJobs.length} à relancer</Badge>
                )}
              </View>
              {jobs.error && <Notice error>{jobs.error}</Notice>}
              {activeJobs.slice(0, 3).map((job) => (
                <View key={job.id} style={common.choice}>
                  <AppIcon name="clock" />
                  <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                    <AppText variant="label">
                      {job.input?.title ||
                        job.result?.course?.title ||
                        (job.kind === "course"
                          ? "Fiche de révision"
                          : job.kind === "english"
                            ? "Répertoire d’anglais"
                            : "Série d’exercices")}
                    </AppText>
                    <AppText variant="small" color={colors.muted}>
                      {job.message || "Préparation sur le serveur"}
                    </AppText>
                  </View>
                </View>
              ))}
              {!activeJobs.length && !jobs.loading && !jobs.error && (
                <AppText color={colors.muted}>
                  Aucune préparation en attente. Les résultats terminés restent
                  disponibles dans « Mes préparations ».
                </AppText>
              )}
            </>
          )}
        </Card>
        <Card style={{ gap: 18 }}>
          <View style={[common.row, { justifyContent: "space-between" }]}>
            <AppText variant="heading">Activités récentes</AppText>
            <Button
              variant="ghost"
              icon="languages"
              onPress={() => router.push("/parent/english")}
            >
              Préparer son anglais
            </Button>
          </View>
          {activities.length ? (
            activities.map((activity) => (
              <View
                key={activity.id}
                style={[
                  common.row,
                  { alignItems: "flex-start", paddingVertical: 10 },
                ]}
              >
                <View style={common.bubble}>
                  <AppIcon
                    name={activity.icon}
                    color={activity.color ?? colors.primary}
                  />
                </View>
                <View style={{ flex: 1, minWidth: 180, gap: 5 }}>
                  <AppText variant="label">{activity.title}</AppText>
                  <AppText
                    variant="small"
                    color={activity.color ?? colors.muted}
                  >
                    {activity.note}
                  </AppText>
                </View>
                <AppText variant="small" color={colors.muted}>
                  {new Date(activity.date).toLocaleDateString("fr-FR", {
                    day: "numeric",
                    month: "short",
                  })}
                </AppText>
              </View>
            ))
          ) : (
            <AppText color={colors.muted}>
              Les lectures et les premières séances de {data.childName}{" "}
              apparaîtront ici.
            </AppText>
          )}
        </Card>
        <View style={common.row}>
          <AppText variant="heading">Les cours disponibles</AppText>
          <Badge tone="green">
            {published.length} publié{published.length > 1 ? "s" : ""}
          </Badge>
        </View>
        {published.length && compact ? (
          // On phones, a list keeps every published course one tap away.
          <View style={{ gap: 12 }}>
            {published.map((course) => {
              const subject = data.subjects.find(
                (subject) => subject.id === course.subjectId,
              );
              const count = data.series.filter(
                (series) =>
                  series.status === "published" &&
                  series.courseIds.includes(course.id),
              ).length;
              return (
                <Pressable
                  key={course.id}
                  accessibilityRole="button"
                  accessibilityLabel={"Consulter la fiche " + course.title}
                  onPress={() =>
                    router.push({
                      pathname: "/parent/review/[id]",
                      params: { id: course.id },
                    })
                  }
                  style={({ pressed }) => [
                    common.choice,
                    { padding: 14 },
                    pressed && common.selected,
                  ]}
                >
                  <View
                    style={[
                      common.bubble,
                      {
                        backgroundColor:
                          (subject?.color ?? colors.primary) + "16",
                      },
                    ]}
                  >
                    <AppIcon
                      name={subject?.icon ?? "book"}
                      color={subject?.color}
                    />
                  </View>
                  <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                    <AppText variant="label">{course.title}</AppText>
                    <AppText variant="small" color={colors.muted}>
                      {subject?.title} · {count} série{count > 1 ? "s" : ""}
                    </AppText>
                  </View>
                  <AppIcon name="chevron-right" />
                </Pressable>
              );
            })}
          </View>
        ) : published.length ? (
          <View style={common.grid}>
            {published.map((course) => {
              const subject = data.subjects.find(
                (subject) => subject.id === course.subjectId,
              );
              const count = data.series.filter(
                (series) =>
                  series.status === "published" &&
                  series.courseIds.includes(course.id),
              ).length;
              return (
                <Card
                  key={course.id}
                  style={{
                    flexGrow: 1,
                    width: width >= 1100 ? "30%" : "45%",
                    minWidth: 250,
                    gap: 16,
                  }}
                >
                  <View style={common.row}>
                    <View
                      style={[
                        common.bubble,
                        {
                          backgroundColor:
                            (subject?.color ?? colors.primary) + "16",
                        },
                      ]}
                    >
                      <AppIcon
                        name={subject?.icon ?? "book"}
                        color={subject?.color}
                      />
                    </View>
                    <AppText variant="small" color={subject?.color}>
                      {subject?.title}
                    </AppText>
                  </View>
                  <AppText variant="heading">{course.title}</AppText>
                  <AppText variant="small" color={colors.muted}>
                    {count} série{count > 1 ? "s" : ""} d’exercices disponible
                    {count > 1 ? "s" : ""}
                  </AppText>
                  <Button
                    variant="ghost"
                    icon="file"
                    onPress={() =>
                      router.push({
                        pathname: "/parent/review/[id]",
                        params: { id: course.id },
                      })
                    }
                  >
                    Consulter la fiche
                  </Button>
                </Card>
              );
            })}
          </View>
        ) : (
          <EmptyState
            title="Un premier cours à partager"
            description={
              "Ajoutez un cours, préparez sa fiche et publiez-la pour " +
              data.childName +
              "."
            }
          >
            <Button icon="plus" onPress={() => router.push("/parent/import")}>
              Ajouter un cours
            </Button>
          </EmptyState>
        )}
      </View>
    </ParentLayout>
  );
}
