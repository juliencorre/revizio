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
} from "@/components/ui";
import { colors } from "@/theme";
import type { ExerciseSeries, Question } from "@/domain/model";
import { useLearning } from "@/state/learning-store";
import {
  Field,
  LoadingParent,
  Notice,
  ParentLayout,
  localId,
  parentStyles as s,
} from "./shared";
interface QuestionForm {
  prompt: string;
  choices: string[];
  correct: number;
  explanation: string;
  hint: string;
  concept: string;
}
function emptyQuestion(): QuestionForm {
  return {
    prompt: "",
    choices: ["", "", "", ""],
    correct: 0,
    explanation: "",
    hint: "",
    concept: "",
  };
}
function toQuestion(form: QuestionForm): {
  question?: Question;
  error?: string;
} {
  if (!form.prompt.trim()) return { error: "Écrivez la question." };
  const filled = form.choices
    .map((label, index) => ({
      id: "choice-" + (index + 1),
      label: label.trim(),
      index,
    }))
    .filter((choice) => choice.label);
  if (filled.length < 2)
    return { error: "Ajoutez au moins deux réponses possibles." };
  if (
    new Set(filled.map((choice) => choice.label.toLocaleLowerCase())).size !==
    filled.length
  )
    return { error: "Les réponses proposées doivent être différentes." };
  if (!filled.some((choice) => choice.index === form.correct))
    return {
      error: "Choisissez la bonne réponse parmi les réponses renseignées.",
    };
  if (!form.explanation.trim())
    return {
      error: "Ajoutez une explication pour aider Alex après sa réponse.",
    };
  return {
    question: {
      id: localId("question"),
      prompt: form.prompt.trim(),
      choices: filled.map(({ id, label }) => ({ id, label })),
      correctChoiceId: "choice-" + (form.correct + 1),
      explanation: form.explanation.trim(),
      hint: form.hint.trim(),
      concept: form.concept.trim() || form.prompt.trim(),
    },
  };
}
export function PrepareExercisesScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { courses, subjects, series, addSeries, publishSeries, isReady } =
    useLearning();
  const publishedCourses = courses.filter(
    (course) => course.status === "published",
  );
  const [courseId, setCourseId] = useState("");
  const [title, setTitle] = useState("");
  const [level, setLevel] = useState<ExerciseSeries["level"]>("practice");
  const [form, setForm] = useState<QuestionForm>(emptyQuestion());
  const [questions, setQuestions] = useState<Question[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [publishedId, setPublishedId] = useState<string | null>(null);
  const selectedCourse =
    publishedCourses.find((course) => course.id === courseId) ??
    publishedCourses[0];
  if (!isReady) return <LoadingParent active="exercises" />;
  function updateForm(update: Partial<QuestionForm>) {
    setForm((current) => ({ ...current, ...update }));
    setError("");
  }
  function addQuestion() {
    const result = toQuestion(form);
    if (!result.question) {
      setError(result.error ?? "Vérifiez la question.");
      return;
    }
    setQuestions((current) =>
      editingIndex === null
        ? [...current, result.question!]
        : current.map((question, index) =>
            index === editingIndex
              ? { ...result.question!, id: question.id }
              : question,
          ),
    );
    setForm(emptyQuestion());
    setEditingIndex(null);
    setError("");
    setConfirmed(false);
  }
  function editQuestion(index: number) {
    const question = questions[index];
    setForm({
      prompt: question.prompt,
      choices: [
        ...question.choices.map((choice) => choice.label),
        ...Array(4 - question.choices.length).fill(""),
      ],
      correct: question.choices.findIndex(
        (choice) => choice.id === question.correctChoiceId,
      ),
      explanation: question.explanation,
      hint: question.hint,
      concept: question.concept,
    });
    setEditingIndex(index);
    setPreview(false);
    setError("");
  }
  function openPreview() {
    if (!title.trim()) {
      setError("Donnez un titre à la série.");
      return;
    }
    if (!selectedCourse) {
      setError("Choisissez un cours publié.");
      return;
    }
    if (!questions.length) {
      setError("Ajoutez au moins une question à la série.");
      return;
    }
    if (
      form.prompt.trim() ||
      form.choices.some((choice) => choice.trim()) ||
      form.explanation.trim()
    ) {
      setError(
        "Ajoutez la question en cours à la série ou effacez-la avant la relecture.",
      );
      return;
    }
    setPreview(true);
    setError("");
  }
  function publish() {
    if (!selectedCourse || !confirmed) return;
    const id = addSeries({
      title: title.trim(),
      courseIds: [selectedCourse.id],
      subjectId: selectedCourse.subjectId,
      level,
      questions,
    });
    const result = publishSeries(id);
    if (!result.ok) {
      setError(result.error ?? "La série ne peut pas être publiée.");
      return;
    }
    setPublishedId(id);
    setError("");
  }
  function reset() {
    setTitle("");
    setQuestions([]);
    setForm(emptyQuestion());
    setEditingIndex(null);
    setPreview(false);
    setConfirmed(false);
    setPublishedId(null);
    setError("");
  }
  if (!publishedCourses.length)
    return (
      <ParentLayout active="exercises">
        <PageHeading
          title="Préparer des exercices"
          description="Les séries s’appuient sur les cours que vous avez vérifiés."
        />
        <EmptyState
          title="Publiez d’abord une fiche"
          description="Un cours publié est nécessaire pour préparer une série destinée à Alex."
        >
          <Button icon="plus" onPress={() => router.push("/parent/import")}>
            Ajouter un cours
          </Button>
        </EmptyState>
      </ParentLayout>
    );
  if (publishedId)
    return (
      <ParentLayout active="exercises">
        <PageHeading
          eyebrow="Une nouvelle occasion de s’entraîner"
          title="La série est prête !"
        />
        <Card style={{ gap: 20, alignItems: "flex-start", padding: 34 }}>
          <View
            style={[
              s.bubble,
              { backgroundColor: colors.greenLight, width: 64, height: 64 },
            ]}
          >
            <AppIcon name="check" size={34} color={colors.green} />
          </View>
          <AppText variant="heading">{title}</AppText>
          <AppText color={colors.muted}>
            {questions.length} question{questions.length > 1 ? "s" : ""} sur «{" "}
            {selectedCourse?.title} ».
          </AppText>
          <Notice success>
            Alex trouvera cette série dans « Mes exercices ».
          </Notice>
          <View style={s.row}>
            <Button icon="plus" onPress={reset}>
              Préparer une autre série
            </Button>
            <Button
              variant="secondary"
              icon="play"
              onPress={() =>
                router.push({
                  pathname: "/student/exercise/[id]",
                  params: { id: publishedId },
                })
              }
            >
              Voir côté enfant
            </Button>
            <Button variant="ghost" onPress={() => router.replace("/parent")}>
              Tableau de bord
            </Button>
          </View>
        </Card>
      </ParentLayout>
    );
  return (
    <ParentLayout active="exercises">
      <PageHeading
        eyebrow="Des exercices qui suivent son cours"
        title={preview ? "Relire la série" : "Préparer des exercices"}
        description={
          preview
            ? "Vérifiez les énoncés et les corrections avant de partager la série."
            : "Créez une série de QCM à partir d’un cours vérifié."
        }
        action={
          <Badge>
            {questions.length} question{questions.length > 1 ? "s" : ""}
          </Badge>
        }
      />
      <Notice>
        La génération IA arrive dans un prochain lot. Vous pouvez dès maintenant
        rédiger vos propres questions et leurs corrections.
      </Notice>
      {error && <Notice error>{error}</Notice>}
      {preview ? (
        <>
          <Card style={{ gap: 10 }}>
            <AppText variant="heading">{title}</AppText>
            <AppText color={colors.muted}>
              {selectedCourse?.title} ·{" "}
              {level === "discovery"
                ? "Découverte"
                : level === "practice"
                  ? "Entraînement"
                  : "Défi"}
            </AppText>
          </Card>
          {questions.map((question, index) => (
            <Card key={question.id} style={{ gap: 16 }}>
              <View style={[s.row, { justifyContent: "space-between" }]}>
                <Badge>Question {index + 1}</Badge>
                <Button
                  variant="ghost"
                  icon="pencil"
                  onPress={() => editQuestion(index)}
                >
                  Modifier
                </Button>
              </View>
              <AppText variant="heading">{question.prompt}</AppText>
              <View style={{ gap: 10 }}>
                {question.choices.map((choice) => (
                  <View
                    key={choice.id}
                    style={[
                      s.choice,
                      choice.id === question.correctChoiceId && {
                        backgroundColor: colors.greenLight,
                        borderColor: "#BBDCC8",
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
                      size={18}
                    />
                    <AppText style={{ flex: 1, minWidth: 0 }}>
                      {choice.label}
                    </AppText>
                    {choice.id === question.correctChoiceId && (
                      <Badge tone="green">Bonne réponse</Badge>
                    )}
                  </View>
                ))}
              </View>
              <AppText color={colors.green}>{question.explanation}</AppText>
              {question.hint && (
                <AppText variant="small" color={colors.muted}>
                  Indice : {question.hint}
                </AppText>
              )}
            </Card>
          ))}
          <Card style={{ gap: 16 }}>
            <Button
              variant={confirmed ? "secondary" : "ghost"}
              icon={confirmed ? "check" : "shield"}
              accessibilityLabel={
                confirmed
                  ? "Relecture des exercices confirmée"
                  : "Confirmer la relecture des exercices"
              }
              onPress={() => setConfirmed(!confirmed)}
              style={{ alignSelf: "flex-start" }}
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
                disabled={!confirmed}
                onPress={publish}
                testID="publish-series"
              >
                Publier pour Alex
              </Button>
            </View>
          </Card>
        </>
      ) : (
        <>
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
              <AppText variant="heading">1. Le cours et la série</AppText>
              <View style={{ gap: 10 }}>
                {publishedCourses.map((course) => {
                  const subject = subjects.find(
                    (item) => item.id === course.subjectId,
                  );
                  const selected = selectedCourse?.id === course.id;
                  return (
                    <Pressable
                      key={course.id}
                      accessibilityRole="radio"
                      accessibilityLabel={course.title}
                      accessibilityState={{ checked: selected }}
                      onPress={() => {
                        setCourseId(course.id);
                        setConfirmed(false);
                      }}
                      style={[s.choice, selected && s.selected]}
                    >
                      <AppIcon
                        name={selected ? "check" : (subject?.icon ?? "book")}
                        color={selected ? colors.primary : subject?.color}
                        size={20}
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
                value={title}
                onChangeText={setTitle}
                placeholder="Par exemple : Additionner des relatifs"
                maxLength={120}
              />
              <AppText variant="label">Niveau</AppText>
              <View style={s.row}>
                {(
                  [
                    { id: "discovery", label: "Découverte" },
                    { id: "practice", label: "Entraînement" },
                    { id: "challenge", label: "Défi" },
                  ] as const
                ).map((item) => (
                  <Button
                    key={item.id}
                    variant={level === item.id ? "primary" : "secondary"}
                    onPress={() => setLevel(item.id)}
                  >
                    {item.label}
                  </Button>
                ))}
              </View>
            </Card>
            <Card style={[s.column, { flex: 1.4, alignSelf: "stretch" }]}>
              <View style={s.row}>
                <AppText variant="heading">
                  2.{" "}
                  {editingIndex === null
                    ? "Ajouter une question"
                    : "Modifier la question " + (editingIndex + 1)}
                </AppText>
                <Badge>QCM</Badge>
              </View>
              <Field
                label="Question"
                testID="question-prompt"
                multiline
                value={form.prompt}
                onChangeText={(value) => updateForm({ prompt: value })}
                placeholder="Quel est le résultat de (−8) + (+5) ?"
                maxLength={1000}
              />
              <AppText variant="small" color={colors.muted}>
                Renseignez 2 à 4 propositions et cochez la bonne réponse.
              </AppText>
              <View style={{ gap: 10 }}>
                {form.choices.map((choice, index) => (
                  <View
                    key={index}
                    style={{
                      flexDirection: "row",
                      gap: 10,
                      alignItems: "center",
                    }}
                  >
                    <Pressable
                      accessibilityRole="radio"
                      accessibilityLabel={
                        "La réponse " +
                        String.fromCharCode(65 + index) +
                        " est correcte"
                      }
                      testID={"correct-choice-" + index}
                      accessibilityState={{ checked: form.correct === index }}
                      onPress={() => updateForm({ correct: index })}
                      style={[
                        s.choice,
                        {
                          width: 50,
                          height: 50,
                          padding: 0,
                          justifyContent: "center",
                        },
                        form.correct === index && s.selected,
                      ]}
                    >
                      {form.correct === index ? (
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
                        onChangeText={(value) =>
                          updateForm({
                            choices: form.choices.map((item, choiceIndex) =>
                              choiceIndex === index ? value : item,
                            ),
                          })
                        }
                        maxLength={300}
                      />
                    </View>
                  </View>
                ))}
              </View>
              <Field
                label="Explication de la correction"
                testID="question-explanation"
                multiline
                value={form.explanation}
                onChangeText={(value) => updateForm({ explanation: value })}
                placeholder="Expliquez le raisonnement, pas seulement le résultat."
                maxLength={2000}
              />
              <Field
                label="Indice"
                optional
                value={form.hint}
                onChangeText={(value) => updateForm({ hint: value })}
                placeholder="Une aide, sans donner la réponse."
                maxLength={500}
              />
              <Field
                label="Notion travaillée"
                optional
                value={form.concept}
                onChangeText={(value) => updateForm({ concept: value })}
                placeholder="Par exemple : relatifs de signes contraires"
                maxLength={200}
              />
              <View style={[s.row, { justifyContent: "flex-end" }]}>
                <Button
                  variant="ghost"
                  onPress={() => {
                    setForm(emptyQuestion());
                    setEditingIndex(null);
                    setError("");
                  }}
                >
                  Effacer la saisie
                </Button>
                <Button
                  icon={editingIndex === null ? "plus" : "check"}
                  onPress={addQuestion}
                  testID="add-question"
                >
                  {editingIndex === null
                    ? "Ajouter à la série"
                    : "Enregistrer la question"}
                </Button>
              </View>
            </Card>
          </View>
          <Card style={{ gap: 18 }}>
            <View style={[s.row, { justifyContent: "space-between" }]}>
              <AppText variant="heading">3. Les questions de la série</AppText>
              <Badge>{questions.length}</Badge>
            </View>
            {questions.length ? (
              questions.map((question, index) => (
                <View
                  key={question.id}
                  style={[s.choice, { flexWrap: "wrap", padding: 16 }]}
                >
                  <Badge>{index + 1}</Badge>
                  <AppText style={{ flex: 1, minWidth: 180 }}>
                    {question.prompt}
                  </AppText>
                  <Button
                    variant="ghost"
                    icon="pencil"
                    accessibilityLabel={"Modifier la question " + (index + 1)}
                    onPress={() => editQuestion(index)}
                  >
                    Modifier
                  </Button>
                  <Button
                    variant="danger"
                    icon="trash"
                    accessibilityLabel={"Retirer la question " + (index + 1)}
                    onPress={() => {
                      setQuestions((current) =>
                        current.filter((_, itemIndex) => itemIndex !== index),
                      );
                      setConfirmed(false);
                      if (editingIndex !== null) {
                        setEditingIndex(null);
                        setForm(emptyQuestion());
                      }
                    }}
                  >
                    Retirer
                  </Button>
                </View>
              ))
            ) : (
              <AppText color={colors.muted}>
                Les questions ajoutées apparaîtront ici. Prenez le temps de
                vérifier chaque correction.
              </AppText>
            )}
            <Button
              icon="arrow-right"
              onPress={openPreview}
              disabled={!questions.length || !title.trim()}
              style={{ alignSelf: "flex-end" }}
              testID="preview-series"
            >
              Relire avant publication
            </Button>
          </Card>
          <Card style={{ gap: 12 }}>
            <AppText variant="heading">Déjà disponibles pour Alex</AppText>
            <AppText color={colors.muted}>
              {series.filter((item) => item.status === "published").length}{" "}
              série
              {series.filter((item) => item.status === "published").length > 1
                ? "s"
                : ""}{" "}
              publiée
              {series.filter((item) => item.status === "published").length > 1
                ? "s"
                : ""}
              . Retrouvez les séances réalisées dans votre tableau de bord.
            </AppText>
          </Card>
        </>
      )}
    </ParentLayout>
  );
}
