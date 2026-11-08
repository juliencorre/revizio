import { useState } from "react";
import { Platform, Pressable, View, useWindowDimensions } from "react-native";
import { useRouter } from "expo-router";
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
import {
  Field,
  LoadingParent,
  Notice,
  ParentLayout,
  SourcePreview,
  localId,
  parentStyles as s,
} from "./shared";
export function ImportCourseScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { subjects, addCourse, isReady } = useLearning();
  const [subjectId, setSubjectId] = useState("maths");
  const [title, setTitle] = useState("");
  const [sources, setSources] = useState<CourseSource[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!isReady) return <LoadingParent active="import" />;
  function appendSources(incoming: CourseSource[]) {
    setSources((current) => [...current, ...incoming].slice(0, 12));
    if (sources.length + incoming.length > 12)
      setError(
        "Vous pouvez joindre 12 pages à ce brouillon. Les pages supplémentaires n’ont pas été ajoutées.",
      );
  }
  async function pickImages(camera: boolean) {
    setBusy(true);
    setError("");
    try {
      if (camera && Platform.OS !== "web") {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          setError(
            "L’accès à l’appareil photo est refusé. Autorisez-le dans les réglages ou importez une photo existante.",
          );
          return;
        }
      }
      const result = camera
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ["images"],
            quality: 0.8,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"],
            allowsMultipleSelection: true,
            selectionLimit: 12,
            quality: 0.8,
          });
      if (!result.canceled)
        appendSources(
          result.assets.map((asset, index) => ({
            id: localId("source"),
            name:
              asset.fileName ??
              "Photo " + (sources.length + index + 1) + ".jpg",
            uri: asset.uri,
            mimeType: asset.mimeType ?? "image/jpeg",
          })),
        );
    } catch {
      setError(
        "La photo n’a pas pu être ajoutée. Essayez la galerie ou l’import de fichiers.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function pickDocuments() {
    setBusy(true);
    setError("");
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "image/*"],
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (!result.canceled)
        appendSources(
          result.assets.map((asset) => ({
            id: localId("source"),
            name: asset.name,
            uri: asset.uri,
            mimeType: asset.mimeType,
          })),
        );
    } catch {
      setError(
        "Le document n’a pas pu être importé. Réessayez avec un PDF ou une image.",
      );
    } finally {
      setBusy(false);
    }
  }
  function move(index: number, direction: -1 | 1) {
    setSources((current) => {
      const next = [...current];
      const to = index + direction;
      if (to >= 0 && to < next.length)
        [next[index], next[to]] = [next[to], next[index]];
      return next;
    });
  }
  function createDraft() {
    if (!title.trim()) {
      setError("Donnez un titre à ce cours pour le retrouver facilement.");
      return;
    }
    if (!subjects.some((subject) => subject.id === subjectId)) {
      setError("Choisissez une matière.");
      return;
    }
    const id = addCourse({ title: title.trim(), subjectId, sources });
    router.replace({ pathname: "/parent/review/[id]", params: { id } });
  }
  return (
    <ParentLayout active="import">
      <View testID="parent-import" style={{ gap: 26 }}>
        <PageHeading
          eyebrow="Un cours, une fiche claire"
          title="Ajouter un cours"
          description="Rassemblez les pages du cours, puis préparez la fiche à partager."
        />
        <Notice>
          La génération IA arrive dans un prochain lot. Vous pouvez déjà
          importer les documents et rédiger la fiche avant de la publier.
        </Notice>
        {error ? <Notice error>{error}</Notice> : null}
        <View
          style={[s.grid, { flexDirection: width >= 1150 ? "row" : "column" }]}
        >
          <Card style={s.column}>
            <AppText variant="heading">1. La matière</AppText>
            <View style={s.grid}>
              {subjects.map((subject) => (
                <Pressable
                  key={subject.id}
                  accessibilityRole="radio"
                  accessibilityLabel={subject.title}
                  accessibilityState={{ checked: subjectId === subject.id }}
                  onPress={() => setSubjectId(subject.id)}
                  style={[
                    s.choice,
                    subjectId === subject.id && s.selected,
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
                      subjectId === subject.id ? colors.primary : colors.ink
                    }
                  >
                    {subject.shortLabel}
                  </AppText>
                  {subjectId === subject.id && (
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
              value={title}
              onChangeText={setTitle}
              maxLength={120}
            />
            <AppText variant="small" color={colors.muted}>
              Vous pourrez modifier ce titre pendant la relecture.
            </AppText>
          </Card>
          <Card style={s.column}>
            <View style={[s.row, { justifyContent: "space-between" }]}>
              <AppText variant="heading">3. Les pages du cours</AppText>
              <Badge tone="muted">{sources.length} / 12</Badge>
            </View>
            <AppText color={colors.muted}>
              Une page par photo, le cahier bien à plat et une bonne lumière.
            </AppText>
            <View style={s.row}>
              <Button
                icon="camera"
                onPress={() => pickImages(true)}
                disabled={busy || sources.length >= 12}
              >
                Prendre une photo
              </Button>
              <Button
                variant="secondary"
                icon="upload"
                onPress={() => pickImages(false)}
                disabled={busy || sources.length >= 12}
              >
                Photos
              </Button>
              <Button
                variant="ghost"
                icon="file"
                onPress={pickDocuments}
                disabled={busy || sources.length >= 12}
              >
                Fichiers / PDF
              </Button>
            </View>
            {busy && (
              <AppText color={colors.muted}>
                Ouverture de vos documents…
              </AppText>
            )}
            {sources.length ? (
              <View style={s.grid}>
                {sources.map((source, index) => (
                  <SourcePreview
                    key={source.id}
                    source={source}
                    index={index}
                    controls={
                      <View style={s.row}>
                        <Button
                          variant="ghost"
                          disabled={index === 0}
                          accessibilityLabel={"Monter la page " + (index + 1)}
                          icon="arrow-left"
                          onPress={() => move(index, -1)}
                        >
                          Monter
                        </Button>
                        <Button
                          variant="ghost"
                          disabled={index === sources.length - 1}
                          accessibilityLabel={
                            "Descendre la page " + (index + 1)
                          }
                          icon="arrow-right"
                          onPress={() => move(index, 1)}
                        >
                          Descendre
                        </Button>
                        <Button
                          variant="danger"
                          accessibilityLabel={
                            "Supprimer la page " + (index + 1)
                          }
                          icon="trash"
                          onPress={() =>
                            setSources((current) =>
                              current.filter((item) => item.id !== source.id),
                            )
                          }
                        >
                          Retirer
                        </Button>
                      </View>
                    }
                  />
                ))}
              </View>
            ) : (
              <View
                style={{
                  minHeight: 170,
                  borderWidth: 1,
                  borderStyle: "dashed",
                  borderColor: "#CCD0E0",
                  borderRadius: 20,
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 12,
                  padding: 20,
                }}
              >
                <AppIcon name="camera" size={32} color={colors.muted} />
                <AppText color={colors.muted} style={{ textAlign: "center" }}>
                  Vos pages apparaîtront ici.{"\n"}Vous pouvez aussi commencer
                  sans document.
                </AppText>
              </View>
            )}
            <AppText variant="small" color={colors.muted}>
              Gardez vos originaux : les pièces jointes restent locales et
              pourront devoir être sélectionnées à nouveau après fermeture.
            </AppText>
          </Card>
        </View>
        <Card style={{ gap: 16 }}>
          <View style={s.row}>
            <AppIcon name="shield" color={colors.green} />
            <AppText variant="label">
              Vous gardez la main sur ce qu’Alex reçoit.
            </AppText>
          </View>
          <AppText color={colors.muted}>
            Le cours restera en brouillon pendant la préparation. Alex le verra
            seulement après votre validation.
          </AppText>
          <Button
            icon="arrow-right"
            onPress={createDraft}
            disabled={busy || !title.trim()}
            testID="create-course-draft"
            style={{ alignSelf: "flex-end" }}
          >
            Créer le brouillon
          </Button>
        </Card>
      </View>
    </ParentLayout>
  );
}
