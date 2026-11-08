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
} from "@/components/ui";
import { colors } from "@/theme";
import { useLearning } from "@/state/learning-store";
import {
  LoadingParent,
  Notice,
  ParentLayout,
  parentStyles as s,
} from "./shared";
export function ParentDashboard() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { courses, series, attempts, subjects, isReady, storageError } =
    useLearning();
  if (!isReady) return <LoadingParent />;
  const drafts = courses.filter((c) => c.status === "draft");
  const published = courses.filter((c) => c.status === "published");
  const finished = attempts.filter((a) => a.completedAt);
  const recent = [...finished]
    .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""))
    .slice(0, 4);
  return (
    <ParentLayout active="dashboard">
      <PageHeading
        eyebrow="Ensemble, à son rythme"
        title="Bonjour !"
        description="Voici où en est Alex, et ce que vous pouvez préparer."
        action={
          <Button icon="plus" onPress={() => router.push("/parent/import")}>
            Ajouter un cours
          </Button>
        }
      />
      {storageError && <Notice error>{storageError}</Notice>}
      <View style={s.grid}>
        {[
          {
            value: published.length,
            label: "cours disponibles",
            icon: "book" as const,
          },
          {
            value: drafts.length,
            label: "fiches à préparer",
            icon: "pencil" as const,
          },
          {
            value: finished.length,
            label: "séries terminées",
            icon: "check" as const,
          },
        ].map((stat) => (
          <Card key={stat.label} style={{ flex: 1, minWidth: 175, gap: 12 }}>
            <View style={s.row}>
              <View style={s.bubble}>
                <AppIcon name={stat.icon} />
              </View>
              <AppText variant="title">{stat.value}</AppText>
            </View>
            <AppText color={colors.muted}>{stat.label}</AppText>
          </Card>
        ))}
      </View>
      <View
        style={[s.grid, { flexDirection: width >= 1100 ? "row" : "column" }]}
      >
        <Card style={s.column}>
          <View style={[s.row, { justifyContent: "space-between" }]}>
            <AppText variant="heading">Fiches à préparer</AppText>
            <Badge tone="orange">{drafts.length}</Badge>
          </View>
          <AppText color={colors.muted}>
            Relisez le contenu et les exemples avant de les partager avec Alex.
          </AppText>
          {drafts.length ? (
            drafts.map((course) => {
              const subject = subjects.find(
                (item) => item.id === course.subjectId,
              );
              return (
                <Pressable
                  key={course.id}
                  accessibilityRole="button"
                  onPress={() =>
                    router.push({
                      pathname: "/parent/review/[id]",
                      params: { id: course.id },
                    })
                  }
                  style={[s.choice, { padding: 16 }]}
                >
                  <View
                    style={[
                      s.bubble,
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
                  <View style={{ flex: 1, gap: 5 }}>
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
              <AppText>Tout est prêt pour réviser.</AppText>
              <AppText variant="small" color={colors.muted}>
                Les prochains brouillons apparaîtront ici.
              </AppText>
            </View>
          )}
        </Card>
        <Card style={s.column}>
          <AppText variant="heading">Ses dernières séances</AppText>
          <AppText color={colors.muted}>
            Des résultats pour repérer les notions à reprendre ensemble.
          </AppText>
          {recent.length ? (
            recent.map((attempt) => {
              const correct = attempt.answers.filter((a) => a.isCorrect).length;
              const hints = attempt.answers.filter((a) => a.usedHint).length;
              return (
                <View
                  key={attempt.id}
                  style={[s.choice, { alignItems: "flex-start", padding: 16 }]}
                >
                  <AppIcon name="check" color={colors.green} />
                  <View style={{ flex: 1, gap: 6 }}>
                    <AppText variant="label">{attempt.seriesTitle}</AppText>
                    <AppText color={colors.green}>
                      {correct} bonne{correct > 1 ? "s" : ""} réponse
                      {correct > 1 ? "s" : ""} sur {attempt.questions.length}
                    </AppText>
                    <AppText variant="small" color={colors.muted}>
                      {hints
                        ? hints +
                          " indice" +
                          (hints > 1 ? "s" : "") +
                          " utilisé" +
                          (hints > 1 ? "s" : "") +
                          " · "
                        : ""}
                      {new Date(attempt.completedAt!).toLocaleDateString(
                        "fr-FR",
                      )}
                    </AppText>
                  </View>
                </View>
              );
            })
          ) : (
            <View style={{ paddingVertical: 20, gap: 12 }}>
              <AppIcon name="chart" size={32} />
              <AppText>Les premières séances apparaîtront ici.</AppText>
              <AppText variant="small" color={colors.muted}>
                Alex peut commencer avec les exercices déjà préparés.
              </AppText>
            </View>
          )}
          <Button
            variant="secondary"
            icon="pencil"
            onPress={() => router.push("/parent/exercises")}
          >
            Préparer des exercices
          </Button>
        </Card>
      </View>
      <View style={s.row}>
        <AppText variant="heading">Les cours disponibles</AppText>
        <Badge tone="green">
          {published.length} publié{published.length > 1 ? "s" : ""}
        </Badge>
      </View>
      {published.length ? (
        <View style={s.grid}>
          {published.map((course) => {
            const subject = subjects.find(
              (item) => item.id === course.subjectId,
            );
            const count = series.filter(
              (item) =>
                item.status === "published" &&
                item.courseIds.includes(course.id),
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
                <View style={s.row}>
                  <View
                    style={[
                      s.bubble,
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
          description="Ajoutez un cours, préparez sa fiche et publiez-la pour Alex."
        >
          <Button icon="plus" onPress={() => router.push("/parent/import")}>
            Ajouter un cours
          </Button>
        </EmptyState>
      )}
    </ParentLayout>
  );
}
