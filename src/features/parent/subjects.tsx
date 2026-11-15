import { View } from "react-native";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import {
  ActionCard,
  AppIcon,
  AppText,
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeading,
  useContentWidth,
} from "@/components/ui";
import { plural } from "@/domain/format";
import type { IconName, Subject } from "@/domain/model";
import { preparationStatus } from "@/domain/study-overview";
import { vocabularyLanguages } from "@/domain/vocabulary";
import { useLearning } from "@/state/learning-store";
import { colors, radius, spacing } from "@/theme";
import { LoadingParent, ParentLayout } from "./shared";

const grid = {
  flexDirection: "row",
  flexWrap: "wrap",
  gap: spacing.lg,
} as const;
const row = {
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.md,
} as const;
const homeOrder = [
  "maths",
  "english",
  "french",
  "history-geography",
  "spanish",
  "svt",
];

function MenuCard({
  title,
  detail,
  icon,
  color,
  width,
  href,
}: {
  title: string;
  detail: string;
  icon: IconName;
  color: string;
  width: number;
  href: Href;
}) {
  const router = useRouter();
  return (
    <ActionCard
      accessibilityLabel={title}
      onPress={() => router.push(href)}
      style={{ width, padding: 18, gap: 10, borderRadius: radius.md }}
    >
      <View style={[row, { justifyContent: "space-between" }]}>
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: radius.sm,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: color + "15",
          }}
        >
          <AppIcon name={icon} color={color} size={24} />
        </View>
        <AppIcon name="chevron-right" size={18} color={colors.muted} />
      </View>
      <View style={{ gap: 2 }}>
        <AppText variant="label">{title}</AppText>
        <AppText variant="small" color={colors.muted}>
          {detail}
        </AppText>
      </View>
    </ActionCard>
  );
}

export function ParentSubjectGrid({
  preview = false,
  next,
}: {
  preview?: boolean;
  next?: "import" | "exercises";
}) {
  const data = useLearning();
  const width = useContentWidth();
  const columns = width >= 730 ? 3 : width >= 320 ? 2 : 1;
  const featured = homeOrder.flatMap((id) =>
    data.subjects.filter((subject) => subject.id === id),
  );
  const subjects = preview
    ? [
        ...featured,
        ...data.subjects.filter((subject) => !homeOrder.includes(subject.id)),
      ].slice(0, 6)
    : data.subjects;
  return (
    <View style={grid}>
      {subjects.map((subject) => {
        const courseCount = data.courses.filter(
          (c) => c.subjectId === subject.id,
        ).length;
        const seriesCount = data.series.filter(
          (s) => s.subjectId === subject.id,
        ).length;
        const listCount = data.vocabularyLists.filter(
          (list) => list.language === subject.id,
        ).length;
        const detail = [
          courseCount && plural(courseCount, "cours", "cours"),
          seriesCount && plural(seriesCount, "série"),
          listCount && plural(listCount, "liste"),
        ]
          .filter(Boolean)
          .join(" · ");
        return (
          <MenuCard
            key={subject.id}
            {...subject}
            width={Math.floor((width - (columns - 1) * spacing.lg) / columns)}
            detail={detail || "Ajouter un premier cours"}
            href={
              next
                ? {
                    pathname:
                      next === "import"
                        ? "/parent/import"
                        : "/parent/exercises",
                    params: { subjectId: subject.id },
                  }
                : {
                    pathname: "/parent/subject/[id]",
                    params: { id: subject.id },
                  }
            }
          />
        );
      })}
    </View>
  );
}

export function ParentSubjectsScreen() {
  const data = useLearning();
  const router = useRouter();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const action = next === "import" || next === "exercises" ? next : undefined;
  if (!data.isReady) return <LoadingParent />;
  return (
    <ParentLayout active="subjects">
      <PageHeading
        title="Toutes les matières"
        description={
          action === "import"
            ? "Dans quelle matière souhaitez-vous ajouter un cours ?"
            : action === "exercises"
              ? "Dans quelle matière souhaitez-vous préparer des exercices ?"
              : undefined
        }
      />
      <ParentSubjectGrid next={action} />
      <Button
        icon="book"
        variant="ghost"
        onPress={() => router.push("/parent/library")}
      >
        Bibliothèque
      </Button>
    </ParentLayout>
  );
}

function SubjectMenu({ subject }: { subject: Subject }) {
  const data = useLearning();
  const router = useRouter();
  const width = useContentWidth();
  const params = { subjectId: subject.id };
  const entries: {
    title: string;
    detail: string;
    icon: IconName;
    href: Href;
  }[] = [
    {
      title: "Cours",
      detail: "Ajouter ou relire une fiche",
      icon: "book",
      href: { pathname: "/parent/import", params },
    },
    {
      title: "Exercices",
      detail: "Préparer une série de questions",
      icon: "pencil",
      href: { pathname: "/parent/exercises", params },
    },
  ];
  if (vocabularyLanguages.some((language) => language.id === subject.id)) {
    entries.push({
      title: "Vocabulaire",
      detail: "Créer une liste de mots",
      icon: "languages",
      href: {
        pathname: "/parent/vocabulary",
        params: { language: subject.id },
      },
    });
  }
  if (subject.id === "english")
    entries.push({
      title: "Conjugaison",
      detail: "Choisir les verbes et les temps",
      icon: "file",
      href: { pathname: "/parent/english", params: { section: "conjugaison" } },
    });
  const courses = data.courses.filter((c) => c.subjectId === subject.id);
  const series = data.series.filter((s) => s.subjectId === subject.id);
  return (
    <>
      <View style={{ gap: spacing.md }}>
        <AppText variant="heading">Que souhaitez-vous préparer ?</AppText>
        <View style={grid}>
          {entries.map((entry) => (
            <MenuCard
              key={entry.title}
              {...entry}
              color={subject.color}
              width={
                width >= 430 ? Math.floor((width - spacing.lg) / 2) : width
              }
            />
          ))}
        </View>
      </View>
      {[
        { title: "Cours de la matière", items: courses, type: "course" },
        { title: "Séries d’exercices", items: series, type: "series" },
      ].map(
        ({ title, items, type }) =>
          (items.length > 0 || type === "course") && (
            <Card key={type} style={{ gap: spacing.sm }}>
              <AppText variant="heading">{title}</AppText>
              {!items.length && (
                <AppText color={colors.muted}>
                  Aucun cours pour le moment.
                </AppText>
              )}
              {items.map((item) => (
                <ActionCard
                  key={item.id}
                  accessibilityLabel={item.title}
                  style={{
                    ...row,
                    minHeight: 48,
                    padding: spacing.md,
                    boxShadow: "none",
                  }}
                  onPress={() =>
                    router.push(
                      type === "course"
                        ? {
                            pathname: "/parent/review/[id]",
                            params: { id: item.id },
                          }
                        : {
                            pathname: "/parent/exercises",
                            params: { ...params, draftId: item.id },
                          },
                    )
                  }
                >
                  <AppText variant="label" style={{ flex: 1 }}>
                    {item.title}
                  </AppText>
                  <Badge
                    tone={item.status === "published" ? "green" : "orange"}
                  >
                    {preparationStatus(item)}
                  </Badge>
                  <AppIcon name="chevron-right" size={18} />
                </ActionCard>
              ))}
            </Card>
          ),
      )}
    </>
  );
}

export function ParentSubjectScreen() {
  const data = useLearning();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  if (!data.isReady) return <LoadingParent />;
  const subject = data.subjects.find((s) => s.id === id);
  return (
    <ParentLayout active="subjects" subjectId={subject?.id}>
      {subject ? (
        <SubjectMenu subject={subject} />
      ) : (
        <EmptyState
          title="Matière introuvable"
          description="Choisissez une matière pour retrouver ses contenus."
        >
          <Button onPress={() => router.replace("/parent/subjects")}>
            Toutes les matières
          </Button>
        </EmptyState>
      )}
    </ParentLayout>
  );
}
