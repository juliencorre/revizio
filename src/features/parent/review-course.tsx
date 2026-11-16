import { useMemo, useRef, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { View, useWindowDimensions } from "react-native";
import {
  AppIcon,
  AppText,
  Badge,
  Button,
  Card,
  PageHeading,
  useContentWidth,
} from "@/components/ui";
import { useTheme } from "@/theme";
import type {
  AiJob,
  CourseSource,
  RevisionSection,
  SourceReference,
  LearningDiagram as Diagram,
} from "@/domain/model";
import { SourceViewer } from "@/components/source-viewer";
import { previousPublishedCourse } from "@/domain/learning";
import { subjectHref } from "./subject-navigation";
import { useLearning } from "@/state/learning-store";
import { DiagramEditor } from "./diagram-editor";
import {
  Field,
  LoadingParent,
  Notice,
  ParentLayout,
  ParentNotFound,
  SourcePreview,
  localId,
  useParentStyles,
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
function editableSections(sections: RevisionSection[]): RevisionSection[] {
  return [
    ...sections,
    ...definitions
      .filter(
        (definition) =>
          !sections.some((section) => section.kind === definition.kind),
      )
      .map((definition) => ({
        id: localId("section"),
        kind: definition.kind,
        title: definition.title,
        content: "",
        example: "",
      })),
  ];
}
export function ReviewCourseScreen() {
  const { colors } = useTheme();
  const s = useParentStyles();
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const contentWidth = useContentWidth();
  const sideBySide = width > height && contentWidth >= 650;
  const [reference, setReference] = useState<{
    courseId: string;
    sectionId: string;
    source: CourseSource;
    ref: SourceReference;
  } | null>(null);
  const data = useLearning();
  const course = data.courses.find((item) => item.id === id);
  const sections = useMemo(
    () => editableSections(course?.sections ?? []),
    [course?.sections, id],
  );
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [published, setPublished] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [job, setJob] = useState<AiJob | null>(null);
  const [replaceConfirmed, setReplaceConfirmed] = useState(false);
  const [pendingDiagrams, setPendingDiagrams] = useState<
    Record<string, boolean>
  >({});
  const hasPendingDiagrams = Object.values(pendingDiagrams).some(Boolean);
  if (!data.isReady) return <LoadingParent active="import" />;
  if (!course) return <ParentNotFound />;
  const subject = data.subjects.find((item) => item.id === course.subjectId);
  const archived = course.status === "archived";
  const readOnly = course.status !== "draft";
  const previous = previousPublishedCourse(course, data.courses);
  const affectedPlans = previous
    ? data.plans.filter((plan) => plan.courseIds.includes(previous.id))
    : [];
  const selectedReference = reference?.courseId === id ? reference : null;
  const latest = archived
    ? data.courses.find(
        (item) =>
          item.status === "published" && item.replacedCourseIds?.includes(id),
      )
    : undefined;
  function sourceOf(ref: SourceReference): CourseSource {
    const sources = course!.sources.filter(
      (source) =>
        source.storageId === ref.sourceId || source.id === ref.sourceId,
    );
    return (
      sources.find((source) => (source.page ?? 1) === (ref.page ?? 1)) ??
      sources[0] ?? {
        id: ref.sourceId,
        name:
          ref.sourceId === "texte-saisi"
            ? "Texte du cours"
            : "Source de la fiche",
        extractedText:
          ref.sourceId === "texte-saisi" ? course!.sourceText : undefined,
      }
    );
  }
  const disabled = busy || readOnly;
  function change(update: Parameters<typeof data.updateCourse>[1]) {
    if (disabled) return;
    data.updateCourse(id, update);
    setSaved(false);
    setConfirmed(false);
    setError("");
    setReplaceConfirmed(false);
  }
  function changeSection(
    sectionId: string,
    key: "content" | "example",
    value: string,
  ) {
    change({
      sections: sections.map((section) =>
        section.id === sectionId ? { ...section, [key]: value } : section,
      ),
    });
  }
  function changeDiagram(sectionId: string, diagram: Diagram | undefined) {
    change({
      sections: sections.map((section) => {
        if (section.id !== sectionId) return section;
        const { diagram: previous, ...rest } = section;
        return diagram ? { ...rest, diagram } : rest;
      }),
    });
  }
  function pendingDiagram(sectionId: string, pending: boolean) {
    setPendingDiagrams((current) =>
      current[sectionId] === pending
        ? current
        : { ...current, [sectionId]: pending },
    );
    if (pending) setConfirmed(false);
  }
  function correctOcr(source: CourseSource, extractedText: string) {
    const old = source.extractedText ?? "";
    const current = course!.sourceText ?? "";
    change({
      sources: course!.sources.map((item) =>
        item.id === source.id ? { ...item, extractedText } : item,
      ),
      sourceText:
        old && current.includes(old)
          ? current.replace(old, extractedText)
          : [current, extractedText].filter(Boolean).join("\n\n"),
    });
  }
  async function save() {
    try {
      await data.syncNow();
      setSaved(true);
      setError("");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Le brouillon n’a pas pu être synchronisé. Il reste sur cet appareil.",
      );
    }
  }
  function publish(replaceId?: string) {
    if (hasPendingDiagrams) {
      setError(
        "Appliquez ou annulez les modifications des schémas avant de publier.",
      );
      return;
    }
    if (
      sections.some((section) => section.diagram && !section.content.trim())
    ) {
      setError(
        "Ajoutez une explication dans chaque section qui contient un schéma.",
      );
      return;
    }
    if (!confirmed && !readOnly) {
      setError("Confirmez la relecture avant de publier la fiche.");
      return;
    }
    data.updateCourse(id, {
      title: course!.title.trim(),
      description: course!.description.trim(),
      sections: sections
        .filter((section) => section.content.trim())
        .map((section) => ({
          ...section,
          content: section.content.trim(),
          example: section.example?.trim(),
        })),
    });
    const result = data.publishCourse(id, replaceId);
    if (!result.ok)
      setError(result.error ?? "La fiche ne peut pas encore être publiée.");
    else {
      setPublished(true);
      setError("");
    }
  }
  function duplicate() {
    const nextId = data.addCourse({
      subjectId: course!.subjectId,
      title: course!.title,
      description: course!.description,
      sections: course!.sections.map((section) => ({
        ...section,
        id: localId("section"),
      })),
      sources: course!.sources,
      sourceText: course!.sourceText,
      originId: course!.originId || course!.id,
      previousVersionId: course!.id,
      revision: (course!.revision ?? 1) + 1,
    });
    setConfirmed(false);
    setPublished(false);
    setJob(null);
    router.replace({ pathname: "/parent/review/[id]", params: { id: nextId } });
  }
  async function generate() {
    if (busyRef.current || readOnly) return;
    if (hasPendingDiagrams) {
      setError(
        "Appliquez ou annulez les modifications des schémas avant de régénérer la fiche.",
      );
      return;
    }
    if (!course!.title.trim()) {
      setError("Donnez un titre à la fiche avant la génération.");
      return;
    }
    if (!course!.sources.length && !course!.sourceText?.trim()) {
      setError(
        "Ajoutez des documents ou du texte pour préparer une fiche fidèle au cours.",
      );
      return;
    }
    if (
      sections.some((section) => section.content.trim()) &&
      !replaceConfirmed
    ) {
      setReplaceConfirmed(true);
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError("");
    setConfirmed(false);
    setSaved(false);
    setJob(null);
    try {
      await data.generateCourse(id, (progress) => setJob(progress));
      setReplaceConfirmed(false);
      setSaved(true);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "La génération a été interrompue. Votre brouillon est conservé.",
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  return (
    <ParentLayout active="import" subjectId={course.subjectId}>
      <View testID="parent-review" style={{ gap: 26 }}>
        <PageHeading
          eyebrow={subject?.title}
          title={
            archived
              ? "Version archivée"
              : readOnly
                ? "La fiche publiée"
                : "Préparer la fiche"
          }
          description={
            archived
              ? "Cette édition est conservée dans l’historique parent."
              : readOnly
                ? `Voici le contenu disponible dans l’espace de ${data.childName}.`
                : "Vérifiez les documents, puis corrigez la fiche avant de la publier."
          }
          action={
            <Badge tone={readOnly ? "green" : "orange"}>
              {archived
                ? "Archive"
                : readOnly
                  ? `Publiée pour ${data.childName}`
                  : "Brouillon · visible par vous"}
            </Badge>
          }
        />
        {published && (
          <Notice success>
            La fiche est publiée ! {data.childName} peut la retrouver dans ses
            cours.
          </Notice>
        )}
        {error && (
          <View testID="ai-course-error">
            <Notice error>{error}</Notice>
          </View>
        )}
        {!readOnly && (
          <Card style={{ gap: 18 }} testID="ai-course-panel">
            <View style={s.row}>
              <AppIcon name="sparkles" />
              <AppText variant="heading">Préparer une fiche avec l’IA</AppText>
            </View>
            {data.isDemo ? (
              <>
                <Notice>
                  La génération IA est disponible dans votre espace familial.
                  Vous pouvez rédiger et publier une fiche manuellement dans
                  cette démonstration.
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
                  L’IA extrait le texte des documents et prépare les sections.
                  Comparez les signes, les définitions et les exemples avec les
                  originaux. La publication reste votre choix.
                </AppText>
                {replaceConfirmed && (
                  <Notice>
                    La nouvelle génération remplacera les sections de ce
                    brouillon. Le texte source et les documents seront
                    conservés. Confirmez pour continuer.
                  </Notice>
                )}
                <View style={s.row}>
                  <Button
                    icon="sparkles"
                    onPress={() => void generate()}
                    disabled={busy || !data.serverAvailable}
                    testID="ai-generate-course"
                  >
                    {busy
                      ? "Préparation en cours…"
                      : replaceConfirmed
                        ? "Confirmer et régénérer la fiche"
                        : sections.some((section) => section.content.trim())
                          ? "Régénérer la fiche"
                          : "Générer la fiche"}
                  </Button>
                  {replaceConfirmed && (
                    <Button
                      variant="ghost"
                      onPress={() => setReplaceConfirmed(false)}
                    >
                      Annuler
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    icon="clock"
                    onPress={() =>
                      router.push({
                        pathname: "/parent/preparations",
                        params: { subjectId: course.subjectId },
                      })
                    }
                  >
                    Voir les préparations
                  </Button>
                </View>
                {!data.serverAvailable && (
                  <Notice>
                    Retrouvez la connexion au serveur pour lancer la génération.
                    La rédaction manuelle reste disponible.
                  </Notice>
                )}
              </>
            )}
            {job && (
              <Card inset style={{ gap: 8 }} testID="ai-course-progress">
                <Badge
                  tone={
                    job.status === "failed"
                      ? "orange"
                      : job.status === "succeeded"
                        ? "green"
                        : "primary"
                  }
                >
                  {job.status === "queued"
                    ? "En attente"
                    : job.status === "running"
                      ? "En cours"
                      : job.status === "succeeded"
                        ? "Fiche à relire"
                        : "À relancer"}
                </Badge>
                <AppText variant="label">
                  {job.message || job.stage || "Préparation sur le serveur"}
                </AppText>
                <AppText variant="small" color={colors.muted}>
                  Vous pouvez quitter cet écran et retrouver cette tâche dans
                  les préparations.
                </AppText>
              </Card>
            )}
          </Card>
        )}
        {readOnly && !archived && (
          <Notice>
            Pour modifier cette fiche, créez une nouvelle version en brouillon.
            La version publiée reste disponible pendant sa préparation.
          </Notice>
        )}
        <View
          style={[
            s.grid,
            {
              flexDirection:
                width >= 1200 && !selectedReference ? "row" : "column",
              alignItems: "flex-start",
            },
          ]}
        >
          <View style={[s.column, { flex: 1.5, alignSelf: "stretch" }]}>
            <Card style={s.section}>
              <Field
                label="Titre de la fiche"
                testID="course-title"
                value={course.title}
                onChangeText={(title) => change({ title })}
                editable={!disabled}
                maxLength={120}
              />
              <Field
                label="Présentation courte"
                optional
                value={course.description}
                onChangeText={(description) => change({ description })}
                editable={!disabled}
                maxLength={300}
              />
              <AppText variant="small" color={colors.muted}>
                {archived
                  ? "Version archivée"
                  : readOnly
                    ? "Fiche publiée"
                    : "Vos corrections sont enregistrées dans le brouillon au fil de la saisie."}
                {course.revision ? ` · Version ${course.revision}` : ""}
              </AppText>
            </Card>
            {sections
              .filter((section) => !readOnly || section.content.trim())
              .map((section) => (
                <View
                  key={section.id}
                  style={{
                    flexDirection: "row",
                    alignItems: "flex-start",
                    gap: 12,
                  }}
                >
                  <Card style={[s.section, { flex: 1, minWidth: 0 }]}>
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
                          : "course-content-" + section.id
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
                      editable={!disabled}
                      maxLength={12000}
                    />
                    <Field
                      label={"Exemple — " + section.title}
                      optional
                      value={section.example ?? ""}
                      onChangeText={(value) =>
                        changeSection(section.id, "example", value)
                      }
                      editable={!disabled}
                      multiline
                      maxLength={4000}
                    />
                    <DiagramEditor
                      value={section.diagram}
                      storageKey={`revizo.diagram-editor.${data.activeProfileId}.${id}.${section.id}`}
                      testID={"diagram-editor-" + section.kind}
                      disabled={busy}
                      readOnly={readOnly}
                      onChange={(diagram) => changeDiagram(section.id, diagram)}
                      onPendingChange={(pending) =>
                        pendingDiagram(section.id, pending)
                      }
                    />
                    {!!section.sourceRefs?.length && (
                      <View style={s.row}>
                        {section.sourceRefs.map((ref, index) => {
                          const source = sourceOf(ref);
                          return (
                            <Button
                              key={index}
                              variant="secondary"
                              icon="file"
                              testID={`section-reference-${section.id}-${index}`}
                              onPress={() =>
                                setReference({
                                  courseId: id,
                                  sectionId: section.id,
                                  source,
                                  ref,
                                })
                              }
                            >
                              {source.name}
                              {ref.page ? ` · page ${ref.page}` : ""}
                            </Button>
                          );
                        })}
                      </View>
                    )}
                  </Card>
                  {sideBySide &&
                    selectedReference?.sectionId === section.id && (
                      <SourceViewer
                        inline
                        source={selectedReference.source}
                        page={selectedReference.ref.page}
                        excerpt={selectedReference.ref.excerpt}
                        onClose={() => setReference(null)}
                      />
                    )}
                </View>
              ))}
          </View>
          <Card style={[s.column, { alignSelf: "stretch" }]}>
            <AppText variant="heading">Le cours d’origine</AppText>
            <AppText color={colors.muted}>
              Relisez le texte extrait et comparez-le aux documents. Les
              passages signalés demandent une vérification.
            </AppText>
            <Field
              label="Texte du cours utilisé pour la fiche"
              optional
              multiline
              testID="ai-course-source-text"
              value={course.sourceText ?? ""}
              onChangeText={(sourceText) => change({ sourceText })}
              editable={!disabled}
              maxLength={150000}
              placeholder="Collez ou corrigez ici le texte complet du cours."
            />
            {course.sources.length ? (
              course.sources.map((source, index) => (
                <View key={source.id} style={{ gap: 14 }}>
                  <SourcePreview source={source} index={index} />
                  {source.uncertain && (
                    <Notice>
                      Lecture incertaine : vérifiez ce document avant de
                      publier.
                    </Notice>
                  )}
                  <Field
                    label={"Texte extrait — document " + (index + 1)}
                    optional
                    multiline
                    value={source.extractedText ?? ""}
                    onChangeText={(value) => correctOcr(source, value)}
                    editable={!disabled}
                    testID={"ai-ocr-text-" + index}
                    maxLength={150000}
                    placeholder="Le texte extrait apparaîtra après la préparation IA."
                  />
                  {source.uncertain && !readOnly && (
                    <Button
                      variant="secondary"
                      icon="check"
                      disabled={busy}
                      onPress={() =>
                        change({
                          sources: course.sources.map((item) =>
                            item.id === source.id
                              ? { ...item, uncertain: false }
                              : item,
                          ),
                        })
                      }
                      testID={"ai-ocr-confirm-" + index}
                    >
                      J’ai vérifié ce texte
                    </Button>
                  )}
                  <View style={s.divider} />
                </View>
              ))
            ) : (
              <Card inset>
                <AppText color={colors.muted}>
                  Aucun document joint. Utilisez le texte du cours ou rédigez la
                  fiche à la main.
                </AppText>
              </Card>
            )}
            {!archived && (
              <Button
                variant="secondary"
                icon="plus"
                disabled={busy}
                onPress={() =>
                  router.push({
                    pathname: "/parent/import",
                    params: { courseId: id },
                  })
                }
              >
                Ajouter ou organiser les documents
              </Button>
            )}
          </Card>
        </View>
        <Card style={{ gap: 18 }}>
          {archived ? (
            latest ? (
              <Button
                icon="book"
                onPress={() =>
                  router.replace({
                    pathname: "/parent/review/[id]",
                    params: { id: latest.id },
                  })
                }
              >
                Ouvrir la version publiée
              </Button>
            ) : (
              <AppText>Version conservée dans l’historique.</AppText>
            )
          ) : readOnly ? (
            <>
              <AppText variant="heading">Une version prête à réviser</AppText>
              <View style={s.row}>
                <Button
                  variant="secondary"
                  icon="pencil"
                  onPress={duplicate}
                  testID="ai-course-new-version"
                >
                  Créer une copie à modifier
                </Button>
                <Button
                  icon="plus"
                  onPress={() =>
                    router.push({
                      pathname: "/parent/exercises",
                      params: { courseId: id },
                    })
                  }
                >
                  Préparer des exercices
                </Button>
                <Button
                  variant="ghost"
                  icon="arrow-left"
                  onPress={() => router.navigate(subjectHref(course.subjectId))}
                >
                  Retour à la matière
                </Button>
              </View>
            </>
          ) : (
            <>
              <AppText variant="heading">Prête à être partagée ?</AppText>
              {hasPendingDiagrams && (
                <Notice>
                  Appliquez ou annulez les modifications des schémas avant de
                  confirmer la relecture.
                </Notice>
              )}
              <Button
                variant={confirmed ? "secondary" : "ghost"}
                icon={confirmed ? "check" : "shield"}
                accessibilityLabel={
                  confirmed
                    ? "Relecture confirmée"
                    : "Confirmer la relecture du cours"
                }
                onPress={() => setConfirmed(!confirmed)}
                disabled={busy || hasPendingDiagrams}
                testID="ai-course-confirm-review"
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
                  icon="save"
                  onPress={() => void save()}
                  disabled={busy}
                  testID="save-course"
                >
                  Enregistrer le brouillon
                </Button>
                <Button
                  icon="check"
                  variant={previous ? "secondary" : "primary"}
                  onPress={() => publish()}
                  disabled={
                    busy ||
                    hasPendingDiagrams ||
                    !confirmed ||
                    !course.title.trim()
                  }
                  testID="publish-course"
                >
                  {previous
                    ? "Publier comme fiche distincte"
                    : `Publier pour ${data.childName}`}
                </Button>
              </View>
            </>
          )}
          {!!previous &&
            !archived &&
            !course.replacedCourseIds?.includes(previous.id) && (
              <>
                <AppText variant="heading">
                  Remplacer la version précédente
                </AppText>
                <AppText>
                  « {previous.title} » sera archivée. Les exercices et les liens
                  vers cette fiche ouvriront la nouvelle édition.
                </AppText>
                {affectedPlans.length > 0 && (
                  <AppText>
                    Contrôles concernés ·{" "}
                    {affectedPlans.map((plan) => plan.title).join(" · ")}
                  </AppText>
                )}
                <Button
                  icon="check"
                  disabled={
                    busy ||
                    (!readOnly &&
                      (!confirmed ||
                        hasPendingDiagrams ||
                        !course.title.trim()))
                  }
                  testID="replace-published-course"
                  onPress={() => publish(previous.id)}
                >
                  Remplacer la fiche publiée
                </Button>
              </>
            )}
        </Card>
        {!sideBySide && selectedReference && (
          <SourceViewer
            source={selectedReference.source}
            page={selectedReference.ref.page}
            excerpt={selectedReference.ref.excerpt}
            onClose={() => setReference(null)}
          />
        )}
      </View>
    </ParentLayout>
  );
}
