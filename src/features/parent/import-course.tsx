import { useRef, useState } from "react";
import { Platform, Pressable, View, useWindowDimensions } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import {
  AppIcon,
  AppText,
  Badge,
  Button,
  Card,
  PageHeading,
} from "@/components/ui";
import { colors } from "@/theme";
import type { CourseSource } from "@/domain/model";
import { useLearning } from "@/state/learning-store";
import { cacheSource } from "@/services/source-cache";
import { useLocalDraft } from "@/features/planning/use-local-draft";
import {
  Field,
  LoadingParent,
  Notice,
  ParentLayout,
  SourcePreview,
  localId,
  parentStyles as s,
} from "./shared";

type ImportDraft = {
  subjectId: string;
  title: string;
  sources: CourseSource[];
  sourceText: string;
  existingId: string;
};
const emptyDraft = (): ImportDraft => ({
  subjectId: "maths",
  title: "",
  sources: [],
  sourceText: "",
  existingId: "",
});
function validDraft(value: unknown): value is ImportDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as ImportDraft;
  return (
    typeof draft.subjectId === "string" &&
    typeof draft.title === "string" &&
    typeof draft.sourceText === "string" &&
    typeof draft.existingId === "string" &&
    Array.isArray(draft.sources) &&
    draft.sources.length <= 30 &&
    draft.sources.every(
      (source) =>
        !!source &&
        typeof source.id === "string" &&
        typeof source.name === "string",
    )
  );
}
export function ImportCourseScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ courseId?: string }>();
  const { width } = useWindowDimensions();
  const data = useLearning();
  const initial = data.courses.find((course) => course.id === params.courseId);
  const [draft, setDraft, local] = useLocalDraft<ImportDraft>(
    `revizo.import.${data.activeProfileId || "demo"}.${params.courseId || "new"}`,
    initial
      ? {
          subjectId: initial.subjectId,
          title: initial.title,
          sources: initial.sources,
          sourceText: initial.sourceText ?? "",
          existingId: initial.id,
        }
      : emptyDraft(),
    validDraft,
  );
  const [busy, setBusy] = useState<string | null>(null);
  const busyRef = useRef(false);
  const [error, setError] = useState("");
  const [showCourses, setShowCourses] = useState(false);
  const existing = data.courses.find(
    (course) => course.id === draft.existingId,
  );
  function change(update: Partial<ImportDraft>) {
    setDraft((current) => ({ ...current, ...update }));
    setError("");
  }
  async function run(label: string, action: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(label);
    setError("");
    try {
      await action();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Le document n’a pas pu être ajouté. Réessayez sans fermer ce brouillon.",
      );
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  }
  async function appendSources(incoming: CourseSource[]) {
    const room = Math.max(0, 30 - draft.sources.length);
    for (const source of incoming.slice(0, room)) {
      const cached = await cacheSource(source);
      // Keep each successful page if a later page fails to be read.
      setDraft((current) => ({
        ...current,
        sources: [...current.sources, cached].slice(0, 30),
      }));
    }
    if (incoming.length > room)
      setError(
        "Vous pouvez joindre 30 documents à un cours. Les documents supplémentaires n’ont pas été ajoutés.",
      );
  }
  async function pickImages(camera: boolean) {
    await run("Ouverture des photos…", async () => {
      if (camera && Platform.OS !== "web") {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted)
          throw new Error(
            "L’accès à l’appareil photo est refusé. Autorisez-le dans les réglages ou importez une photo existante.",
          );
      }
      const result = camera
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ["images"],
            quality: 0.9,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"],
            allowsMultipleSelection: true,
            selectionLimit: Math.max(1, 30 - draft.sources.length),
            quality: 0.9,
          });
      if (!result.canceled)
        await appendSources(
          result.assets.map((asset, index) => ({
            id: localId("source"),
            name:
              asset.fileName ??
              "Photo " + (draft.sources.length + index + 1) + ".jpg",
            uri: asset.uri,
            mimeType: asset.mimeType ?? "image/jpeg",
            rotation: 0,
          })),
        );
    });
  }
  async function pickDocuments() {
    await run("Lecture des documents…", async () => {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "image/*"],
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (!result.canceled)
        await appendSources(
          result.assets.map((asset) => ({
            id: localId("source"),
            name: asset.name,
            uri: asset.uri,
            mimeType: asset.mimeType,
            rotation: 0,
          })),
        );
    });
  }
  function move(index: number, direction: -1 | 1) {
    setDraft((current) => {
      const sources = [...current.sources];
      const to = index + direction;
      if (to >= 0 && to < sources.length)
        [sources[index], sources[to]] = [sources[to], sources[index]];
      return { ...current, sources };
    });
  }
  async function createDraft() {
    await run("Conservation des documents…", async () => {
      if (!draft.title.trim())
        throw new Error(
          "Donnez un titre à ce cours pour le retrouver facilement.",
        );
      if (!data.subjects.some((subject) => subject.id === draft.subjectId))
        throw new Error("Choisissez une matière.");
      if (draft.existingId && !existing)
        throw new Error(
          "Ce cours n’est plus disponible. Choisissez un autre cours ou commencez un nouveau brouillon.",
        );
      const sources = await data.storeSources(draft.sources);
      change({ sources });
      let id: string;
      if (existing?.status === "draft") {
        id = existing.id;
        data.updateCourse(id, {
          title: draft.title.trim(),
          subjectId: draft.subjectId,
          sources,
          sourceText: draft.sourceText.trim(),
        });
      } else {
        id = data.addCourse({
          title: draft.title.trim(),
          subjectId: draft.subjectId,
          sources,
          sourceText: draft.sourceText.trim(),
          ...(existing
            ? {
                description: existing.description,
                sections: existing.sections,
                originId: existing.originId || existing.id,
                revision: (existing.revision ?? 1) + 1,
              }
            : {}),
        });
      }
      router.replace({ pathname: "/parent/review/[id]", params: { id } });
    });
  }
  if (!data.isReady || !local.ready) return <LoadingParent active="import" />;
  return (
    <ParentLayout active="import">
      <View testID="parent-import" style={{ gap: 26 }}>
        <PageHeading
          eyebrow="Un cours, une fiche claire"
          title={existing ? "Compléter un cours" : "Ajouter un cours"}
          description="Rassemblez les documents, puis relisez la fiche avant de la partager."
        />
        {data.isDemo && (
          <Notice>
            Vous utilisez la démonstration. La rédaction manuelle fonctionne ici
            ; connectez votre espace familial pour préparer une fiche avec l’IA.
            <Button
              variant="ghost"
              icon="lock"
              onPress={() => router.push("/auth?target=parent")}
            >
              Connexion familiale
            </Button>
          </Notice>
        )}
        {local.error && <Notice error>{local.error}</Notice>}
        {error && (
          <View testID="ai-import-error">
            <Notice error>{error}</Notice>
          </View>
        )}
        <Card style={{ gap: 18 }}>
          <View style={s.row}>
            <Button
              variant={!draft.existingId ? "primary" : "secondary"}
              icon="plus"
              disabled={!!busy}
              onPress={() => {
                setDraft(emptyDraft());
                setShowCourses(false);
              }}
            >
              Nouveau cours
            </Button>
            <Button
              variant={draft.existingId ? "primary" : "secondary"}
              icon="book"
              disabled={!!busy}
              onPress={() => setShowCourses(!showCourses)}
              testID="ai-import-existing"
            >
              Compléter un cours existant
            </Button>
          </View>
          {existing && (
            <Notice>
              {existing.status === "published"
                ? "Une nouvelle version en brouillon sera créée. La fiche publiée reste disponible pendant votre préparation."
                : "Les documents et le texte seront enregistrés dans ce brouillon existant."}
            </Notice>
          )}
          {showCourses && (
            <View style={s.grid}>
              {data.courses.length ? (
                data.courses.map((course) => (
                  <Button
                    key={course.id}
                    variant={
                      draft.existingId === course.id ? "primary" : "secondary"
                    }
                    disabled={!!busy}
                    onPress={() => {
                      setDraft({
                        subjectId: course.subjectId,
                        title: course.title,
                        sources: course.sources,
                        sourceText: course.sourceText ?? "",
                        existingId: course.id,
                      });
                      setShowCourses(false);
                    }}
                    testID={"ai-import-course-" + course.id}
                  >
                    {course.title} ·{" "}
                    {course.status === "published" ? "publié" : "brouillon"}
                  </Button>
                ))
              ) : (
                <AppText color={colors.muted}>
                  Aucun cours à compléter pour le moment.
                </AppText>
              )}
            </View>
          )}
        </Card>
        <View
          style={[s.grid, { flexDirection: width >= 1150 ? "row" : "column" }]}
        >
          <Card style={s.column}>
            <AppText variant="heading">1. La matière</AppText>
            <View style={s.grid}>
              {data.subjects.map((subject) => (
                <Pressable
                  key={subject.id}
                  accessibilityRole="radio"
                  accessibilityLabel={subject.title}
                  accessibilityState={{
                    checked: draft.subjectId === subject.id,
                  }}
                  disabled={!!busy || !!existing}
                  onPress={() => change({ subjectId: subject.id })}
                  style={[
                    s.choice,
                    draft.subjectId === subject.id && s.selected,
                    { flexGrow: 1, minWidth: 130 },
                  ]}
                >
                  <AppIcon
                    name={subject.icon}
                    color={subject.color}
                    size={20}
                  />
                  <AppText
                    variant="small"
                    color={
                      draft.subjectId === subject.id
                        ? colors.primary
                        : colors.ink
                    }
                  >
                    {subject.shortLabel}
                  </AppText>
                  {draft.subjectId === subject.id && (
                    <AppIcon name="check" size={16} />
                  )}
                </Pressable>
              ))}
            </View>
            <View style={s.divider} />
            <AppText variant="heading">2. Le titre du cours</AppText>
            <Field
              label="Titre du cours"
              testID="course-title"
              placeholder="Par exemple : Les nombres relatifs"
              value={draft.title}
              onChangeText={(title) => change({ title })}
              maxLength={120}
              editable={!busy}
            />
            <Field
              label="Texte du cours"
              optional
              testID="ai-import-text"
              multiline
              value={draft.sourceText}
              onChangeText={(sourceText) => change({ sourceText })}
              maxLength={150000}
              editable={!busy}
              placeholder="Collez le texte d’un cours, en complément des documents ou à leur place."
            />
            <AppText variant="small" color={colors.muted}>
              Le brouillon de cet import est conservé sur cet appareil pendant
              votre préparation.
            </AppText>
          </Card>
          <Card style={s.column}>
            <View style={[s.row, { justifyContent: "space-between" }]}>
              <AppText variant="heading">3. Les documents du cours</AppText>
              <Badge tone="muted">{draft.sources.length} / 30</Badge>
            </View>
            <AppText color={colors.muted}>
              Une page par photo, le cahier bien à plat. Importez aussi vos PDF,
              puis vérifiez l’ordre et le sens de lecture.
            </AppText>
            <View style={s.row}>
              <Button
                icon="camera"
                onPress={() => void pickImages(true)}
                disabled={!!busy || draft.sources.length >= 30}
                testID="ai-import-camera"
              >
                Prendre une photo
              </Button>
              <Button
                variant="secondary"
                icon="upload"
                onPress={() => void pickImages(false)}
                disabled={!!busy || draft.sources.length >= 30}
                testID="ai-import-photos"
              >
                Photos
              </Button>
              <Button
                variant="ghost"
                icon="file"
                onPress={() => void pickDocuments()}
                disabled={!!busy || draft.sources.length >= 30}
                testID="ai-import-files"
              >
                Fichiers / PDF
              </Button>
            </View>
            {busy && <AppText color={colors.muted}>{busy}</AppText>}
            {draft.sources.length ? (
              <View style={s.grid}>
                {draft.sources.map((source, index) => (
                  <SourcePreview
                    key={source.id}
                    source={source}
                    index={index}
                    controls={
                      <View style={s.row}>
                        <Button
                          variant="ghost"
                          disabled={!!busy || index === 0}
                          accessibilityLabel={
                            "Monter le document " + (index + 1)
                          }
                          icon="arrow-left"
                          onPress={() => move(index, -1)}
                          testID={"ai-source-up-" + index}
                        >
                          Monter
                        </Button>
                        <Button
                          variant="ghost"
                          disabled={
                            !!busy || index === draft.sources.length - 1
                          }
                          accessibilityLabel={
                            "Descendre le document " + (index + 1)
                          }
                          icon="arrow-right"
                          onPress={() => move(index, 1)}
                          testID={"ai-source-down-" + index}
                        >
                          Descendre
                        </Button>
                        {source.mimeType !== "application/pdf" && (
                          <Button
                            variant="ghost"
                            disabled={!!busy}
                            icon="rotate"
                            accessibilityLabel={
                              "Tourner le document " + (index + 1)
                            }
                            onPress={() =>
                              change({
                                sources: draft.sources.map((item) =>
                                  item.id === source.id
                                    ? {
                                        ...item,
                                        rotation:
                                          ((item.rotation ?? 0) + 90) % 360,
                                      }
                                    : item,
                                ),
                              })
                            }
                            testID={"ai-source-rotate-" + index}
                          >
                            Tourner · {source.rotation ?? 0}°
                          </Button>
                        )}
                        <Button
                          variant="danger"
                          disabled={!!busy}
                          accessibilityLabel={
                            "Supprimer le document " + (index + 1)
                          }
                          icon="trash"
                          onPress={() =>
                            change({
                              sources: draft.sources.filter(
                                (item) => item.id !== source.id,
                              ),
                            })
                          }
                          testID={"ai-source-remove-" + index}
                        >
                          Retirer
                        </Button>
                      </View>
                    }
                  />
                ))}
              </View>
            ) : (
              <Card inset style={{ gap: 12, alignItems: "center" }}>
                <AppIcon name="camera" size={32} color={colors.muted} />
                <AppText color={colors.muted} style={{ textAlign: "center" }}>
                  Vos documents apparaîtront ici. Vous pouvez aussi commencer
                  avec du texte ou rédiger la fiche à la main.
                </AppText>
              </Card>
            )}
            <AppText variant="small" color={colors.muted}>
              Les fichiers sont conservés sur cet appareil et, dans l’espace
              familial connecté, sur votre serveur lors de la création du
              brouillon.
            </AppText>
          </Card>
        </View>
        <Card style={{ gap: 16 }}>
          <View style={s.row}>
            <AppIcon name="shield" color={colors.green} />
            <AppText variant="label">
              Vous gardez la main sur ce que {data.childName} reçoit.
            </AppText>
          </View>
          <AppText color={colors.muted}>
            Le cours reste dans votre espace pendant la préparation. Vous
            choisissez ensuite de rédiger la fiche ou de la générer avec l’IA,
            puis de la publier.
          </AppText>
          <Button
            icon="arrow-right"
            onPress={() => void createDraft()}
            disabled={!!busy || !draft.title.trim()}
            testID="create-course-draft"
            style={{ alignSelf: "flex-end" }}
          >
            {busy
              ? busy
              : existing?.status === "draft"
                ? "Enregistrer et préparer la fiche"
                : "Créer le brouillon"}
          </Button>
        </Card>
      </View>
    </ParentLayout>
  );
}
