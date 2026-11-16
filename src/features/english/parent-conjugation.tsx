import { useRef, useState, type ComponentRef } from "react";
import { Pressable, View, type ScrollViewInstance } from "react-native";
import { useRouter } from "expo-router";
import {
  AppText,
  Button,
  Card,
  IconButton,
  PageHeading,
} from "@/components/ui";
import {
  conjugationVerbs,
  isConjugationSheet,
  type ConjugationSheet,
} from "@/domain/conjugation";
import {
  conjugationSeriesId,
  conjugationTitle,
} from "@/domain/conjugation-practice";
import { englishTenses } from "@/domain/english";
import type { CourseSource } from "@/domain/model";
import { LanguageSourceImport } from "@/features/parent/import-sources";
import { Notice, ParentLayout } from "@/features/parent/shared";
import { useLocalDraft } from "@/features/planning/use-local-draft";
import { useLearning } from "@/state/learning-store";
import { createThemedStyles, spacing, useTheme } from "@/theme";
import { ConjugationTable } from "./conjugation-table";

const defaultSheet = { verb: "be", tense: "present-simple" };
const sameSheet = (left: ConjugationSheet, right: ConjugationSheet) =>
  left.verb === right.verb && left.tense === right.tense;
const tenseName = (id: string) =>
  englishTenses.find((item) => item.id === id)?.label ?? id;

type ImportDraft = { sheets: ConjugationSheet[]; unavailable: string[] };
function isImportDraft(value: unknown): value is ImportDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Partial<ImportDraft>;
  return (
    Array.isArray(draft.sheets) &&
    draft.sheets.every(isConjugationSheet) &&
    Array.isArray(draft.unavailable) &&
    draft.unavailable.every((item) => typeof item === "string")
  );
}

export function ParentConjugation({
  initialVerb,
  initialTense,
}: {
  initialVerb?: string;
  initialTense?: string;
}) {
  const data = useLearning();
  const { colors } = useTheme();
  const styles = useStyles();
  const router = useRouter();
  const [sheet, setSheet] = useState<ConjugationSheet>(() => {
    const requested = { verb: initialVerb, tense: initialTense };
    return isConjugationSheet(requested) ? requested : defaultSheet;
  });
  const scroll = useRef<ScrollViewInstance>(null);
  const [picker, setPicker] = useState<"verb" | "tense" | null>(null);
  const verbTrigger = useRef<ComponentRef<typeof Pressable>>(null);
  const tenseTrigger = useRef<ComponentRef<typeof Pressable>>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [importMessage, setImportMessage] = useState("");
  const [error, setError] = useState("");
  const [draft, setDraft, storage] = useLocalDraft<ImportDraft>(
    "revizo.conjugation-import." + data.activeProfileId,
    { sheets: [], unavailable: [] },
    isImportDraft,
  );
  const availableTenses = englishTenses.filter((item) =>
    isConjugationSheet({ verb: sheet.verb, tense: item.id }),
  );
  const published = data.conjugationSheets.some((item) =>
    sameSheet(item, sheet),
  );
  const suggestions = draft.sheets.filter(
    (item) =>
      !data.conjugationSheets.some((publishedSheet) =>
        sameSheet(publishedSheet, item),
      ),
  );

  function choose(next: ConjugationSheet) {
    setSheet(next);
    setPicker(null);
    setError("");
  }

  function chooseOption(id: string) {
    const verb = picker === "verb" ? id : sheet.verb;
    const tense = picker === "tense" ? id : sheet.tense;
    choose({
      verb,
      tense: isConjugationSheet({ verb, tense }) ? tense : defaultSheet.tense,
    });
    const trigger = picker === "verb" ? verbTrigger : tenseTrigger;
    requestAnimationFrame(() => trigger.current?.focus());
  }

  function showSheet(item: ConjugationSheet) {
    choose(item);
    scroll.current?.scrollTo({ y: 0, animated: false });
  }

  function publish() {
    try {
      data.addConjugationSheet(sheet);
      setDraft((current) => ({
        ...current,
        sheets: current.sheets.filter((item) => !sameSheet(item, sheet)),
      }));
      setError("");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "La fiche n’a pas pu être ajoutée.",
      );
    }
  }

  function remove(item: ConjugationSheet) {
    try {
      data.removeConjugationSheet(item);
      setError("");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "La fiche n’a pas pu être retirée.",
      );
    }
  }

  async function readCourse(sources: CourseSource[]) {
    setImportMessage("");
    const result = await data.extractEnglish(sources);
    if (!result.verbs.length && !result.tenses.length)
      throw new Error("Aucun verbe ni temps détecté dans ces documents.");
    const verbs = result.verbs.length
      ? result.verbs.map((item) =>
          item.base
            .trim()
            .toLowerCase()
            .replace(/^to\s+/, ""),
        )
      : [sheet.verb];
    const found: ConjugationSheet[] = [];
    const unavailable = new Set<string>();
    for (const verb of new Set(verbs)) {
      if (!conjugationVerbs.some((item) => item.base === verb)) {
        unavailable.add(verb);
        continue;
      }
      const fallbackTense = isConjugationSheet({ verb, tense: sheet.tense })
        ? sheet.tense
        : "present-simple";
      for (const tense of result.tenses.length
        ? result.tenses
        : [fallbackTense]) {
        const candidate = { verb, tense };
        if (isConjugationSheet(candidate)) found.push(candidate);
        else unavailable.add(conjugationTitle(candidate));
      }
    }
    setDraft((current) => {
      const unique = new Map(
        current.sheets.map((item) => [conjugationSeriesId(item), item]),
      );
      for (const item of found) unique.set(conjugationSeriesId(item), item);
      return { sheets: [...unique.values()], unavailable: [...unavailable] };
    });
    const first = found.find(
      (item) =>
        !data.conjugationSheets.some((existing) => sameSheet(existing, item)),
    );
    if (first) {
      choose(first);
      if (!result.tenses.length)
        setImportMessage(
          "Aucun temps détecté. Vérifiez le temps proposé avant d’ajouter la fiche.",
        );
      else if (!result.verbs.length)
        setImportMessage(
          "Aucun verbe détecté. Les temps proposés s’appliquent au verbe sélectionné.",
        );
    } else if (found.length) {
      setImportMessage(
        "Les fiches reconnues figurent déjà dans les révisions.",
      );
    }
  }

  const selectedVerb = conjugationVerbs.find(
    (item) => item.base === sheet.verb,
  )!;
  const options =
    picker === "verb"
      ? conjugationVerbs.map((item) => ({
          id: item.base,
          label: item.base + " · " + item.meaning,
        }))
      : availableTenses;
  return (
    <ParentLayout active="english" subjectId="english" scrollRef={scroll}>
      <View testID="parent-conjugation" style={styles.page}>
        <PageHeading
          title="Conjugaison"
          description="Choisissez le verbe et le temps à faire réviser."
        />
        <Card style={styles.editor}>
          <View style={styles.fields}>
            <View style={styles.field}>
              <AppText variant="label">Verbe</AppText>
              <Button
                ref={verbTrigger}
                icon="chevron-down"
                variant="secondary"
                expanded={picker === "verb"}
                accessibilityLabel={
                  "Choisir le verbe, " +
                  selectedVerb.base +
                  " · " +
                  selectedVerb.meaning
                }
                testID="conjugation-verb"
                onPress={() => setPicker(picker === "verb" ? null : "verb")}
              >
                {selectedVerb.base} · {selectedVerb.meaning}
              </Button>
            </View>
            <View style={styles.field}>
              <AppText variant="label">Temps</AppText>
              <Button
                ref={tenseTrigger}
                icon="chevron-down"
                variant="secondary"
                expanded={picker === "tense"}
                accessibilityLabel={
                  "Choisir le temps, " + tenseName(sheet.tense)
                }
                testID="conjugation-tense"
                onPress={() => setPicker(picker === "tense" ? null : "tense")}
              >
                {tenseName(sheet.tense)}
              </Button>
            </View>
          </View>
          {picker && (
            <View
              style={styles.options}
              accessibilityLabel={
                picker === "verb" ? "Verbes" : "Temps disponibles"
              }
            >
              {options.map((item) => (
                <Button
                  key={item.id}
                  testID={"conjugation-option-" + item.id}
                  variant={item.id === sheet[picker] ? "primary" : "secondary"}
                  selected={item.id === sheet[picker]}
                  onPress={() => chooseOption(item.id)}
                >
                  {item.label}
                </Button>
              ))}
            </View>
          )}
          <ConjugationTable sheet={sheet} />
          {error && <Notice error>{error}</Notice>}
          <Button
            icon={published ? "check" : "plus"}
            variant={published ? "secondary" : "primary"}
            disabled={published}
            onPress={publish}
            style={styles.action}
            testID="add-conjugation-sheet"
          >
            {published ? "Ajoutée à la révision" : "Ajouter à la révision"}
          </Button>
        </Card>
        {data.conjugationSheets.length > 0 && (
          <Card style={styles.section}>
            <AppText variant="heading">Fiches à réviser</AppText>
            {data.conjugationSheets.map((item) => (
              <View key={conjugationSeriesId(item)} style={styles.published}>
                <Button
                  variant="ghost"
                  style={{ flexShrink: 1 }}
                  icon="book"
                  accessibilityLabel={"Voir la fiche " + conjugationTitle(item)}
                  onPress={() => showSheet(item)}
                >
                  {conjugationTitle(item)}
                </Button>
                <IconButton
                  icon="trash"
                  color={colors.danger}
                  label={"Retirer la fiche " + conjugationTitle(item)}
                  testID={"remove-conjugation-" + item.verb + "-" + item.tense}
                  onPress={() => remove(item)}
                />
              </View>
            ))}
          </Card>
        )}
        <View style={styles.section}>
          <Button
            icon="file"
            variant="secondary"
            expanded={importOpen}
            testID="conjugation-import-toggle"
            disabled={busy || !storage.ready}
            onPress={() => setImportOpen(!importOpen)}
            style={styles.action}
          >
            Importer depuis le cours
          </Button>
          <View style={!importOpen && { display: "none" }}>
            <Card>
              <LanguageSourceImport
                onAnalyze={readCourse}
                onBusyChange={setBusy}
              />
            </Card>
          </View>
          {storage.error && <Notice error>{storage.error}</Notice>}
          {!!importMessage && (
            <AppText color={colors.muted}>{importMessage}</AppText>
          )}
          {suggestions.length > 0 && (
            <View style={styles.section}>
              <AppText variant="heading">Fiches à vérifier</AppText>
              <View style={styles.fields}>
                {suggestions.map((item) => (
                  <Button
                    key={conjugationSeriesId(item)}
                    variant="secondary"
                    selected={sameSheet(item, sheet)}
                    testID={
                      "conjugation-proposal-" + item.verb + "-" + item.tense
                    }
                    onPress={() => showSheet(item)}
                  >
                    {conjugationTitle(item)}
                  </Button>
                ))}
              </View>
            </View>
          )}
          {draft.unavailable.length > 0 && (
            <Notice>
              {"Fiche indisponible pour " + draft.unavailable.join(", ") + "."}
            </Notice>
          )}
          <Button
            icon="book"
            variant="ghost"
            style={styles.action}
            onPress={() => router.push("/parent/english")}
          >
            Ouvrir le répertoire complet d’anglais
          </Button>
        </View>
      </View>
    </ParentLayout>
  );
}

const useStyles = createThemedStyles(({ colors }) => ({
  page: { gap: spacing.xl },
  editor: { gap: spacing.xl },
  section: { gap: spacing.md },
  fields: { flexDirection: "row", flexWrap: "wrap", gap: spacing.lg },
  field: { flexGrow: 1, flexBasis: 200, minWidth: 0, gap: spacing.sm },
  options: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  action: { alignSelf: "flex-start" },
  published: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
}));
