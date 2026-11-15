import { useRef, type ComponentRef } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  View,
  type ViewProps,
} from "react-native";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { AppIcon, AppText, Button, useFocusVisible } from "@/components/ui";
import { englishTenses } from "@/domain/english";
import { plural } from "@/domain/format";
import type { IconName, Subject } from "@/domain/model";
import { preparationStatus } from "@/domain/study-overview";
import { vocabularyLanguages, vocabularyProgress } from "@/domain/vocabulary";
import { useLearning } from "@/state/learning-store";
import { colors, spacing } from "@/theme";
import { localId } from "./shared";
import type { SubjectTab } from "./subject-navigation";

const labels: Record<SubjectTab, string> = {
  cours: "Cours",
  exercices: "Exercices",
  vocabulaire: "Vocabulaire",
  conjugaison: "Conjugaison",
};

function tabsFor(id: string): SubjectTab[] {
  const tabs: SubjectTab[] = ["cours", "exercices"];
  if (vocabularyLanguages.some((lang) => lang.id === id))
    tabs.push("vocabulaire");
  if (id === "english") tabs.push("conjugaison");
  return tabs;
}
function TabStrip({
  tabs,
  tab,
  select,
}: {
  tabs: SubjectTab[];
  tab: SubjectTab;
  select: (tab: SubjectTab) => void;
}) {
  const refs = useRef<
    Partial<Record<SubjectTab, ComponentRef<typeof View> | null>>
  >({});
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel="Rubriques de la matière"
      style={styles.tabs}
    >
      {tabs.map((item, index) => {
        const selected = tab === item;
        const keyboard =
          Platform.OS === "web"
            ? {
                tabIndex: selected ? (0 as const) : (-1 as const),
                onKeyDown: (
                  event: Parameters<NonNullable<ViewProps["onKeyDown"]>>[0],
                ) => {
                  const key = event.nativeEvent.key;
                  const positions: Record<string, number | undefined> = {
                    Home: 0,
                    End: tabs.length - 1,
                    ArrowRight: (index + 1) % tabs.length,
                    ArrowLeft: (index + tabs.length - 1) % tabs.length,
                  };
                  const dest = positions[key];
                  if (dest !== undefined) {
                    event.preventDefault();
                    select(tabs[dest]);
                    refs.current[tabs[dest]]?.focus();
                  }
                },
              }
            : {};
        return (
          <Pressable
            key={item}
            ref={(node) => {
              refs.current[item] = node;
            }}
            accessibilityRole="tab"
            accessibilityLabel={labels[item]}
            accessibilityState={{ selected }}
            aria-selected={selected}
            nativeID={"subject-tab-" + item}
            aria-controls="subject-tab-panel"
            {...keyboard}
            onPress={() => select(item)}
            style={[styles.tab, selected && styles.activeTab]}
          >
            <AppText
              color={selected ? colors.primaryDark : colors.muted}
              style={{ fontWeight: selected ? "600" : "400" }}
            >
              {labels[item]}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

interface Entry {
  id: string;
  title: string;
  detail: string;
  icon: IconName;
  status?: string;
  href?: Href;
  accessibilityLabel?: string;
}
function EntryRow({ entry }: { entry: Entry }) {
  const router = useRouter();
  const { focusVisible, onFocus, onBlur } = useFocusVisible();
  const { href, title, detail, icon, status } = entry;
  const content = (
    <>
      <AppIcon name={icon} size={21} color={colors.muted} />
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="label" style={{ fontWeight: "500" }}>
          {title}
        </AppText>
        {!!detail && (
          <AppText variant="small" color={colors.muted}>
            {detail}
          </AppText>
        )}
      </View>
      {status && (
        <View style={styles.status}>
          <View
            style={[
              styles.dot,
              {
                backgroundColor: status.startsWith("Publié")
                  ? colors.green
                  : colors.orange,
              },
            ]}
          />
          <AppText variant="small">{status}</AppText>
        </View>
      )}
    </>
  );
  return href ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={entry.accessibilityLabel ?? title}
      onPress={() => router.push(href)}
      onFocus={onFocus}
      onBlur={onBlur}
      style={({ pressed }) => [
        styles.row,
        pressed && styles.pressed,
        focusVisible && styles.focus,
      ]}
    >
      {content}
    </Pressable>
  ) : (
    <View style={styles.row}>{content}</View>
  );
}

function courseHeading(subject: Subject) {
  const name = subject.title.replace(/ \(.*\)$/, "");
  const display =
    name === name.toLocaleUpperCase("fr")
      ? name
      : name.charAt(0).toLocaleLowerCase("fr") + name.slice(1);
  return (
    (/^[aàâeéèêëhiîïoôuû]/i.test(display) ? "Cours d’" : "Cours de ") + display
  );
}

export function SubjectLibrary({ subject }: { subject: Subject }) {
  const data = useLearning();
  const router = useRouter();
  const { tab: requested } = useLocalSearchParams<{ tab?: string }>();
  const tabs = tabsFor(subject.id);
  const tab = tabs.find((value) => value === requested) ?? "cours";
  const subjectId = subject.id;
  const courses = data.courses.filter(
    (course) => course.subjectId === subjectId,
  );
  const hasPublished = courses.some((course) => course.status === "published");
  let heading: string,
    action: string,
    empty: string,
    onAdd: () => void,
    entries: Entry[];
  let note: string | undefined;
  switch (tab) {
    case "cours":
      heading = courseHeading(subject);
      action = "Ajouter un cours";
      empty = "Aucun cours pour le moment.";
      onAdd = () =>
        router.push({ pathname: "/parent/import", params: { subjectId } });
      entries = courses
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map((course) => {
          const date = new Date(course.updatedAt);
          return {
            id: course.id,
            title: course.title,
            detail: Number.isFinite(date.getTime())
              ? "Modifié le " +
                date.toLocaleDateString("fr-FR", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })
              : "",
            status: preparationStatus(course),
            icon: "file",
            href: {
              pathname: "/parent/review/[id]",
              params: { id: course.id },
            },
          };
        });
      break;
    case "exercices":
      heading = "Séries d’exercices";
      action = hasPublished ? "Préparer des exercices" : "Ajouter un cours";
      empty = "Aucune série pour le moment.";
      if (!hasPublished)
        note =
          "Publiez d’abord une fiche dans cette matière pour préparer des exercices.";
      onAdd = () =>
        router.push({
          pathname: hasPublished ? "/parent/exercises" : "/parent/import",
          params: { subjectId },
        });
      entries = data.series
        .filter((s) => s.subjectId === subjectId)
        .map((series) => ({
          id: series.id,
          title: series.title,
          detail: plural(series.questions.length, "question"),
          status: preparationStatus(series),
          icon: "pencil",
          href: {
            pathname: "/parent/exercises",
            params: { subjectId, draftId: series.id },
          },
        }));
      break;
    case "vocabulaire":
      heading = "Listes de vocabulaire";
      action = "Créer une liste";
      empty = "Aucune liste de vocabulaire pour le moment.";
      onAdd = () =>
        router.push({
          pathname: "/parent/vocabulary/[id]",
          params: { id: localId("vocabulary-list"), language: subjectId },
        });
      entries = data.vocabularyLists
        .filter((l) => l.language === subjectId)
        .map((list) => {
          const progress = vocabularyProgress(list, data.vocabularySessions);
          const review = progress.filter(
            (word) => word.status === "review",
          ).length;
          const known = progress.filter(
            (word) => word.status === "known",
          ).length;
          return {
            id: list.id,
            title: list.title,
            detail:
              plural(known, "mot connu", "mots connus") +
              " sur " +
              progress.length +
              (review ? " · " + review + " à revoir" : ""),
            status: list.status === "published" ? "Publiée" : "Brouillon",
            icon: "languages",
            href: {
              pathname: "/parent/vocabulary/[id]",
              params: { id: list.id, language: subjectId },
            },
            accessibilityLabel: "Ouvrir la liste " + list.title,
          };
        });
      break;
    case "conjugaison":
      heading = "Verbes étudiés";
      action = "Préparer la conjugaison";
      empty = "Aucun verbe publié pour le moment.";
      onAdd = () => router.push("/parent/english?section=conjugaison");
      entries = data.english.verbs.map((verb) => ({
        id: verb.id,
        title: verb.base + " · " + verb.meaning,
        detail: verb.past + " · " + verb.participle,
        icon: "file",
      }));
      if (data.english.tenses.length)
        note =
          "Temps étudiés : " +
          englishTenses
            .filter((tense) => data.english.tenses.includes(tense.id))
            .map((tense) => tense.label)
            .join(", ");
      break;
  }
  return (
    <View style={{ gap: spacing.xl }}>
      <TabStrip
        tabs={tabs}
        tab={tab}
        select={(next) => {
          if (next !== tab) router.setParams({ tab: next });
        }}
      />
      <View
        role="tabpanel"
        nativeID="subject-tab-panel"
        aria-labelledby={"subject-tab-" + tab}
        testID={tab === "vocabulaire" ? "parent-vocabulary" : "subject-content"}
        style={{ gap: spacing.lg }}
      >
        <View style={styles.toolbar}>
          <AppText variant="heading" style={styles.heading}>
            {heading}
          </AppText>
          <Button
            testID={tab === "vocabulaire" ? "add-vocabulary-list" : undefined}
            style={styles.primary}
            icon={tab === "conjugaison" ? "pencil" : "plus"}
            onPress={onAdd}
          >
            {action}
          </Button>
        </View>
        {note && <AppText color={colors.muted}>{note}</AppText>}
        <View style={styles.list}>
          {entries.length ? (
            entries.map((entry) => <EntryRow key={entry.id} entry={entry} />)
          ) : (
            <AppText
              style={{ paddingVertical: spacing.xl }}
              color={colors.muted}
            >
              {empty}
            </AppText>
          )}
        </View>
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  tabs: {
    flexDirection: "row",
    flexWrap: "wrap",
    borderBottomWidth: 1,
    borderColor: colors.border,
    columnGap: spacing.sm,
  },
  tab: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 46,
    minWidth: 44,
    paddingHorizontal: 10,
    borderBottomWidth: 2,
    borderColor: "transparent",
  },
  activeTab: { borderColor: colors.primaryDark },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  heading: { fontSize: 23, lineHeight: 30, fontWeight: "500", flexShrink: 1 },
  primary: {
    borderRadius: 8,
    minHeight: 44,
    paddingVertical: 8,
    paddingHorizontal: 14,
    boxShadow: "none",
    backgroundColor: colors.primaryDark,
  },
  list: { borderTopColor: colors.border, borderTopWidth: 1 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
    paddingHorizontal: 4,
    paddingVertical: spacing.md,
    minHeight: 74,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  status: { flexDirection: "row", alignItems: "center", gap: 7 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  pressed: { backgroundColor: colors.surfaceInset },
  focus: {
    outlineStyle: "solid",
    outlineWidth: 2,
    outlineColor: colors.primary,
  },
});
