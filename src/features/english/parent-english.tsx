import { useState } from "react";
import { Platform, Pressable, View, useWindowDimensions } from "react-native";
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
import { useLearning } from "@/state/learning-store";
import type { CourseSource, EnglishSettings } from "@/domain/model";
import {
  defaultToolWords,
  englishTenses,
  englishValidation,
  generateBoundedQuiz,
  normalizeEnglish,
} from "@/domain/english";
import {
  Field,
  Notice,
  localId,
  parentStyles as common,
} from "@/features/parent/shared";
import { StudyWorkspace } from "@/features/planning/shared";
import { useLocalDraft } from "@/features/planning/use-local-draft";

function isSettings(value: unknown): value is EnglishSettings {
  if (!value || typeof value !== "object") return false;
  const data = value as EnglishSettings;
  return (
    Array.isArray(data.words) &&
    data.words.every(
      (word) =>
        word &&
        typeof word.id === "string" &&
        typeof word.en === "string" &&
        typeof word.fr === "string",
    ) &&
    Array.isArray(data.verbs) &&
    data.verbs.every(
      (verb) =>
        verb &&
        typeof verb.id === "string" &&
        typeof verb.base === "string" &&
        typeof verb.past === "string" &&
        typeof verb.participle === "string" &&
        typeof verb.meaning === "string",
    ) &&
    Array.isArray(data.tenses) &&
    data.tenses.every((tense) => typeof tense === "string") &&
    Array.isArray(data.toolWords) &&
    data.toolWords.every((word) => typeof word === "string")
  );
}
function mergeExtracted(
  current: EnglishSettings,
  incoming: EnglishSettings,
): EnglishSettings {
  return {
    words: [
      ...new Map(
        [...current.words, ...incoming.words].map((word) => [
          word.en.trim().toLocaleLowerCase("en"),
          word,
        ]),
      ).values(),
    ],
    verbs: [
      ...new Map(
        [...current.verbs, ...incoming.verbs].map((verb) => [
          verb.base.trim().toLocaleLowerCase("en"),
          verb,
        ]),
      ).values(),
    ],
    tenses: [...new Set([...current.tenses, ...incoming.tenses])],
    toolWords: [
      ...new Map(
        [...current.toolWords, ...incoming.toolWords].map((word) => [
          word.trim().toLocaleLowerCase("en"),
          word,
        ]),
      ).values(),
    ],
  };
}
export function ParentEnglishScreen() {
  const data = useLearning();
  const { width } = useWindowDimensions();
  const [settings, setSettings, draft] = useLocalDraft<EnglishSettings>(
    "revizo.english-editor." + (data.activeProfileId ?? "demo"),
    data.english,
    isSettings,
  );
  const [wordEn, setWordEn] = useState("");
  const [wordFr, setWordFr] = useState("");
  const [verb, setVerb] = useState({
    base: "",
    past: "",
    participle: "",
    meaning: "",
  });
  const [toolInput, setToolInput] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const showToolInput = toolInput ?? settings.toolWords.join(", ");
  const effective: EnglishSettings = {
    ...settings,
    toolWords: showToolInput
      .split(/[,;\n]/)
      .map((word) => word.trim())
      .filter(Boolean),
  };
  let sample: ReturnType<typeof generateBoundedQuiz> = [];
  try {
    sample = generateBoundedQuiz(effective, 5);
  } catch {}
  function change(next: EnglishSettings) {
    setSettings(next);
    setPreview(false);
    setConfirmed(false);
    setError("");
    setMessage("");
  }
  function addWord() {
    if (!wordEn.trim() || !wordFr.trim()) {
      setError("Écrivez le mot anglais et sa traduction.");
      return;
    }
    const next = {
      ...settings,
      words: [
        ...settings.words,
        { id: localId("word"), en: wordEn.trim(), fr: wordFr.trim() },
      ],
    };
    const issue = englishValidation({
      ...next,
      toolWords: effective.toolWords,
    });
    if (issue) {
      setError(issue);
      return;
    }
    change(next);
    setWordEn("");
    setWordFr("");
  }
  function addVerb() {
    if (Object.values(verb).some((value) => !value.trim())) {
      setError(
        "Complétez la base verbale, le prétérit, le participe passé et le sens.",
      );
      return;
    }
    const next = {
      ...settings,
      verbs: [...settings.verbs, { id: localId("verb"), ...verb }],
    };
    const issue = englishValidation({
      ...next,
      toolWords: effective.toolWords,
    });
    if (issue) {
      setError(issue);
      return;
    }
    change(next);
    setVerb({ base: "", past: "", participle: "", meaning: "" });
  }
  async function importSources(sources: CourseSource[]) {
    if (!sources.length) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await data.extractEnglish(sources);
      const next = mergeExtracted(effective, result);
      setSettings(next);
      setToolInput(next.toolWords.join(", "));
      setPreview(false);
      setConfirmed(false);
      setMessage(
        "Les éléments lus ont été ajoutés au brouillon. Vérifiez chaque mot, chaque forme et les temps avant de les partager.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "La lecture du document a échoué. Réessayez ou complétez les listes à la main.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function photos(camera = false) {
    try {
      if (camera && Platform.OS !== "web") {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          setError(
            "L’accès à la caméra est refusé. Utilisez Photos ou Fichiers, ou autorisez la caméra dans les réglages.",
          );
          return;
        }
      }
      const result = camera
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ["images"],
            quality: 0.9,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"],
            allowsMultipleSelection: true,
            selectionLimit: 8,
            quality: 0.9,
          });
      if (!result.canceled)
        await importSources(
          result.assets.map((asset, index) => ({
            id: localId("english-source"),
            name: asset.fileName ?? `Anglais page ${index + 1}.jpg`,
            uri: asset.uri,
            mimeType: asset.mimeType ?? "image/jpeg",
          })),
        );
    } catch {
      setError(
        "Le sélecteur de photos n’a pas pu être ouvert. Essayez l’import de fichiers.",
      );
    }
  }
  async function documents() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "image/*"],
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (!result.canceled)
        await importSources(
          result.assets.map((asset) => ({
            id: localId("english-source"),
            name: asset.name,
            uri: asset.uri,
            mimeType: asset.mimeType,
          })),
        );
    } catch {
      setError("Le fichier n’a pas pu être sélectionné.");
    }
  }
  function openPreview() {
    const issue = englishValidation(effective);
    if (issue) {
      setError(issue);
      return;
    }
    if (!effective.words.length && !effective.verbs.length) {
      setError("Ajoutez au moins un mot ou un verbe à réviser.");
      return;
    }
    if (
      wordEn.trim() ||
      wordFr.trim() ||
      Object.values(verb).some((value) => value.trim())
    ) {
      setError(
        "Ajoutez les éléments en cours de saisie à la liste avant de la relire.",
      );
      return;
    }
    setPreview(true);
    setError("");
    setMessage(
      "Relisez les exemples d’exercices puis confirmez la publication.",
    );
  }
  function publish() {
    const issue = englishValidation(effective);
    if (issue) {
      setError(issue);
      return;
    }
    if (!confirmed) {
      setError("Confirmez la relecture du répertoire.");
      return;
    }
    try {
      const normalized = normalizeEnglish(effective);
      data.updateEnglish(normalized);
      setSettings(normalized);
      setToolInput(normalized.toolWords.join(", "));
      setMessage(
        "Le répertoire est enregistré pour votre enfant. Ses cartes et exercices sont disponibles dans « Mon anglais ».",
      );
      setError("");
      setConfirmed(false);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Le répertoire n’a pas pu être publié.",
      );
    }
  }
  if (!draft.ready)
    return (
      <StudyWorkspace role="parent" active="english">
        <Card>
          <AppText>On retrouve votre brouillon d’anglais…</AppText>
        </Card>
      </StudyWorkspace>
    );
  return (
    <StudyWorkspace role="parent" active="english">
      <View testID="parent-english" style={{ gap: 26 }}>
        <PageHeading
          eyebrow="Au plus près de sa classe"
          title="Son répertoire d’anglais"
          description="Les exercices utiliseront les mots, les verbes et les temps que vous avez vérifiés."
        />
        {draft.error && <Notice error>{draft.error}</Notice>}
        {error && <Notice error>{error}</Notice>}
        {message && <Notice success>{message}</Notice>}
        <Card style={{ gap: 16 }}>
          <View style={[common.row, { justifyContent: "space-between" }]}>
            <AppText variant="heading">Depuis un document du cours</AppText>
            <Badge tone="muted">Brouillon avant publication</Badge>
          </View>
          <AppText color={colors.muted}>
            Photographiez les mots et les verbes étudiés. Vous pourrez corriger
            la lecture avant de la partager.
          </AppText>
          <View style={common.row}>
            <Button
              icon="camera"
              onPress={() => void photos(true)}
              disabled={busy}
            >
              Photographier
            </Button>
            <Button
              icon="upload"
              variant="secondary"
              onPress={() => void photos(false)}
              disabled={busy}
            >
              Photos
            </Button>
            <Button
              icon="file"
              variant="secondary"
              onPress={() => void documents()}
              disabled={busy}
            >
              Fichiers / PDF
            </Button>
          </View>
          {busy && (
            <Notice>
              Lecture du document en cours. Vous pouvez garder cette page
              ouverte ; aucune liste ne sera publiée automatiquement.
            </Notice>
          )}
        </Card>
        <Card style={{ gap: 18 }}>
          <View style={[common.row, { justifyContent: "space-between" }]}>
            <AppText variant="heading">Les mots à connaître</AppText>
            <Badge>{settings.words.length} mots</Badge>
          </View>
          <View style={common.row}>
            <View style={{ flex: 1, minWidth: 180 }}>
              <Field
                label="Nouveau mot anglais"
                value={wordEn}
                onChangeText={setWordEn}
                autoCapitalize="none"
                testID="english-word-en"
                placeholder="castle"
                maxLength={100}
              />
            </View>
            <View style={{ flex: 1, minWidth: 180 }}>
              <Field
                label="Traduction du nouveau mot"
                value={wordFr}
                onChangeText={setWordFr}
                testID="english-word-fr"
                placeholder="château"
                maxLength={150}
              />
            </View>
            <Button icon="plus" onPress={addWord} testID="add-english-word">
              Ajouter le mot
            </Button>
          </View>
          {settings.words.length === 0 && (
            <AppText color={colors.muted}>
              Commencez par les mots de son dernier cours.
            </AppText>
          )}
          {settings.words.map((word, index) => (
            <View key={word.id} style={common.row}>
              <View style={{ flex: 1, minWidth: 160 }}>
                <Field
                  label={"Mot anglais " + (index + 1)}
                  value={word.en}
                  onChangeText={(en) =>
                    change({
                      ...settings,
                      words: settings.words.map((item) =>
                        item.id === word.id ? { ...item, en } : item,
                      ),
                    })
                  }
                  autoCapitalize="none"
                  maxLength={100}
                />
              </View>
              <View style={{ flex: 1, minWidth: 160 }}>
                <Field
                  label={"Traduction du mot " + (index + 1)}
                  value={word.fr}
                  onChangeText={(fr) =>
                    change({
                      ...settings,
                      words: settings.words.map((item) =>
                        item.id === word.id ? { ...item, fr } : item,
                      ),
                    })
                  }
                  maxLength={150}
                />
              </View>
              <Button
                icon="trash"
                variant="danger"
                accessibilityLabel={"Retirer le mot " + word.en}
                onPress={() =>
                  change({
                    ...settings,
                    words: settings.words.filter((item) => item.id !== word.id),
                  })
                }
              >
                Retirer
              </Button>
            </View>
          ))}
        </Card>
        <Card style={{ gap: 18 }}>
          <View style={[common.row, { justifyContent: "space-between" }]}>
            <AppText variant="heading">Les verbes étudiés</AppText>
            <Badge>{settings.verbs.length} verbes</Badge>
          </View>
          <AppText color={colors.muted}>
            Renseignez les formes telles qu’elles apparaissent dans le cours.
          </AppText>
          <View style={common.row}>
            {(
              [
                { key: "base", label: "Base verbale", placeholder: "go" },
                { key: "past", label: "Prétérit", placeholder: "went" },
                {
                  key: "participle",
                  label: "Participe passé",
                  placeholder: "gone",
                },
                {
                  key: "meaning",
                  label: "Sens en français",
                  placeholder: "aller",
                },
              ] as const
            ).map((item) => (
              <View key={item.key} style={{ flex: 1, minWidth: 150 }}>
                <Field
                  label={"Nouveau verbe — " + item.label}
                  value={verb[item.key]}
                  onChangeText={(value) =>
                    setVerb((current) => ({ ...current, [item.key]: value }))
                  }
                  autoCapitalize="none"
                  placeholder={item.placeholder}
                  maxLength={100}
                  testID={"english-verb-" + item.key}
                />
              </View>
            ))}
          </View>
          <Button icon="plus" onPress={addVerb} testID="add-english-verb">
            Ajouter le verbe
          </Button>
          {settings.verbs.map((item, index) => (
            <View
              key={item.id}
              style={{
                gap: 12,
                paddingVertical: 12,
                borderBottomWidth: 1,
                borderColor: colors.border,
              }}
            >
              <View
                style={{
                  flexDirection: width >= 1100 ? "row" : "column",
                  gap: 12,
                }}
              >
                {(
                  [
                    { key: "base", label: "Base verbale" },
                    { key: "past", label: "Prétérit" },
                    { key: "participle", label: "Participe passé" },
                    { key: "meaning", label: "Sens" },
                  ] as const
                ).map((column) => (
                  <View key={column.key} style={{ flex: 1, minWidth: 100 }}>
                    <Field
                      label={column.label + " du verbe " + (index + 1)}
                      value={item[column.key]}
                      autoCapitalize="none"
                      onChangeText={(value) =>
                        change({
                          ...settings,
                          verbs: settings.verbs.map((verb) =>
                            verb.id === item.id
                              ? { ...verb, [column.key]: value }
                              : verb,
                          ),
                        })
                      }
                      maxLength={100}
                    />
                  </View>
                ))}
              </View>
              <Button
                variant="danger"
                icon="trash"
                accessibilityLabel={"Retirer le verbe " + item.base}
                onPress={() =>
                  change({
                    ...settings,
                    verbs: settings.verbs.filter((verb) => verb.id !== item.id),
                  })
                }
                style={{ alignSelf: "flex-end" }}
              >
                Retirer ce verbe
              </Button>
            </View>
          ))}
        </Card>
        <Card style={{ gap: 18 }}>
          <AppText variant="heading">Temps étudiés en classe</AppText>
          <AppText color={colors.muted}>
            Les cartes de verbes et les exercices restent limités aux temps
            cochés.
          </AppText>
          <View style={common.grid}>
            {englishTenses.map((tense) => {
              const selected = settings.tenses.includes(tense.id);
              return (
                <Pressable
                  key={tense.id}
                  accessibilityRole="checkbox"
                  accessibilityLabel={tense.label}
                  accessibilityState={{ checked: selected }}
                  testID={"english-tense-" + tense.id}
                  onPress={() =>
                    change({
                      ...settings,
                      tenses: selected
                        ? settings.tenses.filter((id) => id !== tense.id)
                        : [...settings.tenses, tense.id],
                    })
                  }
                  style={[
                    common.choice,
                    { flexGrow: 1, minWidth: 220 },
                    selected && common.selected,
                  ]}
                >
                  <AppIcon name={selected ? "check" : "clock"} />
                  <View style={{ flex: 1 }}>
                    <AppText variant="label">{tense.label}</AppText>
                    <AppText variant="small" color={colors.muted}>
                      {tense.example}
                    </AppText>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </Card>
        <Card style={{ gap: 16 }}>
          <AppText variant="heading">Les mots outils autorisés</AppText>
          <AppText color={colors.muted}>
            Articles, pronoms et auxiliaires servent à former les phrases.
            Définissez ceux que l’enfant connaît ; les mots ciblés restent ceux
            des listes ci-dessus.
          </AppText>
          <Field
            label="Mots outils, séparés par des virgules"
            value={showToolInput}
            multiline
            onChangeText={(value) => {
              setToolInput(value);
              setPreview(false);
              setConfirmed(false);
            }}
            placeholder="I, you, the, a, to…"
            maxLength={2000}
          />
          <Button
            variant="secondary"
            icon="plus"
            onPress={() => {
              setToolInput(
                [
                  ...new Map(
                    [...effective.toolWords, ...defaultToolWords].map(
                      (word) => [word.toLocaleLowerCase("en"), word],
                    ),
                  ).values(),
                ].join(", "),
              );
              setConfirmed(false);
              setPreview(false);
            }}
          >
            Proposer les mots outils courants
          </Button>
        </Card>
        <Card style={{ gap: 18 }}>
          <View style={common.row}>
            <Badge>{settings.words.length} mots</Badge>
            <Badge>{settings.verbs.length} verbes</Badge>
            <Badge>{settings.tenses.length} temps</Badge>
          </View>
          <AppText color={colors.muted}>
            Votre brouillon est conservé sur cet appareil. La publication met à
            jour les cartes et les exercices de l’enfant.
          </AppText>
          <Button
            icon="book"
            variant="secondary"
            onPress={openPreview}
            testID="preview-english"
          >
            Prévisualiser les exercices
          </Button>
          {preview && (
            <View style={{ gap: 16 }}>
              <AppText variant="heading">
                Quelques questions qui seront proposées
              </AppText>
              {sample.map((question) => (
                <View
                  key={question.id}
                  style={{
                    gap: 6,
                    padding: 16,
                    borderRadius: 16,
                    backgroundColor: colors.primaryLight,
                  }}
                >
                  <AppText variant="label">{question.prompt}</AppText>
                  <AppText color={colors.green}>
                    Réponse :{" "}
                    {question.expectedAnswers?.[0] ??
                      question.choices.find(
                        (choice) => choice.id === question.correctChoiceId,
                      )?.label}
                  </AppText>
                </View>
              ))}
              <Button
                icon={confirmed ? "check" : "shield"}
                variant={confirmed ? "secondary" : "ghost"}
                accessibilityLabel={
                  confirmed
                    ? "Répertoire anglais relu"
                    : "Confirmer la relecture du répertoire anglais"
                }
                onPress={() => setConfirmed(!confirmed)}
              >
                {confirmed
                  ? "J’ai relu les listes et les exemples"
                  : "Je confirme avoir relu les listes et les exemples"}
              </Button>
              <Button
                icon="check"
                onPress={publish}
                disabled={!confirmed || busy}
                testID="publish-english"
              >
                Enregistrer pour {data.childName ?? "mon enfant"}
              </Button>
            </View>
          )}
        </Card>
      </View>
    </StudyWorkspace>
  );
}
