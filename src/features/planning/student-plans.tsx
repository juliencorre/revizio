import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  AppIcon,
  AppText,
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeading,
  ProgressBar,
} from "@/components/ui";
import { colors } from "@/theme";
import { useLearning } from "@/state/learning-store";
import type { PlanStep } from "@/domain/model";
import {
  dateOnly,
  daysUntil,
  planStepLabels,
  stepIsLate,
} from "@/domain/planning";
import { StudyWorkspace } from "./shared";

function formattedDate(value: string) {
  return new Date(value + "T12:00:00").toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}
export function StudentPlansScreen() {
  const data = useLearning();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const [selectedId, setSelectedId] = useState(params.id ?? "");
  useEffect(() => {
    if (params.id) setSelectedId(params.id);
  }, [params.id]);
  const plans = (data.plans ?? [])
    .filter((plan) => plan.status === "published")
    .sort((a, b) => a.examDate.localeCompare(b.examDate));
  const selected = plans.find((plan) => plan.id === selectedId) ?? plans[0];
  const today = dateOnly();
  const completed =
    selected?.steps.filter((step) => step.completedAt).length ?? 0;
  const next = selected?.steps
    .filter((step) => !step.completedAt)
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  function readAndComplete(step: PlanStep) {
    for (const id of step.courseIds) data.markReviewed(id);
    data.completePlanStep(selected!.id, step.id);
  }
  function start(step: PlanStep) {
    const series =
      data.series.find(
        (item) => item.id === step.seriesId && item.status === "published",
      ) ??
      data.series.find(
        (item) =>
          item.status === "published" &&
          item.courseIds.some((id) => step.courseIds.includes(id)),
      );
    if (!series) return;
    router.push({
      pathname: "/student/exercise/[id]",
      params: {
        id: series.id,
        planId: selected!.id,
        stepId: step.id,
        ...(step.kind === "mock"
          ? { mode: "exam", minutes: String(step.minutes) }
          : {}),
      },
    });
  }
  return (
    <StudyWorkspace role="child" active="plans">
      <View testID="student-plans" style={{ gap: 26 }}>
        <PageHeading
          title="Mes plans de révision"
          description="Un petit programme pour savoir quoi faire avant un contrôle."
        />
        {!plans.length ? (
          <EmptyState
            icon="calendar"
            title="Un plan arrivera ici"
            description="Un parent peut préparer ton prochain contrôle et partager des séances courtes avec toi."
          >
            <Button icon="book" onPress={() => router.push("/student")}>
              Retrouver mes cours
            </Button>
          </EmptyState>
        ) : (
          <>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
              {plans.map((plan) => (
                <Button
                  key={plan.id}
                  variant={selected?.id === plan.id ? "primary" : "secondary"}
                  onPress={() => setSelectedId(plan.id)}
                  accessibilityLabel={"Voir le plan " + plan.title}
                >
                  {plan.title}
                </Button>
              ))}
            </View>
            {selected && (
              <>
                <Card style={{ gap: 18 }}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 16,
                      flexWrap: "wrap",
                    }}
                  >
                    <View style={{ flex: 1, minWidth: 180, gap: 8 }}>
                      <AppText variant="heading">{selected.title}</AppText>
                      <AppText color={colors.muted}>
                        Contrôle {formattedDate(selected.examDate)}
                      </AppText>
                    </View>
                    <Badge
                      tone={selected.examDate < today ? "orange" : "primary"}
                    >
                      {selected.examDate === today
                        ? "Jour J"
                        : selected.examDate < today
                          ? "Contrôle passé"
                          : `Dans ${daysUntil(selected.examDate)} jour${daysUntil(selected.examDate) > 1 ? "s" : ""}`}
                    </Badge>
                  </View>
                  <ProgressBar
                    value={
                      selected.steps.length
                        ? (completed / selected.steps.length) * 100
                        : 0
                    }
                  />
                  <AppText>
                    {completed} séance{completed > 1 ? "s" : ""} terminée
                    {completed > 1 ? "s" : ""} sur {selected.steps.length}
                  </AppText>
                  {next && (
                    <View
                      style={{
                        padding: 18,
                        borderRadius: 18,
                        backgroundColor: colors.primaryLight,
                        gap: 7,
                      }}
                    >
                      <AppText
                        variant="small"
                        color={colors.primary}
                        style={{ fontWeight: "700" }}
                      >
                        MON PROCHAIN PETIT PAS
                      </AppText>
                      <AppText variant="heading">{next.title}</AppText>
                      <AppText color={colors.muted}>
                        {next.minutes} min · {formattedDate(next.date)}
                      </AppText>
                    </View>
                  )}
                  {!next && (
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 10,
                      }}
                    >
                      <AppIcon name="check" color={colors.green} />
                      <AppText color={colors.green}>
                        Tu as terminé toutes les séances de ce plan.
                      </AppText>
                    </View>
                  )}
                </Card>
                <AppText color={colors.muted}>
                  Tu peux commencer une séance à l’avance ou revenir sur une
                  séance déjà faite.
                </AppText>
                {[...selected.steps]
                  .sort((a, b) => a.date.localeCompare(b.date))
                  .map((step, index) => {
                    const courses = data.courses.filter(
                      (course) =>
                        course.status === "published" &&
                        step.courseIds.includes(course.id),
                    );
                    const exercise = data.series.find(
                      (item) =>
                        item.status === "published" &&
                        (item.id === step.seriesId ||
                          item.courseIds.some((id) =>
                            step.courseIds.includes(id),
                          )),
                    );
                    const read =
                      step.kind === "read" || step.kind === "summary";
                    return (
                      <Card
                        key={step.id}
                        style={{
                          gap: 18,
                          borderColor: step.completedAt
                            ? colors.green
                            : undefined,
                        }}
                      >
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 14,
                            flexWrap: "wrap",
                          }}
                        >
                          <View
                            style={{
                              width: 46,
                              height: 46,
                              borderRadius: 16,
                              backgroundColor: step.completedAt
                                ? colors.greenLight
                                : colors.primaryLight,
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            {step.completedAt ? (
                              <AppIcon name="check" color={colors.green} />
                            ) : (
                              <AppText variant="heading" color={colors.primary}>
                                {index + 1}
                              </AppText>
                            )}
                          </View>
                          <View style={{ flex: 1, minWidth: 180, gap: 5 }}>
                            <AppText
                              variant="small"
                              color={
                                stepIsLate(step)
                                  ? colors.orange
                                  : colors.primary
                              }
                              style={{ fontWeight: "700" }}
                            >
                              {formattedDate(step.date)} · {step.minutes} min
                            </AppText>
                            <AppText variant="heading">{step.title}</AppText>
                          </View>
                          <Badge
                            tone={
                              step.completedAt
                                ? "green"
                                : stepIsLate(step)
                                  ? "orange"
                                  : "muted"
                            }
                          >
                            {step.completedAt
                              ? "Fait"
                              : stepIsLate(step)
                                ? "À reprendre"
                                : planStepLabels[step.kind]}
                          </Badge>
                        </View>
                        {stepIsLate(step) && (
                          <AppText variant="small" color={colors.orange}>
                            Tu peux faire cette séance maintenant. Un parent
                            peut aussi ajuster le programme.
                          </AppText>
                        )}
                        <View style={{ gap: 10 }}>
                          {courses.map((course) => (
                            <Pressable
                              key={course.id}
                              accessibilityRole="button"
                              accessibilityLabel={"Lire " + course.title}
                              onPress={() =>
                                router.push({
                                  pathname: "/student/course/[id]",
                                  params: { id: course.id },
                                })
                              }
                              style={{
                                minHeight: 48,
                                padding: 12,
                                borderRadius: 14,
                                backgroundColor: colors.primaryLight,
                                flexDirection: "row",
                                alignItems: "center",
                                gap: 10,
                              }}
                            >
                              <AppIcon name="book" size={20} />
                              <AppText style={{ flex: 1 }}>
                                {course.title}
                              </AppText>
                              <AppIcon name="chevron-right" size={20} />
                            </Pressable>
                          ))}
                        </View>
                        <View
                          style={{
                            flexDirection: "row",
                            flexWrap: "wrap",
                            gap: 12,
                          }}
                        >
                          {read ? (
                            <Button
                              icon="check"
                              variant={
                                step.completedAt ? "secondary" : "primary"
                              }
                              disabled={!!step.completedAt}
                              testID={"complete-plan-step-" + step.id}
                              onPress={() => readAndComplete(step)}
                            >
                              {step.completedAt
                                ? "Lecture déjà notée"
                                : "J’ai relu les fiches"}
                            </Button>
                          ) : exercise ? (
                            <Button
                              icon={step.kind === "mock" ? "clock" : "play"}
                              testID={"start-plan-step-" + step.id}
                              variant={
                                step.completedAt ? "secondary" : "primary"
                              }
                              onPress={() => start(step)}
                            >
                              {step.completedAt
                                ? "Refaire pour m’entraîner"
                                : step.kind === "mock"
                                  ? "Commencer le contrôle blanc"
                                  : step.kind === "mistakes"
                                    ? "Reprendre les exercices"
                                    : "Commencer la séance"}
                            </Button>
                          ) : (
                            <AppText color={colors.muted}>
                              Les exercices de cette séance doivent encore être
                              préparés par un parent. Tu peux déjà relire les
                              fiches.
                            </AppText>
                          )}
                          {step.kind === "mistakes" && (
                            <Button
                              icon="chart"
                              variant="ghost"
                              onPress={() => router.push("/student/progress")}
                            >
                              Retrouver mes erreurs
                            </Button>
                          )}
                        </View>
                        {step.kind === "mock" && (
                          <AppText variant="small" color={colors.muted}>
                            Tu disposes de {step.minutes} minutes. Les
                            explications seront disponibles à la fin du contrôle
                            blanc.
                          </AppText>
                        )}
                      </Card>
                    );
                  })}
              </>
            )}
          </>
        )}
      </View>
    </StudyWorkspace>
  );
}
