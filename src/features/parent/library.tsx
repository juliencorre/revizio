import { useEffect, useState } from "react";
import { View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  AppIcon,
  AppText,
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeading,
  useContentWidth,
} from "@/components/ui";
import { useLearning } from "@/state/learning-store";
import { preparationStatus } from "@/domain/study-overview";
import { plural } from "@/domain/format";
import { useTheme } from "@/theme";
import { preparationHref } from "./subject-navigation";
import { Field, LoadingParent, ParentLayout } from "./shared";

type Filter = "all" | "draft" | "review" | "published";
const statuses = [
  { id: "all", label: "Tous les statuts" },
  { id: "draft", label: "Brouillon" },
  { id: "review", label: "À vérifier" },
  { id: "published", label: "Publié" },
] as const;
const matchesStatus = (status: string, filter: Filter) =>
  filter === "all" ||
  status === statuses.find((item) => item.id === filter)?.label;

export function ParentLibraryScreen() {
  const { colors, subjectAccent } = useTheme();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const data = useLearning();
  const router = useRouter();
  const params = useLocalSearchParams<{ status?: string }>();
  const [status, setStatus] = useState<Filter>("all");
  const [kind, setKind] = useState<"all" | "course" | "series">("all");
  const [subjectId, setSubjectId] = useState("");
  const [query, setQuery] = useState("");
  const width = useContentWidth();
  useEffect(() => {
    setStatus(
      statuses.some((item) => item.id === params.status)
        ? (params.status as Filter)
        : "all",
    );
  }, [params.status]);
  if (!data.isReady) return <LoadingParent active="library" />;
  const all = [
    ...data.courses.map((course) => ({
      id: course.id,
      title: course.title,
      subjectId: course.subjectId,
      kind: "course" as const,
      status: preparationStatus(course),
      course,
    })),
    ...data.series.map((series) => ({
      id: series.id,
      title: series.title,
      subjectId: series.subjectId,
      kind: "series" as const,
      status: preparationStatus(series),
      series,
    })),
  ];
  const normalized = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("fr");
  const visible = all.filter(
    (item) =>
      (kind === "all" || item.kind === kind) &&
      (!subjectId || item.subjectId === subjectId) &&
      matchesStatus(item.status, status) &&
      normalized(item.title).includes(normalized(query.trim())),
  );
  const filterLabels = [
    kind === "course" ? "Fiches" : kind === "series" ? "Exercices" : "",
    status === "all" ? "" : statuses.find((item) => item.id === status)?.label,
    data.subjects.find((subject) => subject.id === subjectId)?.title,
  ].filter(Boolean);
  const reviewCount = all.filter((item) => item.status === "À vérifier").length;
  function reset() {
    setStatus("all");
    setKind("all");
    setSubjectId("");
    setQuery("");
  }
  return (
    <ParentLayout active="library">
      <View testID="parent-library" style={{ gap: 22 }}>
        <PageHeading
          title="Cours et exercices"
          description={`Tous les contenus de ${data.childName}, du brouillon à la publication.`}
          action={
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              <Button
                icon="plus"
                onPress={() =>
                  router.push(preparationHref("import", subjectId))
                }
              >
                Ajouter un cours
              </Button>
              <Button
                icon="pencil"
                variant="secondary"
                onPress={() =>
                  router.push(preparationHref("exercises", subjectId))
                }
              >
                Préparer des exercices
              </Button>
            </View>
          }
        />
        <Card style={{ gap: 16 }}>
          <View
            style={{ flexDirection: "row", alignItems: "flex-end", gap: 10 }}
          >
            <View style={{ flex: 1, minWidth: 0 }}>
              <Field
                label="Rechercher un contenu"
                placeholder="Titre du cours ou de la série"
                value={query}
                onChangeText={setQuery}
              />
            </View>
            <Button
              variant={filtersOpen ? "primary" : "secondary"}
              expanded={filtersOpen}
              accessibilityLabel={
                filtersOpen ? "Masquer les filtres" : "Filtrer les contenus"
              }
              onPress={() => setFiltersOpen(!filtersOpen)}
            >
              Filtres
            </Button>
          </View>
          {filtersOpen && (
            <View style={{ gap: 14 }}>
              <View
                accessibilityLabel="Type de contenu"
                style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
              >
                {(
                  [
                    { id: "all", label: "Tout" },
                    { id: "course", label: "Fiches" },
                    { id: "series", label: "Exercices" },
                  ] as const
                ).map((item) => (
                  <Button
                    key={item.id}
                    selected={kind === item.id}
                    variant={kind === item.id ? "primary" : "secondary"}
                    onPress={() => setKind(item.id)}
                  >
                    {item.label}
                  </Button>
                ))}
              </View>
              <View
                accessibilityLabel="Filtrer par statut"
                style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
              >
                {statuses.map((item) => (
                  <Button
                    key={item.id}
                    selected={status === item.id}
                    variant={status === item.id ? "primary" : "secondary"}
                    onPress={() => setStatus(item.id)}
                  >
                    {item.label}
                  </Button>
                ))}
              </View>
              <View
                accessibilityLabel="Filtrer par matière"
                style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
              >
                <Button
                  selected={!subjectId}
                  variant={!subjectId ? "primary" : "secondary"}
                  onPress={() => setSubjectId("")}
                >
                  Toutes les matières
                </Button>
                {data.subjects
                  .filter((subject) =>
                    all.some((item) => item.subjectId === subject.id),
                  )
                  .map((subject) => (
                    <Button
                      key={subject.id}
                      selected={subjectId === subject.id}
                      variant={
                        subjectId === subject.id ? "primary" : "secondary"
                      }
                      onPress={() => setSubjectId(subject.id)}
                    >
                      {subject.title}
                    </Button>
                  ))}
              </View>
            </View>
          )}
        </Card>
        <View
          accessibilityLiveRegion="polite"
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 10,
          }}
        >
          <AppText variant="label">
            {visible.length} contenu{visible.length > 1 ? "s" : ""} trouvé
            {visible.length > 1 ? "s" : ""}
          </AppText>
          {filterLabels.length > 0 && (
            <AppText variant="small" color={colors.muted}>
              Filtres : {filterLabels.join(" · ")}
            </AppText>
          )}
          <Badge tone="orange">{reviewCount} à vérifier</Badge>
          <AppText variant="small" color={colors.muted}>
            Brouillons privés · Publication après relecture
          </AppText>
          {(status !== "all" || kind !== "all" || subjectId || query) && (
            <Button variant="ghost" onPress={reset}>
              Effacer les filtres
            </Button>
          )}
        </View>
        {!all.length ? (
          <EmptyState
            title="Un premier cours à partager"
            description="Ajoutez vos documents pour préparer une fiche de révision."
          >
            <Button
              icon="plus"
              onPress={() => router.push(preparationHref("import", subjectId))}
            >
              Ajouter un cours
            </Button>
          </EmptyState>
        ) : !visible.length ? (
          <EmptyState
            icon="search"
            title="Aucun contenu avec ces filtres"
            description="Essayez une autre matière, un autre statut ou un titre plus court."
          />
        ) : (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 18 }}>
            {visible.map((item) => {
              const subject = data.subjects.find(
                (subject) => subject.id === item.subjectId,
              );
              return (
                <Card
                  key={`${item.kind}-${item.id}`}
                  testID={`library-${item.id}`}
                  style={{
                    width: width >= 720 ? (width - 18) / 2 : width,
                    gap: 14,
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      flexWrap: "wrap",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <AppIcon
                      name={subject?.icon ?? "book"}
                      color={subjectAccent(subject?.color)}
                    />
                    <AppText variant="small" color={colors.muted}>
                      {subject?.title} ·{" "}
                      {item.kind === "course" ? "Fiche" : "Exercices"}
                    </AppText>
                    <Badge
                      tone={
                        item.status === "Publié"
                          ? "green"
                          : item.status === "À vérifier"
                            ? "orange"
                            : "muted"
                      }
                    >
                      {item.status}
                    </Badge>
                  </View>
                  <AppText variant="heading">{item.title}</AppText>
                  <AppText variant="small" color={colors.muted}>
                    {item.kind === "course"
                      ? `${plural(item.course.sources.length, "document")} · ${plural(item.course.sections.filter((section) => section.content.trim()).length, "rubrique")}`
                      : plural(item.series.questions.length, "question")}
                  </AppText>
                  <Button
                    variant="secondary"
                    icon={item.kind === "course" ? "file" : "pencil"}
                    accessibilityLabel={`Ouvrir ${item.kind === "course" ? "la fiche" : "les exercices"} ${item.title}`}
                    onPress={() =>
                      item.kind === "course"
                        ? router.push(`/parent/review/${item.id}`)
                        : router.push({
                            pathname: "/parent/exercises",
                            params: {
                              draftId: item.id,
                              subjectId: item.subjectId,
                            },
                          })
                    }
                  >
                    {item.status === "Publié"
                      ? "Consulter"
                      : "Reprendre et vérifier"}
                  </Button>
                  {item.kind === "course" && item.status === "Publié" && (
                    <Button
                      variant="ghost"
                      icon="pencil"
                      onPress={() =>
                        router.push({
                          pathname: "/parent/exercises",
                          params: { courseId: item.id },
                        })
                      }
                    >
                      Préparer ses exercices
                    </Button>
                  )}
                </Card>
              );
            })}
          </View>
        )}
      </View>
    </ParentLayout>
  );
}
