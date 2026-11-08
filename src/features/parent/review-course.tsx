import { useEffect, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { View, useWindowDimensions } from "react-native";
import {
  AppIcon,
  AppText,
  Badge,
  Button,
  Card,
  PageHeading,
} from "@/components/ui";
import { colors } from "@/theme";
import type { RevisionSection } from "@/domain/model";
import { useLearning } from "@/state/learning-store";
import {
  Field,
  LoadingParent,
  Notice,
  ParentLayout,
  ParentNotFound,
  SourcePreview,
  localId,
  parentStyles as s,
} from "./shared";
const definitions: {
  kind: RevisionSection["kind"];
  title: string;
  placeholder: string;
}[] = [
  {
    kind: "essential",
    title: "L’essentiel",
    placeholder: "Les idées et règles à retenir, avec des phrases courtes.",
  },
  {
    kind: "vocabulary",
    title: "Le vocabulaire",
    placeholder: "Les mots du cours et leurs définitions.",
  },
  {
    kind: "method",
    title: "La méthode",
    placeholder: "Les étapes à suivre pour réussir.",
  },
  {
    kind: "warning",
    title: "Les pièges à éviter",
    placeholder: "Les confusions fréquentes et les points d’attention.",
  },
];
function editableSections(sections: RevisionSection[]) {
  return definitions.map(
    (definition) =>
      sections.find((section) => section.kind === definition.kind) ?? {
        id: localId("section"),
        kind: definition.kind,
        title: definition.title,
        content: "",
        example: "",
      },
  );
}
export function ReviewCourseScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { courses, subjects, updateCourse, publishCourse, addCourse, isReady } =
    useLearning();
  const course = courses.find((item) => item.id === id);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [sections, setSections] = useState<RevisionSection[]>([]);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [published, setPublished] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  useEffect(() => {
    if (course) {
      setTitle(course.title);
      setDescription(course.description);
      setSections(editableSections(course.sections));
      setSaved(false);
      setError("");
      setPublished(false);
      setConfirmed(false);
    }
  }, [id, isReady]);
  if (!isReady) return <LoadingParent active="import" />;
  if (!course) return <ParentNotFound />;
  const subject = subjects.find((item) => item.id === course.subjectId);
  const readOnly = course.status === "published";
  function changeSection(
    sectionId: string,
    key: "content" | "example",
    value: string,
  ) {
    setSections((current) =>
      current.map((section) =>
        section.id === sectionId ? { ...section, [key]: value } : section,
      ),
    );
    setSaved(false);
    setConfirmed(false);
  }
  function save() {
    updateCourse(id, {
      title: title.trim(),
      description: description.trim(),
      sections: sections
        .filter((section) => section.content.trim())
        .map((section) => ({
          ...section,
          content: section.content.trim(),
          example: section.example?.trim(),
        })),
    });
    setSaved(true);
    setError("");
  }
  function publish() {
    if (!title.trim()) {
      setError("Ajoutez un titre au cours.");
      return;
    }
    if (
      !sections.some(
        (section) => section.kind === "essential" && section.content.trim(),
      )
    ) {
      setError("Rédigez au moins la section « L’essentiel » avant de publier.");
      return;
    }
    if (!confirmed) {
      setError("Confirmez la relecture avant de publier la fiche.");
      return;
    }
    save();
    const result = publishCourse(id);
    if (!result.ok)
      setError(result.error ?? "La fiche ne peut pas encore être publiée.");
    else setPublished(true);
  }
  function duplicate() {
    const nextId = addCourse({
      subjectId: course!.subjectId,
      title: course!.title + " — nouvelle version",
      description: course!.description,
      sections: course!.sections.map((section) => ({
        ...section,
        id: localId("section"),
      })),
      sources: course!.sources.map((source) => ({
        ...source,
        id: localId("source"),
      })),
    });
    router.replace({ pathname: "/parent/review/[id]", params: { id: nextId } });
  }
  return (
    <ParentLayout active="import">
      <View testID="parent-review" style={{ gap: 26 }}>
        <PageHeading
          eyebrow={subject?.title}
          title={readOnly ? "La fiche publiée" : "Préparer la fiche"}
          description={
            readOnly
              ? "Voici le contenu disponible dans l’espace d’Alex."
              : "Relisez le cours et préparez une fiche courte, claire et fidèle aux pages."
          }
          action={
            <Badge tone={readOnly ? "green" : "orange"}>
              {readOnly ? "Publiée pour Alex" : "Brouillon · visible par vous"}
            </Badge>
          }
        />
        {published && (
          <Notice success>
            La fiche est publiée ! Alex peut maintenant la retrouver dans ses
            cours.
          </Notice>
        )}
        {readOnly ? (
          <Notice>
            Pour modifier cette fiche en conservant la version actuelle, créez
            une copie à préparer.
          </Notice>
        ) : (
          <Notice>
            L’extraction et la génération IA ne sont pas encore disponibles.
            Complétez la fiche à partir des documents avant de la partager.
          </Notice>
        )}
        {error && <Notice error>{error}</Notice>}
        <View
          style={[
            s.grid,
            {
              flexDirection: width >= 1200 ? "row" : "column",
              alignItems: "flex-start",
            },
          ]}
        >
          <View style={[s.column, { flex: 1.6, alignSelf: "stretch" }]}>
            <Card style={s.section}>
              <Field
                label="Titre de la fiche"
                testID="course-title"
                value={title}
                onChangeText={(value) => {
                  setTitle(value);
                  setSaved(false);
                  setConfirmed(false);
                }}
                editable={!readOnly}
                maxLength={120}
              />
              <Field
                label="Présentation courte"
                optional
                value={description}
                onChangeText={(value) => {
                  setDescription(value);
                  setSaved(false);
                  setConfirmed(false);
                }}
                editable={!readOnly}
                placeholder="Ce que cette fiche aide à comprendre."
                maxLength={300}
              />
            </Card>
            {sections
              .filter((section) => !readOnly || section.content.trim())
              .map((section, index) => (
                <Card
                  key={section.id}
                  style={[
                    s.section,
                    section.kind === "warning" && {
                      backgroundColor: "#FFF8F2",
                      borderColor: "#F1DCCD",
                    },
                  ]}
                >
                  <View style={s.row}>
                    <AppIcon
                      name={
                        section.kind === "essential"
                          ? "sparkles"
                          : section.kind === "vocabulary"
                            ? "book"
                            : section.kind === "warning"
                              ? "lightbulb"
                              : "pencil"
                      }
                      color={
                        section.kind === "warning"
                          ? colors.orange
                          : colors.primary
                      }
                    />
                    <AppText variant="heading">{section.title}</AppText>
                    {section.kind !== "essential" && (
                      <Badge tone="muted">Facultatif</Badge>
                    )}
                  </View>
                  <Field
                    label={"Contenu — " + section.title}
                    testID={
                      section.kind === "essential"
                        ? "course-content"
                        : undefined
                    }
                    multiline
                    placeholder={
                      definitions.find(
                        (definition) => definition.kind === section.kind,
                      )?.placeholder
                    }
                    value={section.content}
                    onChangeText={(value) =>
                      changeSection(section.id, "content", value)
                    }
                    editable={!readOnly}
                    maxLength={6000}
                  />
                  <Field
                    label={"Exemple — " + section.title}
                    optional
                    value={section.example ?? ""}
                    onChangeText={(value) =>
                      changeSection(section.id, "example", value)
                    }
                    editable={!readOnly}
                    placeholder="Un exemple concret pour mieux comprendre."
                    multiline
                    maxLength={2000}
                  />
                </Card>
              ))}
          </View>
          <Card style={[s.column, { alignSelf: "stretch" }]}>
            <AppText variant="heading">Les documents du cours</AppText>
            <AppText variant="small" color={colors.muted}>
              Comparez les définitions, les signes et les exemples avec les
              pages originales.
            </AppText>
            {course.sources.length ? (
              <View style={s.grid}>
                {course.sources.map((source, index) => (
                  <SourcePreview
                    key={source.id}
                    source={source}
                    index={index}
                  />
                ))}
              </View>
            ) : (
              <View
                style={{
                  padding: 20,
                  gap: 12,
                  backgroundColor: "#F6F7FB",
                  borderRadius: 16,
                }}
              >
                <AppIcon name="file" color={colors.muted} />
                <AppText variant="small" color={colors.muted}>
                  Aucun document joint à ce cours. Vous pouvez rédiger la fiche
                  directement.
                </AppText>
              </View>
            )}
            <AppText variant="small" color={colors.muted}>
              Les aperçus dépendent des fichiers encore disponibles sur cet
              appareil. Gardez vos originaux.
            </AppText>
          </Card>
        </View>
        <Card style={{ gap: 18 }}>
          {readOnly ? (
            <>
              <AppText variant="heading">Une version prête à réviser</AppText>
              <View style={s.row}>
                <Button variant="secondary" icon="pencil" onPress={duplicate}>
                  Créer une copie à modifier
                </Button>
                <Button
                  icon="plus"
                  onPress={() => router.push("/parent/exercises")}
                >
                  Préparer des exercices
                </Button>
                <Button
                  variant="ghost"
                  icon="arrow-left"
                  onPress={() => router.replace("/parent")}
                >
                  Tableau de bord
                </Button>
              </View>
            </>
          ) : (
            <>
              <AppText variant="heading">Prête à être partagée ?</AppText>
              <Button
                variant={confirmed ? "secondary" : "ghost"}
                icon={confirmed ? "check" : "shield"}
                accessibilityLabel={
                  confirmed
                    ? "Relecture confirmée"
                    : "Confirmer la relecture du cours"
                }
                onPress={() => setConfirmed(!confirmed)}
                style={{ alignSelf: "flex-start" }}
              >
                {confirmed
                  ? "J’ai relu la fiche et ses exemples"
                  : "Je confirme avoir relu la fiche et ses exemples"}
              </Button>
              <View style={[s.row, { justifyContent: "flex-end" }]}>
                {saved && (
                  <AppText variant="small" color={colors.green}>
                    Brouillon enregistré
                  </AppText>
                )}
                <Button
                  variant="secondary"
                  icon="file"
                  onPress={save}
                  testID="save-course"
                >
                  Enregistrer le brouillon
                </Button>
                <Button
                  icon="check"
                  onPress={publish}
                  disabled={!confirmed || !title.trim()}
                  testID="publish-course"
                >
                  Publier pour Alex
                </Button>
              </View>
            </>
          )}
        </Card>
      </View>
    </ParentLayout>
  );
}
