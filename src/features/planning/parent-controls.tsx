import { useState } from "react";
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
} from "@/components/ui";
import { colors } from "@/theme";
import { useLearning } from "@/state/learning-store";
import type { ExerciseSeries, PlanStep, RevisionPlan } from "@/domain/model";
import {
  buildRevisionSteps,
  dateOnly,
  planStepLabels,
  planValidation,
  reschedulePlan,
  stepIsLate,
  validPlanDate,
} from "@/domain/planning";
import {
  Field,
  Notice,
  localId,
  parentStyles as common,
} from "@/features/parent/shared";
import { StudyWorkspace } from "./shared";
import { useLocalDraft } from "./use-local-draft";

type Editor = Omit<RevisionPlan, "id" | "status"> & { id?: string };
function newEditor(): Editor {
  const date = new Date();
  date.setDate(date.getDate() + 4);
  return {
    title: "",
    subjectId: "maths",
    examDate: dateOnly(date),
    courseIds: [],
    dailyMinutes: 20,
    steps: [],
  };
}
function isEditor(value: unknown): value is Editor {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Editor;
  return (
    typeof candidate.title === "string" &&
    typeof candidate.subjectId === "string" &&
    typeof candidate.examDate === "string" &&
    Array.isArray(candidate.courseIds) &&
    candidate.courseIds.every((id) => typeof id === "string") &&
    Array.isArray(candidate.steps) &&
    candidate.steps.every(
      (step) =>
        step &&
        typeof step.id === "string" &&
        typeof step.title === "string" &&
        typeof step.date === "string" &&
        typeof step.minutes === "number" &&
        Object.hasOwn(planStepLabels, step.kind) &&
        Array.isArray(step.courseIds) &&
        step.courseIds.every((id) => typeof id === "string"),
    ) &&
    typeof candidate.dailyMinutes === "number" &&
    Number.isFinite(candidate.dailyMinutes)
  );
}
const dateLabel = (date: string) =>
  new Date(date + "T12:00:00").toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

export function ParentControlsScreen() {
  const data = useLearning();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [editor, setEditor, draft] = useLocalDraft<Editor>(
    "revizo.plan-editor." + (data.activeProfileId ?? "demo"),
    newEditor(),
    isEditor,
  );
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [reportDate, setReportDate] = useState("");
  const plans = data.plans ?? [];
  const available = data.courses.filter(
    (course) =>
      course.status === "published" && course.subjectId === editor.subjectId,
  );
  const selected = data.courses.filter((course) =>
    editor.courseIds.includes(course.id),
  );
  const approvedSeries = data.series.filter(
    (series) =>
      series.status === "published" &&
      series.subjectId === editor.subjectId &&
      series.courseIds.some((id) => editor.courseIds.includes(id)),
  );
  const questions = [
    ...new Map(
      approvedSeries
        .flatMap((series) => series.questions)
        .map((question) => [question.id, question]),
    ).values(),
  ].slice(0, 20);
  function change(update: Partial<Editor>) {
    setEditor((current) => ({ ...current, ...update }));
    setConfirmed(false);
    setError("");
    setMessage("");
  }
  function edit(plan: RevisionPlan) {
    setEditor({
      id: plan.id,
      title: plan.title,
      subjectId: plan.subjectId,
      examDate: plan.examDate,
      courseIds: [...plan.courseIds],
      dailyMinutes: plan.dailyMinutes,
      steps: plan.steps.map((step) => ({
        ...step,
        courseIds: [...step.courseIds],
      })),
    });
    setReportDate(plan.examDate);
    setConfirmed(false);
    setError("");
    setMessage("Le plan est prêt à être ajusté ci-dessous.");
  }
  function propose() {
    try {
      const steps = buildRevisionSteps({
        ...editor,
        courses: data.courses,
        series: data.series,
      });
      change({ steps });
      setMessage(
        "Proposition préparée selon la date et le temps disponible. Ajustez chaque séance avant publication.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Le plan n’a pas pu être préparé.",
      );
    }
  }
  function save(): string | null {
    if (!editor.title.trim()) {
      setError("Donnez un titre au contrôle.");
      return null;
    }
    if (
      !validPlanDate(editor.examDate) ||
      !Number.isInteger(editor.dailyMinutes) ||
      editor.dailyMinutes < 5 ||
      editor.dailyMinutes > 120
    ) {
      setError(
        "Choisissez une date valide et entre 5 et 120 minutes par jour avant d’enregistrer.",
      );
      return null;
    }
    const id =
      editor.id ?? data.addPlan({ ...editor, title: editor.title.trim() });
    if (editor.id)
      data.updatePlan(id, {
        ...editor,
        title: editor.title.trim(),
        status: "draft",
      });
    setEditor((current) => ({ ...current, id }));
    setMessage(
      "Brouillon enregistré. Il sera visible par votre enfant après publication.",
    );
    setError("");
    return id;
  }
  function publish() {
    const candidate: RevisionPlan = {
      ...editor,
      id: editor.id ?? "new-plan",
      status: "draft",
    };
    const issue = planValidation(candidate, data.courses, dateOnly());
    if (issue) {
      setError(issue);
      return;
    }
    if (!confirmed) {
      setError("Confirmez la relecture du plan.");
      return;
    }
    const needsExercises = editor.steps.some((step) =>
      ["practice", "mistakes", "mock"].includes(step.kind),
    );
    const missing = editor.courseIds.filter(
      (id) => !approvedSeries.some((series) => series.courseIds.includes(id)),
    );
    if (needsExercises && missing.length) {
      save();
      setError(
        "Préparez une série d’exercices publiée pour chaque chapitre avant de partager les séances d’entraînement.",
      );
      return;
    }
    let trainingId = approvedSeries.find((series) =>
      editor.courseIds.every((id) => series.courseIds.includes(id)),
    )?.id;
    if (needsExercises && !trainingId) {
      trainingId = data.addSeries({
        title: editor.title + " — entraînement",
        subjectId: editor.subjectId,
        courseIds: editor.courseIds,
        level: "practice",
        questions,
      });
      const result = data.publishSeries(trainingId);
      if (!result.ok) {
        setError(result.error ?? "Les exercices ne peuvent pas être partagés.");
        return;
      }
    }
    let mockId: string | undefined;
    if (editor.steps.some((step) => step.kind === "mock")) {
      mockId = data.addSeries({
        title: "Contrôle blanc — " + editor.title,
        subjectId: editor.subjectId,
        courseIds: editor.courseIds,
        level: "practice",
        mode: "exam",
        timeLimitSeconds:
          Math.max(
            1,
            editor.steps.find((step) => step.kind === "mock")!.minutes,
          ) * 60,
        questions,
      });
      const result = data.publishSeries(mockId);
      if (!result.ok) {
        setError(result.error ?? "Le contrôle blanc ne peut pas être partagé.");
        return;
      }
    }
    const steps = editor.steps.map((step) => ({
      ...step,
      ...(["practice", "mistakes"].includes(step.kind) && trainingId
        ? { seriesId: trainingId }
        : {}),
      ...(step.kind === "mock" && mockId ? { seriesId: mockId } : {}),
    }));
    const id =
      editor.id ??
      data.addPlan({ ...editor, title: editor.title.trim(), steps });
    if (editor.id)
      data.updatePlan(id, {
        ...editor,
        title: editor.title.trim(),
        steps,
        status: "draft",
      });
    const result = data.publishPlan(id);
    if (!result.ok) {
      setError(result.error ?? "Le plan ne peut pas être publié.");
      return;
    }
    setEditor((current) => ({ ...current, id, steps }));
    setMessage(
      "Le plan est publié. Votre enfant le retrouve dans « Mes plans ».",
    );
    setError("");
    setConfirmed(false);
  }
  function updateStep(id: string, update: Partial<PlanStep>) {
    change({
      steps: editor.steps.map((step) =>
        step.id === id ? { ...step, ...update } : step,
      ),
    });
  }
  function report() {
    if (!editor.id) {
      setError("Enregistrez ce plan avant de reporter le contrôle.");
      return;
    }
    try {
      const source: RevisionPlan = {
        ...editor,
        id: editor.id,
        status: "draft",
      };
      const next = reschedulePlan(source, reportDate || editor.examDate);
      const result = data.postponePlan(editor.id, next.examDate);
      if (!result.ok) {
        setError(result.error ?? "Le plan ne peut pas être reprogrammé.");
        return;
      }
      change({ examDate: next.examDate, steps: next.steps });
      setMessage(
        "Les séances restantes ont été réparties. Vérifiez puis republiez le plan.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Choisissez une nouvelle date.",
      );
    }
  }
  if (!draft.ready)
    return (
      <StudyWorkspace role="parent" active="plans">
        <Card>
          <AppText>On retrouve votre brouillon de contrôle…</AppText>
        </Card>
      </StudyWorkspace>
    );
  return (
    <StudyWorkspace role="parent" active="plans">
      <View testID="parent-controls" style={{ gap: 26 }}>
        <PageHeading
          eyebrow="Préparer avec sérénité"
          title="Contrôles et plans"
          description="Des séances courtes et un programme que vous pouvez ajuster."
          action={
            <Button
              variant="secondary"
              icon="plus"
              onPress={() => {
                setEditor(newEditor());
                setConfirmed(false);
                setError("");
                setMessage("Nouveau contrôle.");
              }}
            >
              Nouveau contrôle
            </Button>
          }
        />
        {draft.error && <Notice error>{draft.error}</Notice>}
        {error && <Notice error>{error}</Notice>}
        {message && <Notice success>{message}</Notice>}
        {!!plans.length && (
          <View style={{ gap: 14 }}>
            <AppText variant="heading">Les contrôles préparés</AppText>
            <View style={common.grid}>
              {[...plans]
                .sort((a, b) => a.examDate.localeCompare(b.examDate))
                .map((plan) => {
                  const done = plan.steps.filter(
                    (step) => step.completedAt,
                  ).length;
                  const late = plan.steps.filter((step) =>
                    stepIsLate(step),
                  ).length;
                  return (
                    <Card
                      key={plan.id}
                      style={{
                        flexGrow: 1,
                        minWidth: 270,
                        maxWidth: 560,
                        gap: 14,
                      }}
                    >
                      <View style={common.row}>
                        <Badge
                          tone={
                            plan.status === "published" ? "green" : "orange"
                          }
                        >
                          {plan.status === "published"
                            ? "Partagé"
                            : "Brouillon"}
                        </Badge>
                        <AppText variant="small" color={colors.muted}>
                          {dateLabel(plan.examDate)}
                        </AppText>
                      </View>
                      <AppText variant="heading">{plan.title}</AppText>
                      <ProgressBar
                        value={
                          plan.steps.length
                            ? (done / plan.steps.length) * 100
                            : 0
                        }
                      />
                      <AppText color={colors.muted}>
                        {done} séance{done > 1 ? "s" : ""} terminée
                        {done > 1 ? "s" : ""} sur {plan.steps.length}
                        {late ? ` · ${late} à reprogrammer` : ""}
                      </AppText>
                      <View style={common.row}>
                        <Button
                          variant="secondary"
                          icon="pencil"
                          onPress={() => edit(plan)}
                          accessibilityLabel={"Modifier le plan " + plan.title}
                        >
                          Modifier
                        </Button>
                        <Button
                          variant="danger"
                          icon="trash"
                          onPress={() => setDeleteId(plan.id)}
                          accessibilityLabel={"Supprimer le plan " + plan.title}
                        >
                          Supprimer
                        </Button>
                      </View>
                      {deleteId === plan.id && (
                        <View style={{ gap: 10 }}>
                          <Notice>
                            Supprimer ce plan retire ses séances. Les résultats
                            d’exercices restent conservés.
                          </Notice>
                          <View style={common.row}>
                            <Button
                              variant="danger"
                              onPress={() => {
                                data.deletePlan(plan.id);
                                setDeleteId(null);
                                if (editor.id === plan.id)
                                  setEditor(newEditor());
                              }}
                            >
                              Confirmer la suppression
                            </Button>
                            <Button
                              variant="ghost"
                              onPress={() => setDeleteId(null)}
                            >
                              Annuler
                            </Button>
                          </View>
                        </View>
                      )}
                    </Card>
                  );
                })}
            </View>
          </View>
        )}
        {!data.courses.some((course) => course.status === "published") ? (
          <EmptyState
            icon="calendar"
            title="Ajoutez d’abord un cours"
            description="Un plan s’appuie sur les chapitres que vous avez vérifiés."
          >
            <Button icon="plus" onPress={() => router.push("/parent/import")}>
              Ajouter un cours
            </Button>
          </EmptyState>
        ) : (
          <>
            <View
              style={{
                flexDirection: width >= 1150 ? "row" : "column",
                gap: 22,
                alignItems: "stretch",
              }}
            >
              <Card style={{ flex: 1, minWidth: 280, gap: 18 }}>
                <AppText variant="heading">Le contrôle</AppText>
                <Field
                  label="Titre du contrôle"
                  testID="control-title"
                  value={editor.title}
                  onChangeText={(title) => change({ title })}
                  placeholder="Par exemple : Nombres relatifs et priorités"
                  maxLength={120}
                />
                <AppText variant="label">Matière</AppText>
                <View style={common.row}>
                  {data.subjects
                    .filter((subject) =>
                      data.courses.some(
                        (course) =>
                          course.status === "published" &&
                          course.subjectId === subject.id,
                      ),
                    )
                    .map((subject) => (
                      <Button
                        key={subject.id}
                        variant={
                          editor.subjectId === subject.id
                            ? "primary"
                            : "secondary"
                        }
                        onPress={() =>
                          change({
                            subjectId: subject.id,
                            courseIds: [],
                            steps: [],
                          })
                        }
                      >
                        {subject.shortLabel}
                      </Button>
                    ))}
                </View>
                <Field
                  label="Date du contrôle (AAAA-MM-JJ)"
                  testID="control-date"
                  value={editor.examDate}
                  onChangeText={(examDate) => change({ examDate })}
                  placeholder="2026-11-12"
                  maxLength={10}
                />
                <AppText variant="label">Temps disponible par jour</AppText>
                <View style={common.row}>
                  {[10, 15, 20, 30].map((minutes) => (
                    <Button
                      key={minutes}
                      variant={
                        editor.dailyMinutes === minutes
                          ? "primary"
                          : "secondary"
                      }
                      onPress={() => change({ dailyMinutes: minutes })}
                    >
                      {minutes} min
                    </Button>
                  ))}
                </View>
                <Field
                  label="Autre durée en minutes"
                  keyboardType="number-pad"
                  value={String(editor.dailyMinutes)}
                  onChangeText={(value) =>
                    change({ dailyMinutes: Number(value) || 0 })
                  }
                  maxLength={3}
                />
              </Card>
              <Card style={{ flex: 1, minWidth: 280, gap: 18 }}>
                <AppText variant="heading">Chapitres au programme</AppText>
                {available.map((course) => (
                  <Pressable
                    key={course.id}
                    accessibilityRole="checkbox"
                    accessibilityLabel={course.title}
                    accessibilityState={{
                      checked: editor.courseIds.includes(course.id),
                    }}
                    testID={"control-course-" + course.id}
                    onPress={() =>
                      change({
                        courseIds: editor.courseIds.includes(course.id)
                          ? editor.courseIds.filter((id) => id !== course.id)
                          : [...editor.courseIds, course.id],
                        steps: [],
                      })
                    }
                    style={[
                      common.choice,
                      editor.courseIds.includes(course.id) && common.selected,
                    ]}
                  >
                    <AppIcon
                      name={
                        editor.courseIds.includes(course.id) ? "check" : "book"
                      }
                    />
                    <AppText style={{ flex: 1 }}>{course.title}</AppText>
                  </Pressable>
                ))}
                <AppText variant="small" color={colors.muted}>
                  La proposition suit la date et la durée choisies. Les séances
                  et leurs corrections restent sous votre contrôle.
                </AppText>
                <Button
                  icon="calendar"
                  onPress={propose}
                  disabled={!editor.courseIds.length}
                  testID="propose-plan"
                >
                  Proposer un plan
                </Button>
              </Card>
            </View>
            {!!editor.steps.length && (
              <Card style={{ gap: 20 }}>
                <View style={[common.row, { justifyContent: "space-between" }]}>
                  <AppText variant="heading">Plan de révision proposé</AppText>
                  <Badge>{editor.steps.length} séances</Badge>
                </View>
                <AppText color={colors.muted}>
                  {selected.map((course) => course.title).join(" · ")}
                </AppText>
                {editor.steps.map((step, index) => (
                  <View
                    key={step.id}
                    style={{
                      gap: 12,
                      paddingBottom: 16,
                      borderBottomWidth:
                        index < editor.steps.length - 1 ? 1 : 0,
                      borderColor: colors.border,
                    }}
                  >
                    <View style={common.row}>
                      <View style={{ flex: 1, minWidth: 160, gap: 6 }}>
                        <AppText
                          variant="small"
                          color={
                            stepIsLate(step) ? colors.orange : colors.primary
                          }
                          style={{ fontWeight: "700" }}
                        >
                          {dateLabel(step.date)} · {step.minutes} min
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
                            ? "À reprogrammer"
                            : planStepLabels[step.kind]}
                      </Badge>
                      <Button
                        variant="ghost"
                        icon="pencil"
                        onPress={() =>
                          setExpanded(expanded === step.id ? null : step.id)
                        }
                        accessibilityLabel={"Modifier la séance " + (index + 1)}
                      >
                        Modifier
                      </Button>
                    </View>
                    {expanded === step.id && (
                      <View style={{ gap: 14 }}>
                        <Field
                          label={"Titre de la séance " + (index + 1)}
                          value={step.title}
                          onChangeText={(title) =>
                            updateStep(step.id, { title })
                          }
                        />
                        <View style={common.row}>
                          <View style={{ flex: 1, minWidth: 180 }}>
                            <Field
                              label={"Date de la séance " + (index + 1)}
                              value={step.date}
                              onChangeText={(date) =>
                                updateStep(step.id, { date })
                              }
                              maxLength={10}
                            />
                          </View>
                          <View style={{ width: 130 }}>
                            <Field
                              label={"Durée de la séance " + (index + 1)}
                              value={String(step.minutes)}
                              keyboardType="number-pad"
                              onChangeText={(value) =>
                                updateStep(step.id, {
                                  minutes: Number(value) || 0,
                                })
                              }
                              maxLength={3}
                            />
                          </View>
                        </View>
                        <View style={common.row}>
                          {(
                            Object.keys(planStepLabels) as PlanStep["kind"][]
                          ).map((kind) => (
                            <Button
                              key={kind}
                              variant={
                                step.kind === kind ? "primary" : "secondary"
                              }
                              onPress={() => updateStep(step.id, { kind })}
                            >
                              {planStepLabels[kind]}
                            </Button>
                          ))}
                        </View>
                        <Button
                          variant="danger"
                          icon="trash"
                          onPress={() =>
                            change({
                              steps: editor.steps.filter(
                                (item) => item.id !== step.id,
                              ),
                            })
                          }
                        >
                          Retirer cette séance
                        </Button>
                      </View>
                    )}
                  </View>
                ))}
                <Button
                  variant="secondary"
                  icon="plus"
                  onPress={() =>
                    change({
                      steps: [
                        ...editor.steps,
                        {
                          id: localId("step"),
                          title: "Nouvelle séance",
                          date: editor.examDate,
                          kind: "practice",
                          minutes: Math.min(10, editor.dailyMinutes),
                          courseIds: [...editor.courseIds],
                        },
                      ],
                    })
                  }
                >
                  Ajouter une séance
                </Button>
                {editor.id && (
                  <View style={{ gap: 12 }}>
                    <AppText variant="heading">
                      Contrôle déplacé ou séance manquée ?
                    </AppText>
                    <Field
                      label="Nouvelle date du contrôle"
                      value={reportDate || editor.examDate}
                      onChangeText={setReportDate}
                      maxLength={10}
                    />
                    <Button variant="secondary" icon="refresh" onPress={report}>
                      Répartir les séances restantes
                    </Button>
                  </View>
                )}
                {questions.length > 0 && (
                  <Notice>
                    {questions.length} questions déjà vérifiées sont disponibles
                    pour composer l’entraînement et le contrôle blanc.
                  </Notice>
                )}
                <Button
                  variant={confirmed ? "secondary" : "ghost"}
                  icon={confirmed ? "check" : "shield"}
                  accessibilityLabel={
                    confirmed
                      ? "Relecture du plan confirmée"
                      : "Confirmer la relecture du plan"
                  }
                  onPress={() => setConfirmed(!confirmed)}
                >
                  {confirmed
                    ? "J’ai vérifié les séances et les chapitres"
                    : "Je confirme avoir vérifié les séances et les chapitres"}
                </Button>
                <View style={[common.row, { justifyContent: "flex-end" }]}>
                  <Button
                    variant="secondary"
                    icon="file"
                    onPress={() => save()}
                    testID="save-plan"
                  >
                    Enregistrer le brouillon
                  </Button>
                  <Button
                    icon="check"
                    onPress={publish}
                    disabled={!confirmed}
                    testID="publish-plan"
                  >
                    Partager le plan
                  </Button>
                </View>
              </Card>
            )}
            {error.includes("série d’exercices") && (
              <Button
                icon="pencil"
                onPress={() => router.push("/parent/exercises")}
              >
                Préparer les exercices des chapitres
              </Button>
            )}
          </>
        )}
      </View>
    </StudyWorkspace>
  );
}
