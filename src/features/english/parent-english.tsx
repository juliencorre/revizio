import { ParentConjugation } from "./parent-conjugation";
import { legacyEnglishListId } from "@/domain/vocabulary";
import { subjectHref } from "@/features/parent/subject-navigation";
import { useEffect, useRef, useState } from "react";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, View, useWindowDimensions } from "react-native";
import { LanguageSourceImport } from "@/features/parent/import-sources";
import { documentExamples } from "@/services/pick-documents";
import {
  AppIcon,
  AppText,
  Badge,
  Button,
  Card,
  PageHeading,
} from "@/components/ui";
import { useTheme } from "@/theme";
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
  useParentStyles,
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
    ...current,
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
  const { section, verb, tense } = useLocalSearchParams<{
    section?: string;
    verb?: string;
    tense?: string;
  }>();
  const data = useLearning();
  if (!data.isReady)
    return (
      <StudyWorkspace role="parent" active="english">
        <AppText>Chargement de l’anglais…</AppText>
      </StudyWorkspace>
    );
  if (data.subjectVisibility?.english === false)
    return <Redirect href="/parent/subjects" />;
  if (section === "conjugaison")
    return (
      <ParentConjugation
        key={JSON.stringify([data.activeProfileId, verb, tense])}
        initialVerb={verb}
        initialTense={tense}
      />
    );
  return <EnglishEditor key={data.activeProfileId} />;
}
function EnglishEditor() {
  const { colors } = useTheme();
  const common = useParentStyles();
  const router = useRouter();
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
  useEffect(() => {
    if (
      !draft.ready ||
      (settings.wordsRevision ?? 0) === (data.english.wordsRevision ?? 0)
    )
      return;
    setSettings((current) => ({
      ...current,
      words: data.english.words,
      wordsRevision: data.english.wordsRevision ?? 0,
    }));
    setPreview(false);
    setConfirmed(false);
    setMessage(
      "Le vocabulaire publié a été mis à jour. Votre brouillon de verbes et de temps est conservé.",
    );
  }, [
    draft.ready,
    settings.wordsRevision,
    data.english.wordsRevision,
    data.english.words,
    setSettings,
  ]);
  const showToolInput = toolInput ?? settings.toolWords.join(", ");
  const liveToolInput = useRef(showToolInput);
  liveToolInput.current = showToolInput;
  const effective: EnglishSettings = {
    ...settings,
    toolWords: showToolInput
      .split(/[,;\n]/)
      .map((word) => word.trim())
      .filter(Boolean),
  };
  let sample: ReturnType<typeof generateBoundedQuiz> = [];
  try {
    sample = generateBoundedQuiz(
      effective,
      5,
      data.vocabularyLists.find((list) => list.id === legacyEnglishListId)
        ?.requireArticles,
    );
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
      ...effective,
      verbs: next.verbs,
    });
    if (issue) {
      setError(issue);
      return;
    }
    change(next);
    setVerb({ base: "", past: "", participle: "", meaning: "" });
  }
  async function importSources(sources: CourseSource[]) {
    setError("");
    setMessage("");
    const result = await data.extractEnglish(sources);
    const toolWords = liveToolInput.current
      .split(/[,;\n]/)
      .map((word) => word.trim())
      .filter(Boolean);
    setSettings((current) => mergeExtracted({ ...current, toolWords }, result));
    setToolInput(null);
    setPreview(false);
    setConfirmed(false);
    setMessage(
      "Les éléments lus ont été ajoutés au brouillon. Vérifiez-les avant de les partager.",
    );
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
        <Button
          icon="languages"
          onPress={() => router.navigate(subjectHref("english", "vocabulaire"))}
        >
          Gérer mes listes de vocabulaire et leur suivi
        </Button>
        {draft.error && <Notice error>{draft.error}</Notice>}
        {error && <Notice error>{error}</Notice>}
        {message && <Notice success>{message}</Notice>}
        <Card style={{ gap: 16 }}>
          <AppText variant="heading">Documents du cours</AppText>
          <AppText color={colors.muted}>{documentExamples}.</AppText>
          <LanguageSourceImport
            onAnalyze={importSources}
            onBusyChange={setBusy}
          />
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
