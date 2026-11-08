import { useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Pressable, View, useWindowDimensions } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
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
import type {
  AiJob,
  ExerciseSeries,
  Question,
  QuestionType,
} from "@/domain/model";
import { questionError } from "@/domain/learning";
import { useLearning } from "@/state/learning-store";
import { useLocalDraft } from "@/features/planning/use-local-draft";
import {
  Field,
  LoadingParent,
  Notice,
  ParentLayout,
  localId,
  parentStyles as s,
} from "./shared";

const formats: { id: QuestionType; label: string }[] = [
  { id: "single-choice", label: "QCM" },
  { id: "true-false", label: "Vrai / faux" },
  { id: "fill-blank", label: "Texte à trous" },
  { id: "short-answer", label: "Réponse courte" },
  { id: "problem", label: "Problème" },
];
const levels = [
  { id: "discovery", label: "Découverte" },
  { id: "practice", label: "Entraînement" },
  { id: "challenge", label: "Défi" },
] as const;
interface QuestionForm {
  type: QuestionType;
  prompt: string;
  choices: string[];
  correct: number;
  expectedAnswers: string;
  tolerance: string;
  rubric: string;
  explanation: string;
  hint: string;
  concept: string;
}
interface Editor {
  draftId: string;
  title: string;
  courseIds: string[];
  level: ExerciseSeries["level"];
  dueDate: string;
  types: QuestionType[];
  count: number;
  questions: Question[];
  form: QuestionForm;
  editingId: string | null;
}
const emptyQuestion = (): QuestionForm => ({
  type: "single-choice",
  prompt: "",
  choices: ["", "", "", ""],
  correct: 0,
  expectedAnswers: "",
  tolerance: "",
  rubric: "",
  explanation: "",
  hint: "",
  concept: "",
});
const emptyEditor = (courseId?: string): Editor => ({
  draftId: "",
  title: "",
  courseIds: courseId ? [courseId] : [],
  level: "practice",
  dueDate: "",
  types: ["single-choice"],
  count: 10,
  questions: [],
  form: emptyQuestion(),
  editingId: null,
});
function fromSeries(series: ExerciseSeries): Editor {
  return {
    ...emptyEditor(),
    draftId: series.id,
    title: series.title,
    courseIds: series.courseIds,
    level: series.level,
    dueDate: series.dueDate?.slice(0, 10) ?? "",
    questions: series.questions,
    types: [
      ...new Set(
        series.questions.map((question) => question.type ?? "single-choice"),
      ),
    ] as QuestionType[],
  };
}
function validEditor(value: unknown): value is Editor {
  if (!value || typeof value !== "object") return false;
  const item = value as Editor;
  return (
    typeof item.draftId === "string" &&
    typeof item.title === "string" &&
    typeof item.dueDate === "string" &&
    Array.isArray(item.courseIds) &&
    item.courseIds.every((id) => typeof id === "string") &&
    levels.some((level) => level.id === item.level) &&
    [5, 10, 15, 20].includes(item.count) &&
    Array.isArray(item.types) &&
    item.types.every((type) => formats.some((format) => format.id === type)) &&
    Array.isArray(item.questions) &&
    item.questions.every(
      (question) =>
        !!question &&
        typeof question.id === "string" &&
        typeof question.prompt === "string" &&
        Array.isArray(question.choices) &&
        !questionError(question),
    ) &&
    !!item.form &&
    formats.some((format) => format.id === item.form.type) &&
    [
      "prompt",
      "expectedAnswers",
      "tolerance",
      "rubric",
      "explanation",
      "hint",
      "concept",
    ].every(
      (key) => typeof item.form[key as keyof QuestionForm] === "string",
    ) &&
    Array.isArray(item.form.choices) &&
    item.form.choices.every((choice) => typeof choice === "string") &&
    typeof item.form.correct === "number" &&
    (item.editingId === null || typeof item.editingId === "string")
  );
}
const validDate = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString().slice(0, 10) === value;
const formHasContent = (form: QuestionForm) =>
  !!(
    form.prompt.trim() ||
    form.explanation.trim() ||
    form.expectedAnswers.trim() ||
    form.hint.trim() ||
    form.concept.trim() ||
    form.rubric.trim() ||
    (form.type === "single-choice" &&
      form.choices.some((choice) => choice.trim()))
  );
function toQuestion(form: QuestionForm, original?: Question): Question {
  const textual = !["single-choice", "true-false"].includes(form.type);
  const labels = form.type === "true-false" ? ["Vrai", "Faux"] : form.choices;
  const choices = textual
    ? []
    : labels
        .map((label, index) => ({
          id: original?.choices[index]?.id || "choice-" + (index + 1),
          label: label.trim(),
          index,
        }))
        .filter((choice) => choice.label);
  const question: Question = {
    ...original,
    id: original?.id ?? localId("question"),
    type: form.type,
    prompt: form.prompt.trim(),
    choices: choices.map(({ id, label }) => ({ id, label })),
    correctChoiceId: textual
      ? ""
      : (choices.find((choice) => choice.index === form.correct)?.id ?? ""),
    expectedAnswers: textual
      ? [
          ...new Set(
            form.expectedAnswers
              .split("\n")
              .map((answer) => answer.trim())
              .filter(Boolean),
          ),
        ]
      : undefined,
    tolerance:
      textual && form.tolerance.trim()
        ? Number(form.tolerance.replace(",", "."))
        : undefined,
    rubric: form.rubric.trim() || undefined,
    explanation: form.explanation.trim(),
    hint: form.hint.trim(),
    concept: form.concept.trim() || form.prompt.trim(),
  };
  const error = questionError(question);
  if (error) throw new Error(error);
  return question;
}
export function PrepareExercisesScreen() {
  const data = useLearning();
  const router = useRouter();
  const params = useLocalSearchParams<{
    draftId?: string;
    courseId?: string;
  }>();
  const { width } = useWindowDimensions();
  const publishedCourses = data.courses.filter(
    (course) => course.status === "published",
  );
  const requestedId = typeof params.draftId === "string" ? params.draftId : "";
  const requestedSeries = data.series.find(
    (series) => series.id === requestedId,
  );
  const initialCourse =
    publishedCourses.find((course) => course.id === params.courseId) ??
    publishedCourses[0];
  const editorKey = `revizo.exercise-editor.${data.activeProfileId || "demo"}`;
  const [editor, setEditor, local] = useLocalDraft<Editor>(
    editorKey,
    requestedSeries
      ? fromSeries(requestedSeries)
      : emptyEditor(initialCourse?.id),
    validEditor,
  );
  const editorRef = useRef(editor);
  editorRef.current = editor;
  const draftIdRef = useRef(editor.draftId);
  draftIdRef.current = editor.draftId;
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [preview, setPreview] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [job, setJob] = useState<AiJob | null>(null);
  const currentSeries = data.series.find(
    (series) => series.id === editor.draftId,
  );
  const selectedCourses = publishedCourses.filter((course) =>
    editor.courseIds.includes(course.id),
  );
  const subjectId =
    selectedCourses[0]?.subjectId ?? initialCourse?.subjectId ?? "maths";
  const published = currentSeries?.status === "published";
  function persistLocal(next: Editor) {
    void AsyncStorage.setItem(editorKey, JSON.stringify(next)).catch(() =>
      setError(
        "La saisie n’a pas pu être conservée sur cet appareil. Gardez cet écran ouvert.",
      ),
    );
  }
  function loadSeries(series: ExerciseSeries) {
    const next = fromSeries(series);
    editorRef.current = next;
    draftIdRef.current = series.id;
    setEditor(next);
    persistLocal(next);
    setPreview(false);
    setConfirmed(false);
    setError("");
    setNotice("");
  }
  useEffect(() => {
    if (!data.isReady || !local.ready) return;
    if (requestedId && requestedId !== editorRef.current.draftId) {
      const series = data.series.find((item) => item.id === requestedId);
      if (series) loadSeries(series);
    }
  }, [data.isReady, local.ready, requestedId, data.series, data.courses]);
  function saveEditor(next: Editor, persist = true) {
    if (persist && (next.title.trim() || next.questions.length)) {
      const existing = data.series.find(
        (series) => series.id === (draftIdRef.current || next.draftId),
      );
      const selected = data.courses.filter((course) =>
        next.courseIds.includes(course.id),
      );
      const input = {
        title: next.title.trim(),
        courseIds: next.courseIds,
        subjectId: selected[0]?.subjectId ?? subjectId,
        level: next.level,
        dueDate: validDate(next.dueDate) ? next.dueDate : undefined,
        questions: next.questions,
      };
      if (existing?.status === "draft") {
        next = { ...next, draftId: existing.id };
        data.updateSeries(existing.id, input);
      } else if (!existing) {
        const id = data.addSeries(input);
        next = { ...next, draftId: id };
        draftIdRef.current = id;
        router.setParams({ draftId: id });
      }
    }
    editorRef.current = next;
    draftIdRef.current = next.draftId;
    setEditor(next);
    persistLocal(next);
    setConfirmed(false);
    setError("");
    setNotice("");
    return next;
  }
  function update(update: Partial<Editor>, persist = true) {
    return saveEditor({ ...editorRef.current, ...update }, persist);
  }
  function updateForm(updateForm: Partial<QuestionForm>) {
    update({ form: { ...editorRef.current.form, ...updateForm } }, false);
  }
  function selectCourse(id: string) {
    const course = publishedCourses.find((item) => item.id === id);
    if (!course) return;
    if (editor.courseIds.includes(id)) {
      update({ courseIds: editor.courseIds.filter((value) => value !== id) });
      return;
    }
    if (selectedCourses.length && course.subjectId !== subjectId) {
      setError(
        "Choisissez des cours d’une même matière. Retirez les cours cochés avant de changer de matière.",
      );
      return;
    }
    update({ courseIds: [...editor.courseIds, id] });
  }
  function addQuestion() {
    try {
      const original = editor.questions.find(
        (question) => question.id === editor.editingId,
      );
      const question = toQuestion(editor.form, original);
      update({
        questions: original
          ? editor.questions.map((item) =>
              item.id === original.id ? question : item,
            )
          : [...editor.questions, question],
        form: emptyQuestion(),
        editingId: null,
      });
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Vérifiez la question et sa correction.",
      );
    }
  }
  function editQuestion(question: Question) {
    update(
      {
        editingId: question.id,
        form: {
          type: question.type ?? "single-choice",
          prompt: question.prompt,
          choices: [
            ...question.choices.map((choice) => choice.label),
            ...Array(Math.max(0, 4 - question.choices.length)).fill(""),
          ],
          correct: Math.max(
            0,
            question.choices.findIndex(
              (choice) => choice.id === question.correctChoiceId,
            ),
          ),
          expectedAnswers: question.expectedAnswers?.join("\n") ?? "",
          tolerance:
            question.tolerance === undefined ? "" : String(question.tolerance),
          rubric: question.rubric ?? "",
          explanation: question.explanation,
          hint: question.hint,
          concept: question.concept,
        },
      },
      false,
    );
    setPreview(false);
  }
  function validateSettings() {
    if (!editor.title.trim()) throw new Error("Donnez un titre à la série.");
    if (
      !editor.courseIds.length ||
      selectedCourses.length !== editor.courseIds.length
    )
      throw new Error("Choisissez au moins un cours publié.");
    if (selectedCourses.some((course) => course.subjectId !== subjectId))
      throw new Error(
        "Les cours de la série doivent appartenir à une même matière.",
      );
    if (editor.dueDate && !validDate(editor.dueDate))
      throw new Error(
        "Indiquez l’échéance au format AAAA-MM-JJ, ou laissez-la vide.",
      );
  }
  function openPreview() {
    try {
      validateSettings();
      if (!editor.questions.length)
        throw new Error("Ajoutez au moins une question à la série.");
      if (formHasContent(editor.form))
        throw new Error(
          "Ajoutez la question en cours à la série ou effacez sa saisie avant la relecture.",
        );
      for (const question of editor.questions) {
        const error = questionError(question);
        if (error) throw new Error(error);
      }
      saveEditor(editor);
      setPreview(true);
      setError("");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Vérifiez la série avant la relecture.",
      );
    }
  }
  function publish() {
    try {
      validateSettings();
      if (!confirmed)
        throw new Error(
          "Confirmez la relecture des questions et des corrections.",
        );
      const next = saveEditor(editor);
      const result = data.publishSeries(next.draftId);
      if (!result.ok)
        throw new Error(
          result.error ?? "La série ne peut pas encore être publiée.",
        );
      setError("");
      setPreview(false);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "La publication a échoué. Le brouillon est conservé.",
      );
    }
  }
  async function generate() {
    if (busyRef.current) return;
    try {
      validateSettings();
      if (formHasContent(editor.form))
        throw new Error(
          "Ajoutez la question en cours à sa série ou effacez sa saisie avant de générer un nouveau brouillon.",
        );
      if (!editor.types.length)
        throw new Error("Choisissez au moins un format de question.");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Vérifiez les options de génération.",
      );
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError("");
    setJob(null);
    try {
      const id = await data.generateExercises(
        {
          title: editor.title.trim(),
          courseIds: editor.courseIds,
          subjectId,
          level: editor.level,
          count: editor.count,
          types: editor.types,
          dueDate: editor.dueDate || undefined,
        },
        setJob,
      );
      router.setParams({ draftId: id });
      setNotice(
        "La série générée est un brouillon. Relisez chaque réponse et chaque correction avant la publication.",
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "La génération a été interrompue. Les questions écrites sont conservées.",
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  function reset() {
    const next = emptyEditor(initialCourse?.id);
    editorRef.current = next;
    draftIdRef.current = "";
    setEditor(next);
    persistLocal(next);
    setPreview(false);
    setConfirmed(false);
    setError("");
    setNotice("");
    setJob(null);
    router.setParams({ draftId: "", courseId: "" });
  }
  if (!data.isReady || !local.ready)
    return <LoadingParent active="exercises" />;
  if (!publishedCourses.length)
    return (
      <ParentLayout active="exercises">
        <PageHeading
          title="Préparer des exercices"
          description="Les séries s’appuient sur les cours que vous avez vérifiés."
        />
        <EmptyState
          title="Publiez d’abord une fiche"
          description={`Un cours publié est nécessaire pour préparer une série pour ${data.childName}.`}
        >
          <Button icon="plus" onPress={() => router.push("/parent/import")}>
            Ajouter un cours
          </Button>
        </EmptyState>
      </ParentLayout>
    );
  if (published)
    return (
      <ParentLayout active="exercises">
        <View testID="parent-exercises" style={{ gap: 26 }}>
          <PageHeading
            eyebrow="Une nouvelle occasion de s’entraîner"
            title="La série est prête !"
          />
          <Card style={{ gap: 20 }}>
            <AppIcon name="check" color={colors.green} size={36} />
            <AppText variant="heading">{currentSeries.title}</AppText>
            <AppText>
              {currentSeries.questions.length} questions ·{" "}
              {selectedCourses.map((course) => course.title).join(" · ")}
            </AppText>
            <Notice success>
              {data.childName} trouvera cette série dans « Mes exercices ».
            </Notice>
            <View style={s.row}>
              <Button icon="plus" onPress={reset}>
                Préparer une autre série
              </Button>
              <Button variant="ghost" onPress={() => router.replace("/parent")}>
                Tableau de bord
              </Button>
            </View>
          </Card>
        </View>
      </ParentLayout>
    );
  return (
    <ParentLayout active="exercises">
      <View testID="parent-exercises" style={{ gap: 26 }}>
        <PageHeading
          eyebrow="Des exercices qui suivent son cours"
          title={preview ? "Relire la série" : "Préparer des exercices"}
          description={
            preview
              ? "Vérifiez les énoncés, les réponses acceptées et les corrections avant de partager."
              : "Associez plusieurs cours d’une même matière et préparez les questions avec l’IA ou à la main."
          }
          action={
            <Badge>
              {editor.questions.length} question
              {editor.questions.length > 1 ? "s" : ""}
            </Badge>
          }
        />
        {local.error && <Notice error>{local.error}</Notice>}
        {error && (
          <View testID="ai-exercises-error">
            <Notice error>{error}</Notice>
          </View>
        )}
        {notice && <Notice success>{notice}</Notice>}
        {!preview && (
          <>
            <Card style={{ gap: 16 }}>
              <View style={[s.row, { justifyContent: "space-between" }]}>
                <AppText variant="heading">Vos séries en préparation</AppText>
                <Button
                  variant="ghost"
                  icon="plus"
                  onPress={reset}
                  disabled={busy}
                  testID="ai-new-series"
                >
                  Nouvelle série
                </Button>
              </View>
              <View style={s.row}>
                {data.series
                  .filter((series) => series.status === "draft")
                  .map((series) => (
                    <Button
                      key={series.id}
                      variant={
                        editor.draftId === series.id ? "primary" : "secondary"
                      }
                      disabled={busy}
                      onPress={() => {
                        loadSeries(series);
                        router.setParams({ draftId: series.id });
                      }}
                      testID={"ai-series-draft-" + series.id}
                    >
                      {series.title || "Série sans titre"} ·{" "}
                      {series.questions.length} questions
                    </Button>
                  ))}
                {!data.series.some((series) => series.status === "draft") && (
                  <AppText color={colors.muted}>
                    Vos séries sont conservées en brouillon pendant la
                    préparation.
                  </AppText>
                )}
              </View>
            </Card>
            <View
              style={[
                s.grid,
                {
                  flexDirection: width >= 1150 ? "row" : "column",
                  alignItems: "flex-start",
                },
              ]}
            >
              <Card style={[s.column, { alignSelf: "stretch" }]}>
                <AppText variant="heading">1. Les cours et la série</AppText>
                <AppText color={colors.muted}>
                  Cochez les cours d’une même matière à travailler ensemble.
                </AppText>
                <View style={{ gap: 12 }}>
                  {publishedCourses.map((course) => {
                    const subject = data.subjects.find(
                      (item) => item.id === course.subjectId,
                    );
                    const selected = editor.courseIds.includes(course.id);
                    return (
                      <Pressable
                        key={course.id}
                        accessibilityRole="checkbox"
                        aria-checked={selected}
                        accessibilityLabel={course.title}
                        accessibilityState={{ checked: selected }}
                        onPress={() => selectCourse(course.id)}
                        disabled={busy}
                        testID={"ai-exercise-course-" + course.id}
                        style={[s.choice, selected && s.selected]}
                      >
                        <AppIcon
                          name={selected ? "check" : (subject?.icon ?? "book")}
                          color={selected ? colors.primary : subject?.color}
                        />
                        <View style={{ flex: 1, gap: 3 }}>
                          <AppText variant="small" color={subject?.color}>
                            {subject?.title}
                          </AppText>
                          <AppText variant="label">{course.title}</AppText>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
                <Field
                  label="Titre de la série"
                  testID="series-title"
                  value={editor.title}
                  onChangeText={(title) => update({ title })}
                  editable={!busy}
                  maxLength={120}
                />
                <AppText variant="label">Niveau</AppText>
                <View style={s.row}>
                  {levels.map((level) => (
                    <Button
                      key={level.id}
                      variant={
                        editor.level === level.id ? "primary" : "secondary"
                      }
                      onPress={() => update({ level: level.id })}
                      disabled={busy}
                      testID={"ai-exercise-level-" + level.id}
                    >
                      {level.label}
                    </Button>
                  ))}
                </View>
                <Field
                  label="Échéance de la série"
                  optional
                  testID="ai-exercise-due-date"
                  value={editor.dueDate}
                  onChangeText={(dueDate) => update({ dueDate })}
                  editable={!busy}
                  placeholder="AAAA-MM-JJ"
                  maxLength={10}
                  autoCorrect={false}
                />
                <AppText variant="small" color={colors.muted}>
                  Les questions ajoutées et les réglages sont conservés en
                  brouillon. La question en cours de saisie reste aussi sur cet
                  appareil.
                </AppText>
              </Card>
              <Card
                style={[s.column, { flex: 1.2, alignSelf: "stretch" }]}
                testID="ai-exercises-panel"
              >
                <View style={s.row}>
                  <AppIcon name="sparkles" />
                  <AppText variant="heading">
                    2. Générer une série avec l’IA
                  </AppText>
                </View>
                {data.isDemo ? (
                  <>
                    <Notice>
                      Connectez votre espace familial pour utiliser la
                      génération IA. La préparation manuelle ci-dessous
                      fonctionne dans cette démonstration.
                    </Notice>
                    <Button
                      variant="secondary"
                      icon="lock"
                      onPress={() => router.push("/auth?target=parent")}
                    >
                      Connexion familiale
                    </Button>
                  </>
                ) : (
                  <>
                    <AppText color={colors.muted}>
                      Une nouvelle série en brouillon sera créée. Vos questions
                      déjà rédigées restent dans leur brouillon.
                    </AppText>
                    <AppText variant="label">Formats à inclure</AppText>
                    <View style={s.row}>
                      {formats.map((format) => (
                        <Button
                          key={format.id}
                          variant={
                            editor.types.includes(format.id)
                              ? "primary"
                              : "secondary"
                          }
                          disabled={busy}
                          onPress={() =>
                            update(
                              {
                                types: editor.types.includes(format.id)
                                  ? editor.types.filter(
                                      (type) => type !== format.id,
                                    )
                                  : [...editor.types, format.id],
                              },
                              false,
                            )
                          }
                          testID={"ai-format-" + format.id}
                        >
                          {format.label}
                        </Button>
                      ))}
                    </View>
                    <AppText variant="label">Nombre de questions</AppText>
                    <View style={s.row}>
                      {[5, 10, 15, 20].map((count) => (
                        <Button
                          key={count}
                          variant={
                            editor.count === count ? "primary" : "secondary"
                          }
                          disabled={busy}
                          onPress={() => update({ count }, false)}
                          testID={"ai-count-" + count}
                        >
                          {count}
                        </Button>
                      ))}
                    </View>
                    <Button
                      icon="sparkles"
                      onPress={() => void generate()}
                      disabled={busy || !data.serverAvailable}
                      testID="ai-generate-exercises"
                    >
                      {busy
                        ? "Génération en cours…"
                        : "Générer une nouvelle série"}
                    </Button>
                    {!data.serverAvailable && (
                      <Notice>
                        La connexion au serveur est nécessaire pour la
                        génération.
                      </Notice>
                    )}
                  </>
                )}
                {job && (
                  <Card
                    inset
                    style={{ gap: 10 }}
                    testID="ai-exercises-progress"
                  >
                    <Badge
                      tone={job.status === "succeeded" ? "green" : "primary"}
                    >
                      {job.status === "queued"
                        ? "En attente"
                        : job.status === "running"
                          ? "En cours"
                          : job.status === "succeeded"
                            ? "Prête à relire"
                            : "À relancer"}
                    </Badge>
                    <AppText variant="label">
                      {job.message || job.stage || "Préparation sur le serveur"}
                    </AppText>
                  </Card>
                )}
                <Button
                  variant="ghost"
                  icon="clock"
                  onPress={() => router.push("/parent/preparations")}
                >
                  Retrouver les préparations en cours
                </Button>
              </Card>
            </View>
            <Card style={{ gap: 22 }}>
              <View style={s.row}>
                <AppText variant="heading">
                  3.{" "}
                  {editor.editingId
                    ? "Modifier une question"
                    : "Ajouter une question à la main"}
                </AppText>
                <Badge>
                  {
                    formats.find((format) => format.id === editor.form.type)
                      ?.label
                  }
                </Badge>
              </View>
              <View style={s.row}>
                {formats.map((format) => (
                  <Button
                    key={format.id}
                    variant={
                      editor.form.type === format.id ? "primary" : "secondary"
                    }
                    disabled={busy}
                    onPress={() => updateForm({ type: format.id, correct: 0 })}
                    testID={"question-type-" + format.id}
                  >
                    {format.label}
                  </Button>
                ))}
              </View>
              <Field
                label="Question"
                testID="question-prompt"
                multiline
                value={editor.form.prompt}
                onChangeText={(prompt) => updateForm({ prompt })}
                editable={!busy}
                maxLength={4000}
                placeholder={
                  editor.form.type === "fill-blank"
                    ? "Complète : la somme de deux nombres opposés vaut ___."
                    : "Écrivez un énoncé clair et complet."
                }
              />
              {["single-choice", "true-false"].includes(editor.form.type) ? (
                <>
                  <AppText variant="small" color={colors.muted}>
                    Cochez la bonne réponse.
                    {editor.form.type === "single-choice"
                      ? " Renseignez de 2 à 4 propositions différentes."
                      : ""}
                  </AppText>
                  <View style={{ gap: 12 }}>
                    {(editor.form.type === "true-false"
                      ? ["Vrai", "Faux"]
                      : editor.form.choices
                    ).map((choice, index) => (
                      <View
                        key={index}
                        style={{
                          flexDirection: "row",
                          gap: 12,
                          alignItems: "center",
                        }}
                      >
                        <Pressable
                          accessibilityRole="radio"
                          aria-checked={editor.form.correct === index}
                          accessibilityLabel={
                            "La réponse " +
                            String.fromCharCode(65 + index) +
                            " est correcte"
                          }
                          testID={"correct-choice-" + index}
                          accessibilityState={{
                            checked: editor.form.correct === index,
                          }}
                          onPress={() => updateForm({ correct: index })}
                          disabled={busy}
                          style={[
                            s.choice,
                            {
                              width: 50,
                              height: 50,
                              padding: 0,
                              justifyContent: "center",
                            },
                            editor.form.correct === index && s.selected,
                          ]}
                        >
                          {editor.form.correct === index ? (
                            <AppIcon name="check" />
                          ) : (
                            <AppText variant="label">
                              {String.fromCharCode(65 + index)}
                            </AppText>
                          )}
                        </Pressable>
                        <View style={{ flex: 1 }}>
                          <Field
                            label={"Réponse " + String.fromCharCode(65 + index)}
                            testID={"choice-input-" + index}
                            optional={index > 1}
                            value={choice}
                            editable={
                              !busy && editor.form.type !== "true-false"
                            }
                            onChangeText={(value) =>
                              updateForm({
                                choices: editor.form.choices.map(
                                  (item, choiceIndex) =>
                                    choiceIndex === index ? value : item,
                                ),
                              })
                            }
                            maxLength={1000}
                          />
                        </View>
                      </View>
                    ))}
                  </View>
                </>
              ) : (
                <>
                  <Field
                    label="Réponses acceptées"
                    testID="question-expected-answers"
                    multiline
                    value={editor.form.expectedAnswers}
                    onChangeText={(expectedAnswers) =>
                      updateForm({ expectedAnswers })
                    }
                    editable={!busy}
                    placeholder="Une réponse par ligne. Ajoutez les formulations équivalentes acceptées."
                    maxLength={6000}
                  />
                  <View style={s.grid}>
                    <View style={{ flex: 1, minWidth: 220 }}>
                      <Field
                        label="Tolérance numérique"
                        optional
                        value={editor.form.tolerance}
                        onChangeText={(tolerance) => updateForm({ tolerance })}
                        editable={!busy}
                        keyboardType="decimal-pad"
                        testID="question-tolerance"
                        placeholder="Par exemple : 0,01"
                        maxLength={20}
                      />
                    </View>
                    <View style={{ flex: 2, minWidth: 220 }}>
                      <Field
                        label="Critères de réussite"
                        optional
                        value={editor.form.rubric}
                        onChangeText={(rubric) => updateForm({ rubric })}
                        editable={!busy}
                        multiline
                        testID="question-rubric"
                        maxLength={2000}
                      />
                    </View>
                  </View>
                  <AppText variant="small" color={colors.muted}>
                    La correction automatique compare les réponses acceptées.
                    Les critères expliquent le raisonnement attendu.
                  </AppText>
                </>
              )}
              <Field
                label="Explication de la correction"
                testID="question-explanation"
                multiline
                value={editor.form.explanation}
                onChangeText={(explanation) => updateForm({ explanation })}
                editable={!busy}
                maxLength={5000}
              />
              <View style={s.grid}>
                <View style={{ flex: 1, minWidth: 220 }}>
                  <Field
                    label="Indice"
                    optional
                    testID="question-hint"
                    value={editor.form.hint}
                    onChangeText={(hint) => updateForm({ hint })}
                    editable={!busy}
                    multiline
                    maxLength={2000}
                  />
                </View>
                <View style={{ flex: 1, minWidth: 220 }}>
                  <Field
                    label="Notion travaillée"
                    optional
                    testID="question-concept"
                    value={editor.form.concept}
                    onChangeText={(concept) => updateForm({ concept })}
                    editable={!busy}
                    maxLength={300}
                  />
                </View>
              </View>
              <View style={[s.row, { justifyContent: "flex-end" }]}>
                <Button
                  variant="ghost"
                  disabled={busy}
                  onPress={() =>
                    update({ form: emptyQuestion(), editingId: null }, false)
                  }
                >
                  Effacer la saisie
                </Button>
                <Button
                  icon={editor.editingId ? "check" : "plus"}
                  onPress={addQuestion}
                  disabled={busy}
                  testID="add-question"
                >
                  {editor.editingId
                    ? "Enregistrer la question"
                    : "Ajouter à la série"}
                </Button>
              </View>
            </Card>
          </>
        )}
        <Card style={{ gap: 20 }}>
          <View style={[s.row, { justifyContent: "space-between" }]}>
            <AppText variant="heading">
              {preview ? editor.title : "Les questions de la série"}
            </AppText>
            <Badge>{editor.questions.length}</Badge>
          </View>
          {preview && (
            <AppText color={colors.muted}>
              {selectedCourses.map((course) => course.title).join(" · ")} ·{" "}
              {levels.find((level) => level.id === editor.level)?.label}
              {editor.dueDate ? " · Pour le " + editor.dueDate : ""}
            </AppText>
          )}
          {editor.questions.length ? (
            editor.questions.map((question, index) => (
              <Card
                key={question.id}
                inset
                style={{ gap: 16 }}
                testID={"ai-question-" + index}
              >
                <View style={s.row}>
                  <Badge>
                    {index + 1} ·{" "}
                    {
                      formats.find(
                        (format) =>
                          format.id === (question.type ?? "single-choice"),
                      )?.label
                    }
                  </Badge>
                  <AppText variant="heading" style={{ flex: 1, minWidth: 180 }}>
                    {question.prompt}
                  </AppText>
                  <Button
                    variant="ghost"
                    icon="pencil"
                    disabled={busy}
                    onPress={() => editQuestion(question)}
                    accessibilityLabel={"Modifier la question " + (index + 1)}
                  >
                    Modifier
                  </Button>
                  {!preview && (
                    <Button
                      variant="danger"
                      icon="trash"
                      disabled={busy}
                      onPress={() =>
                        update({
                          questions: editor.questions.filter(
                            (item) => item.id !== question.id,
                          ),
                          ...(editor.editingId === question.id
                            ? { form: emptyQuestion(), editingId: null }
                            : {}),
                        })
                      }
                      accessibilityLabel={"Retirer la question " + (index + 1)}
                    >
                      Retirer
                    </Button>
                  )}
                </View>
                {preview && (
                  <>
                    {question.choices.map((choice) => (
                      <View
                        key={choice.id}
                        style={[
                          s.choice,
                          choice.id === question.correctChoiceId && {
                            borderColor: colors.green,
                          },
                        ]}
                      >
                        <AppIcon
                          name={
                            choice.id === question.correctChoiceId
                              ? "check"
                              : "chevron-right"
                          }
                          color={
                            choice.id === question.correctChoiceId
                              ? colors.green
                              : colors.muted
                          }
                        />
                        <AppText style={{ flex: 1 }}>{choice.label}</AppText>
                        {choice.id === question.correctChoiceId && (
                          <Badge tone="green">Bonne réponse</Badge>
                        )}
                      </View>
                    ))}
                    {!!question.expectedAnswers?.length && (
                      <AppText color={colors.green}>
                        Réponses acceptées :{" "}
                        {question.expectedAnswers.join(" · ")}
                        {question.tolerance !== undefined
                          ? ` · Tolérance : ${question.tolerance}`
                          : ""}
                      </AppText>
                    )}
                    <AppText color={colors.green}>
                      {question.explanation}
                    </AppText>
                    {question.hint && (
                      <AppText variant="small" color={colors.muted}>
                        Indice : {question.hint}
                      </AppText>
                    )}
                    <AppText variant="small" color={colors.muted}>
                      Notion : {question.concept}
                    </AppText>
                    {question.rubric && (
                      <AppText variant="small" color={colors.muted}>
                        Critères : {question.rubric}
                      </AppText>
                    )}
                  </>
                )}
              </Card>
            ))
          ) : (
            <AppText color={colors.muted}>
              Les questions ajoutées ou générées apparaîtront ici. Elles restent
              dans votre espace jusqu’à la publication.
            </AppText>
          )}
          {!preview && (
            <View style={[s.row, { justifyContent: "flex-end" }]}>
              <Button
                variant="secondary"
                icon="save"
                disabled={busy}
                onPress={() => {
                  saveEditor(editor);
                  setNotice(
                    "Brouillon enregistré. Vous pourrez le reprendre depuis cette page ou le tableau de bord.",
                  );
                }}
                testID="save-series-draft"
              >
                Enregistrer le brouillon
              </Button>
              <Button
                icon="arrow-right"
                onPress={openPreview}
                disabled={
                  busy || !editor.questions.length || !editor.title.trim()
                }
                testID="preview-series"
              >
                Relire avant publication
              </Button>
            </View>
          )}
        </Card>
        {preview && (
          <Card style={{ gap: 18 }}>
            <Button
              variant={confirmed ? "secondary" : "ghost"}
              icon={confirmed ? "check" : "shield"}
              accessibilityLabel={
                confirmed
                  ? "Relecture des exercices confirmée"
                  : "Confirmer la relecture des exercices"
              }
              onPress={() => setConfirmed(!confirmed)}
              testID="ai-series-confirm-review"
            >
              {confirmed
                ? "J’ai relu les questions et leurs corrections"
                : "Je confirme avoir relu les questions et leurs corrections"}
            </Button>
            <View style={[s.row, { justifyContent: "flex-end" }]}>
              <Button
                variant="secondary"
                icon="arrow-left"
                onPress={() => setPreview(false)}
              >
                Revenir à la préparation
              </Button>
              <Button
                icon="check"
                disabled={!confirmed || busy}
                onPress={publish}
                testID="publish-series"
              >
                Publier pour {data.childName}
              </Button>
            </View>
          </Card>
        )}
      </View>
    </ParentLayout>
  );
}
