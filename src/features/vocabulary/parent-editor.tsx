import { subjectHref } from "@/features/parent/subject-navigation";
import { useEffect, useRef, useState } from "react";
import { View, type ScrollViewInstance } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  AppText,
  Badge,
  Button,
  Card,
  IconButton,
  PageHeading,
  useWindowClass,
} from "@/components/ui";
import { useLearning } from "@/state/learning-store";
import type { VocabularyList } from "@/domain/model";
import {
  isVocabularyList,
  legacyEnglishListId,
  languageLabel,
  normalizeVocabularyList,
  parseVocabularyLines,
  vocabularyLanguage,
  vocabularyListError,
  vocabularyProgress,
} from "@/domain/vocabulary";
import { Field, Notice, ParentLayout, localId } from "@/features/parent/shared";
import { useLocalDraft } from "@/features/planning/use-local-draft";
import { spacing } from "@/theme";
import {
  MasteryRule,
  VocabularySummary,
  WordProgressList,
  vocabularyStyles,
} from "./shared";

export function ParentVocabularyEditor() {
  const data = useLearning();
  const { id } = useLocalSearchParams<{ id: string }>();
  return data.isReady ? (
    <VocabularyEditor key={`${data.activeProfileId}.${id}`} />
  ) : (
    <ParentLayout active="vocabulary">
      <Card>
        <AppText>On retrouve votre liste…</AppText>
      </Card>
    </ParentLayout>
  );
}
function VocabularyEditor() {
  const scrollRef = useRef<ScrollViewInstance>(null);
  const data = useLearning();
  const router = useRouter();
  const { id, language: requestedLanguage } = useLocalSearchParams<{
    id: string;
    language?: string;
  }>();
  const saved = data.vocabularyLists.find((list) => list.id === id);
  const language = saved?.language ?? vocabularyLanguage(requestedLanguage);
  const compact = useWindowClass() === "compact";
  const [fallback] = useState<VocabularyList>(
    () =>
      saved ?? {
        id,
        language,
        title: "",
        status: "draft",
        words: [{ id: localId("word"), term: "", translation: "" }],
      },
  );
  const [list, setList, draft] = useLocalDraft(
    `revizo.vocabulary-editor.${data.activeProfileId}.${id}`,
    fallback,
    (value): value is VocabularyList =>
      isVocabularyList(value) && value.id === id && value.language === language,
  );
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [bulk, setBulk] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => {
    if (!draft.ready || id !== legacyEnglishListId) return;
    const revision = data.english.wordsRevision ?? 0;
    if ((list.englishWordsRevision ?? 0) === revision) return;
    setList((current) => ({
      ...current,
      words: data.english.words.map((word) => ({
        id: word.id,
        term: word.en,
        translation: word.fr,
      })),
      englishWordsRevision: revision,
    }));
    setMessage(
      "Les mots du répertoire anglais ont été actualisés dans cette liste.",
    );
  }, [
    draft.ready,
    id,
    list.englishWordsRevision,
    data.english.wordsRevision,
    data.english.words,
    setList,
  ]);
  const progress = vocabularyProgress(saved ?? list, data.vocabularySessions);
  function change(next: VocabularyList) {
    setList(next);
    setMessage("");
    setError("");
  }
  function save(status: VocabularyList["status"]) {
    try {
      const next = normalizeVocabularyList({ ...list, status });
      const issue =
        status === "published"
          ? vocabularyListError(next)
          : !next.title
            ? "Donnez un titre à la liste."
            : null;
      if (issue) {
        setError(issue);
        scrollRef.current?.scrollTo({ y: 0, animated: false });
        return;
      }
      data.saveVocabularyList(next);
      setList(next);
      setError("");
      setMessage(
        status === "published"
          ? `La liste est publiée pour ${data.childName}. Les exercices sont disponibles dans sa matière.`
          : "Le brouillon est enregistré dans l’espace parent.",
      );
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    } catch (cause) {
      scrollRef.current?.scrollTo({ y: 0, animated: false });
      setError(
        cause instanceof Error
          ? cause.message
          : "La liste n’a pas pu être enregistrée.",
      );
    }
  }
  function importWords() {
    try {
      const incoming = parseVocabularyLines(bulkText);
      if (!incoming.length)
        throw new Error("Collez au moins une ligne de vocabulaire.");
      const words = [
        ...list.words.filter(
          (word) => word.term.trim() || word.translation.trim(),
        ),
        ...incoming.map((word) => ({ ...word, id: localId("word") })),
      ];
      if (words.length > 200)
        throw new Error(
          "Une liste peut contenir jusqu’à 200 mots. Répartissez le vocabulaire dans plusieurs listes.",
        );
      change({ ...list, words });
      setBulkText("");
      setBulk(false);
    } catch (cause) {
      scrollRef.current?.scrollTo({ y: 0, animated: false });
      setError(
        cause instanceof Error
          ? cause.message
          : "La liste collée est invalide.",
      );
    }
  }
  return (
    <ParentLayout
      active="vocabulary"
      scrollRef={scrollRef}
      subjectId={language}
    >
      <View style={vocabularyStyles.section} testID="vocabulary-editor">
        <Button
          icon="arrow-left"
          variant="ghost"
          onPress={() => router.navigate(subjectHref(language, "vocabulaire"))}
        >
          Mes listes de vocabulaire
        </Button>
        <PageHeading
          title={saved ? saved.title : "Créer une liste de vocabulaire"}
          description={`${languageLabel(language)} ↔ Français · Pour ${data.childName}`}
        />
        {!data.isReady || !draft.ready ? (
          <Card>
            <AppText>On retrouve votre liste…</AppText>
          </Card>
        ) : (
          <>
            {draft.error && <Notice error>{draft.error}</Notice>}
            {error && <Notice error>{error}</Notice>}
            {message && <Notice success>{message}</Notice>}
            <Card style={{ gap: spacing.xl }}>
              <View style={vocabularyStyles.row}>
                <AppText variant="heading">Les mots à apprendre</AppText>
                <Badge tone={saved?.status === "published" ? "green" : "muted"}>
                  {saved?.status === "published"
                    ? "Liste publiée"
                    : "Brouillon privé"}
                </Badge>
              </View>
              <Field
                label="Titre de la liste"
                testID="vocabulary-title"
                value={list.title}
                maxLength={160}
                placeholder="À la maison, chapitre 3…"
                onChangeText={(title) => change({ ...list, title })}
              />
              <AppText variant="small">
                Pour accepter plusieurs traductions ou variantes, séparez-les
                par un point-virgule. Exemple : bonjour ; salut.
              </AppText>
              {list.words.map((word, index) => (
                <View
                  key={word.id}
                  style={vocabularyStyles.wordRow}
                  testID={`vocabulary-editor-word-${index}`}
                >
                  <View
                    style={[
                      vocabularyStyles.row,
                      { justifyContent: "space-between" },
                    ]}
                  >
                    <AppText variant="label">Mot {index + 1}</AppText>
                    <IconButton
                      icon="trash"
                      label={`Retirer le mot ${index + 1}`}
                      onPress={() =>
                        change({
                          ...list,
                          words: list.words.filter(
                            (item) => item.id !== word.id,
                          ),
                        })
                      }
                    />
                  </View>
                  <View
                    style={[vocabularyStyles.row, { alignItems: "flex-start" }]}
                  >
                    <View
                      style={{
                        flexGrow: 1,
                        flexBasis: compact ? "100%" : 220,
                        minWidth: 0,
                      }}
                    >
                      <Field
                        label={`Mot en ${languageLabel(language).toLocaleLowerCase("fr")} ${index + 1}`}
                        testID={`vocabulary-term-${index}`}
                        value={word.term}
                        maxLength={300}
                        autoCapitalize="none"
                        autoCorrect={false}
                        onChangeText={(term) =>
                          change({
                            ...list,
                            words: list.words.map((item) =>
                              item.id === word.id ? { ...item, term } : item,
                            ),
                          })
                        }
                      />
                    </View>
                    <View
                      style={{
                        flexGrow: 1,
                        flexBasis: compact ? "100%" : 220,
                        minWidth: 0,
                      }}
                    >
                      <Field
                        label={`Traduction en français ${index + 1}`}
                        testID={`vocabulary-translation-${index}`}
                        value={word.translation}
                        maxLength={300}
                        autoCapitalize="none"
                        autoCorrect={false}
                        onChangeText={(translation) =>
                          change({
                            ...list,
                            words: list.words.map((item) =>
                              item.id === word.id
                                ? { ...item, translation }
                                : item,
                            ),
                          })
                        }
                      />
                    </View>
                  </View>
                </View>
              ))}
              <View style={vocabularyStyles.row}>
                <Button
                  icon="plus"
                  variant="secondary"
                  testID="add-vocabulary-word"
                  disabled={list.words.length >= 200}
                  onPress={() =>
                    change({
                      ...list,
                      words: [
                        ...list.words,
                        { id: localId("word"), term: "", translation: "" },
                      ],
                    })
                  }
                >
                  Ajouter un mot
                </Button>
                <Button
                  icon="file"
                  variant="ghost"
                  expanded={bulk}
                  onPress={() => setBulk(!bulk)}
                >
                  Coller une liste
                </Button>
              </View>
              {bulk && (
                <View style={{ gap: spacing.md }}>
                  <Field
                    label="Une paire par ligne : mot = traduction"
                    multiline
                    value={bulkText}
                    onChangeText={setBulkText}
                    placeholder={
                      language === "spanish"
                        ? "casa = maison\namigo = ami"
                        : language === "latin"
                          ? "rosa = rose\naqua = eau"
                          : "house = maison\nfriend = ami"
                    }
                  />
                  <Button icon="plus" onPress={importWords}>
                    Ajouter ces mots
                  </Button>
                </View>
              )}
              <AppText variant="small">
                Le brouillon de cet écran est conservé sur cet appareil. Publiez
                la liste pour rendre ses mots et exercices accessibles à
                l’enfant. Une traduction modifiée remet le mot à découvrir.
              </AppText>
              <View style={vocabularyStyles.row}>
                <Button
                  icon="save"
                  variant="secondary"
                  testID="save-vocabulary-draft"
                  onPress={() => save("draft")}
                >
                  Enregistrer le brouillon
                </Button>
                <Button
                  icon="check"
                  testID="publish-vocabulary-list"
                  onPress={() => save("published")}
                >
                  {saved?.status === "published"
                    ? "Publier les modifications"
                    : `Publier pour ${data.childName}`}
                </Button>
              </View>
            </Card>
            {saved && (
              <Card style={{ gap: spacing.xl }}>
                <AppText variant="heading">
                  Ce que {data.childName} a retenu
                </AppText>
                <VocabularySummary progress={progress} />
                <MasteryRule />
                <WordProgressList language={language} progress={progress} />
              </Card>
            )}
            {saved && (
              <View style={{ gap: spacing.md }}>
                <Button
                  icon="trash"
                  variant="danger"
                  expanded={confirmDelete}
                  onPress={() => setConfirmDelete(!confirmDelete)}
                >
                  Supprimer cette liste
                </Button>
                {confirmDelete && (
                  <View style={{ gap: spacing.md }}>
                    <AppText>
                      La liste sera retirée. Les réponses déjà données seront
                      conservées dans l’historique de ses séances.
                    </AppText>
                    <Button
                      variant="danger"
                      onPress={() => {
                        data.deleteVocabularyList(id);
                        router.replace(subjectHref(language, "vocabulaire"));
                      }}
                    >
                      Confirmer la suppression de la liste
                    </Button>
                  </View>
                )}
              </View>
            )}
          </>
        )}
      </View>
    </ParentLayout>
  );
}
