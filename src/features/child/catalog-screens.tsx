import React, { useState } from "react";
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
} from "@/components/ui";
import { colors } from "@/theme";
import { SourceViewer } from "@/components/source-viewer";
import { ReadAloud } from "@/components/read-aloud";
import { LearningDiagram } from "@/components/learning-diagram";
import type { CourseSource, RevisionSection } from "@/domain/model";
import {
  ChildShell,
  CourseCard,
  Loading,
  SeriesCard,
  Tappable,
  Unavailable,
  latestAttempt,
  plural,
  styles,
  subjectFor,
  useChildData,
  useContentWidth,
} from "./shared";
export function StudentHomeScreen() {
  const router = useRouter();
  const data = useChildData();
  const width = useContentWidth();
  const columns = width >= 1000 ? 4 : width >= 660 ? 3 : width >= 400 ? 2 : 1;
  const nextSeries = [...data.publishedSeries]
    .sort((a, b) => {
      const as = data.attempts.some(
        (t) => t.seriesId === a.id && !t.completedAt,
      );
      const bs = data.attempts.some(
        (t) => t.seriesId === b.id && !t.completedAt,
      );
      return (
        Number(bs) - Number(as) ||
        (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999")
      );
    })
    .find((s) => !latestAttempt(data.attempts, s.id)?.completedAt);
  const nextAttempt = nextSeries
    ? latestAttempt(data.attempts, nextSeries.id)
    : undefined;
  return (
    <ChildShell>
      <View testID="student-home" style={{ gap: 26 }}>
        <PageHeading
          title={`Salut ${data.childName} !`}
          description="Un cours à relire, une question à essayer. Avance à ton rythme."
          action={<Badge>Élève de {data.childGrade}</Badge>}
        />
        {!data.isReady ? (
          <Loading />
        ) : (
          <>
            {nextSeries ? (
              <Card
                style={{
                  backgroundColor: colors.orangeLight,
                  borderColor: "#F0D8C6",
                  gap: 18,
                }}
              >
                <View style={styles.row}>
                  <View
                    style={[
                      styles.smallIcon,
                      { backgroundColor: colors.orange },
                    ]}
                  >
                    <AppIcon name="play" color="#FFFFFF" />
                  </View>
                  <View style={{ flex: 1, minWidth: 180, gap: 4 }}>
                    <AppText
                      variant="small"
                      color={colors.orange}
                      style={{ fontWeight: "700", letterSpacing: 1 }}
                    >
                      MON PROCHAIN PETIT PAS
                    </AppText>
                    <AppText variant="heading">{nextSeries.title}</AppText>
                    <AppText color={colors.muted}>
                      {nextAttempt
                        ? `${nextAttempt.answers.length} réponses déjà enregistrées. Tu peux continuer.`
                        : `${plural(nextSeries.questions.length, "question")} préparées pour toi.`}
                    </AppText>
                  </View>
                  <Button
                    variant="orange"
                    icon="arrow-right"
                    onPress={() =>
                      router.push(`/student/exercise/${nextSeries.id}`)
                    }
                  >
                    {nextAttempt ? "Reprendre ma série" : "Je commence"}
                  </Button>
                </View>
              </Card>
            ) : (
              <Card
                style={{
                  backgroundColor: colors.primaryLight,
                  borderWidth: 0,
                  gap: 9,
                }}
              >
                <AppText variant="heading">
                  Prends un moment pour explorer tes cours.
                </AppText>
                <AppText color={colors.muted}>
                  Tu peux relire une fiche ou refaire une série pour
                  t’entraîner.
                </AppText>
              </Card>
            )}
            <View style={styles.sectionHeading}>
              <AppText variant="heading">
                Mes matières de {data.childGrade}
              </AppText>
              <AppText variant="small" color={colors.muted}>
                {plural(
                  data.publishedCourses.length,
                  "cours disponible",
                  "cours disponibles",
                )}
              </AppText>
            </View>
            <View style={styles.grid}>
              {data.subjects.map((subject) => {
                const count = data.publishedCourses.filter(
                  (c) => c.subjectId === subject.id,
                ).length;
                const todo = data.publishedSeries.filter(
                  (s) =>
                    s.subjectId === subject.id &&
                    !latestAttempt(data.attempts, s.id)?.completedAt,
                ).length;
                return (
                  <Tappable
                    key={subject.id}
                    testID={`subject-card-${subject.id}`}
                    label={`Ouvrir ${subject.title}`}
                    onPress={() =>
                      router.push(`/student/subject/${subject.id}`)
                    }
                    style={{
                      width: (width - (columns - 1) * 18) / columns,
                      minHeight: 214,
                    }}
                  >
                    <Card style={{ flex: 1, padding: 23, gap: 16 }}>
                      <View
                        style={[
                          styles.row,
                          { justifyContent: "space-between" },
                        ]}
                      >
                        <View
                          style={{
                            backgroundColor: subject.color,
                            width: 54,
                            height: 54,
                            borderRadius: 18,
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <AppIcon
                            name={subject.icon}
                            color="#FFFFFF"
                            size={28}
                          />
                        </View>
                        {todo > 0 && (
                          <Badge tone="orange">{todo} à faire</Badge>
                        )}
                      </View>
                      <View style={{ flex: 1 }} />
                      <AppText
                        variant="heading"
                        style={{ fontSize: 20, lineHeight: 27 }}
                      >
                        {subject.title}
                      </AppText>
                      <AppText variant="small" color={colors.muted}>
                        {count
                          ? plural(count, "cours", "cours")
                          : "Bientôt tes premiers cours"}
                      </AppText>
                    </Card>
                  </Tappable>
                );
              })}
            </View>
          </>
        )}
      </View>
    </ChildShell>
  );
}
export function StudentSubjectScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const data = useChildData();
  const width = useContentWidth();
  const router = useRouter();
  const subject = subjectFor(data.subjects, id);
  const courses = data.publishedCourses.filter((c) => c.subjectId === id);
  return (
    <ChildShell active="courses" subject={subject}>
      {!data.isReady ? (
        <Loading />
      ) : !subject ? (
        <Unavailable kind="contenu" />
      ) : (
        <>
          <PageHeading
            eyebrow={subject.title}
            title="Mes cours"
            description="Choisis un cours pour retrouver l’essentiel et t’entraîner."
            action={
              <Button
                variant="ghost"
                icon="arrow-left"
                onPress={() => router.push("/student")}
              >
                Toutes mes matières
              </Button>
            }
          />
          {courses.length === 0 ? (
            <EmptyState
              title="Tes cours arriveront ici"
              description="Un parent peut ajouter un cours et vérifier sa fiche. Tu la retrouveras ici dès qu’elle sera prête."
            />
          ) : (
            <View style={styles.grid}>
              {courses.map((course) => (
                <View
                  key={course.id}
                  style={{ width: width >= 650 ? (width - 18) / 2 : width }}
                >
                  <CourseCard
                    course={course}
                    series={data.publishedSeries.filter((s) =>
                      s.courseIds.includes(course.id),
                    )}
                  />
                </View>
              ))}
            </View>
          )}
        </>
      )}
    </ChildShell>
  );
}
const sectionConfig: Record<
  RevisionSection["kind"],
  {
    icon: "sparkles" | "book" | "pencil" | "lightbulb";
    color: string;
    background: string;
  }
> = {
  essential: {
    icon: "sparkles",
    color: colors.primary,
    background: colors.primaryLight,
  },
  vocabulary: { icon: "book", color: colors.primary, background: "#F4F5FA" },
  method: { icon: "pencil", color: colors.primary, background: "#F4F5FA" },
  warning: {
    icon: "lightbulb",
    color: colors.orange,
    background: colors.orangeLight,
  },
};
export function StudentCourseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const data = useChildData();
  const router = useRouter();
  const width = useContentWidth();
  const course = data.publishedCourses.find((c) => c.id === id);
  const subject = subjectFor(data.subjects, course?.subjectId ?? "");
  const series = data.publishedSeries.filter((s) => s.courseIds.includes(id));
  const reviewed = data.reviewedCourseIds.includes(id);
  const [source, setSource] = useState<CourseSource | null>(null);
  const split = width >= 880;
  const [recall, setRecall] = useState(false);
  const [revealed, setRevealed] = useState<string[]>([]);
  return (
    <ChildShell active="courses" subject={subject}>
      {!data.isReady ? (
        <Loading />
      ) : !course ? (
        <Unavailable />
      ) : (
        <>
          <View style={styles.wrap}>
            <Button
              variant="ghost"
              icon="arrow-left"
              onPress={() =>
                router.push(`/student/subject/${course.subjectId}`)
              }
            >
              Mes cours de{" "}
              {subject?.shortLabel ?? subject?.title ?? "la matière"}
            </Button>
            <Badge tone="green">Vérifiée par un parent</Badge>
          </View>
          <PageHeading title={course.title} description={course.description} />
          <View style={styles.wrap}>
            <ReadAloud
              text={[
                course.title,
                ...course.sections.flatMap((s) => [
                  s.title,
                  s.content,
                  s.example || "",
                ]),
              ].join(". ")}
            />
            <Button
              variant="secondary"
              icon="lightbulb"
              onPress={() => {
                setRecall(!recall);
                setRevealed([]);
              }}
            >
              {recall ? "Lire toute la fiche" : "Me tester de mémoire"}
            </Button>
          </View>
          {recall && (
            <AppText color={colors.muted}>
              Essaie d’expliquer chaque notion avec tes mots, puis affiche
              l’explication pour comparer.
            </AppText>
          )}
          <View
            style={{
              flexDirection: split ? "row" : "column",
              gap: 22,
              alignItems: "stretch",
            }}
          >
            <View style={{ flex: split ? 1.7 : undefined, gap: 18 }}>
              {course.sections.length === 0 ? (
                <EmptyState
                  title="La fiche est encore vide"
                  description="Demande à un parent de compléter les explications de ce cours."
                />
              ) : (
                course.sections.map((section) => {
                  const config = sectionConfig[section.kind];
                  return (
                    <Card
                      key={section.id}
                      style={{
                        gap: 16,
                        backgroundColor:
                          section.kind === "warning"
                            ? config.background
                            : colors.surface,
                        borderColor:
                          section.kind === "warning"
                            ? "#F0D8C6"
                            : colors.border,
                      }}
                    >
                      <View style={styles.row}>
                        <View
                          style={[
                            styles.smallIcon,
                            { backgroundColor: config.background },
                          ]}
                        >
                          <AppIcon name={config.icon} color={config.color} />
                        </View>
                        <AppText
                          variant="heading"
                          color={config.color}
                          style={{ flex: 1 }}
                        >
                          {section.title}
                        </AppText>
                      </View>
                      {recall && !revealed.includes(section.id) ? (
                        <Button
                          variant="secondary"
                          onPress={() => setRevealed([...revealed, section.id])}
                        >
                          Afficher l’explication
                        </Button>
                      ) : (
                        <>
                          <AppText style={{ fontSize: 18, lineHeight: 30 }}>
                            {section.content}
                          </AppText>
                          {section.diagram && (
                            <LearningDiagram diagram={section.diagram} />
                          )}
                          {!!section.sourceRefs?.length && (
                            <AppText variant="small" color={colors.muted}>
                              Sources :{" "}
                              {section.sourceRefs
                                .map(
                                  (ref) =>
                                    course.sources.find(
                                      (s) => s.id === ref.sourceId,
                                    )?.name || "Texte du cours",
                                )
                                .join(", ")}
                            </AppText>
                          )}
                          {section.example && (
                            <View
                              style={{
                                borderRadius: 16,
                                backgroundColor: config.background,
                                padding: 18,
                                gap: 6,
                              }}
                            >
                              <AppText
                                variant="small"
                                color={config.color}
                                style={{ fontWeight: "700" }}
                              >
                                UN EXEMPLE
                              </AppText>
                              <AppText
                                style={{
                                  fontSize: 18,
                                  lineHeight: 29,
                                  fontWeight: "600",
                                }}
                              >
                                {section.example}
                              </AppText>
                            </View>
                          )}
                        </>
                      )}
                    </Card>
                  );
                })
              )}
              <Card
                style={{
                  gap: 12,
                  backgroundColor: reviewed
                    ? colors.greenLight
                    : colors.primaryLight,
                  borderWidth: 0,
                }}
              >
                <AppText variant="heading">
                  {reviewed
                    ? "Fiche marquée comme relue"
                    : "Tu as pris le temps de relire ?"}
                </AppText>
                <AppText color={colors.muted}>
                  Ce repère te permet de retrouver les fiches que tu as relues.
                  Les exercices t’aideront à vérifier ce que tu as compris.
                </AppText>
                <Button
                  icon="check"
                  variant={reviewed ? "secondary" : "primary"}
                  onPress={() => data.markReviewed(course.id)}
                >
                  {reviewed
                    ? "Je viens de la relire"
                    : "Marquer cette fiche comme relue"}
                </Button>
              </Card>
            </View>
            <View style={{ flex: split ? 1 : undefined, gap: 18 }}>
              <View style={styles.sectionHeading}>
                <AppText variant="heading">Je m’entraîne</AppText>
                <Badge tone="muted">{plural(series.length, "série")}</Badge>
              </View>
              {series.length ? (
                series.map((s) => (
                  <SeriesCard
                    key={s.id}
                    series={s}
                    attempts={data.attempts}
                    subjects={data.subjects}
                  />
                ))
              ) : (
                <Card style={{ gap: 9 }}>
                  <AppText variant="label">
                    Pas encore de série pour ce cours
                  </AppText>
                  <AppText color={colors.muted}>
                    Un parent peut t’en préparer une.
                  </AppText>
                </Card>
              )}
              {course.sources.length > 0 && (
                <Card style={{ gap: 14 }}>
                  <AppText variant="heading">Mon cours d’origine</AppText>
                  <AppText variant="small" color={colors.muted}>
                    Les documents utilisés pour préparer cette fiche.
                  </AppText>
                  {course.sources.map((item, index) => (
                    <View
                      key={item.id}
                      style={[styles.row, { alignItems: "flex-start" }]}
                    >
                      <AppIcon name="file" size={19} />
                      <View style={{ flex: 1, gap: 6 }}>
                        <AppText variant="small">{item.name}</AppText>
                        {item.uri || item.cachedUri ? (
                          <Button
                            variant="secondary"
                            icon="book"
                            onPress={() => setSource(item)}
                          >
                            Voir la page {index + 1}
                          </Button>
                        ) : (
                          <AppText variant="small" color={colors.muted}>
                            {item.uri
                              ? "Ce document est consultable dans l’espace parent."
                              : "Document de démonstration"}
                          </AppText>
                        )}
                      </View>
                    </View>
                  ))}
                </Card>
              )}
            </View>
          </View>
          <SourceViewer source={source} onClose={() => setSource(null)} />
        </>
      )}
    </ChildShell>
  );
}
export function StudentExercisesScreen() {
  const { subjectId } = useLocalSearchParams<{ subjectId?: string }>();
  const data = useChildData();
  const router = useRouter();
  const width = useContentWidth();
  const subject = subjectFor(data.subjects, subjectId ?? "");
  const series = data.publishedSeries.filter(
    (s) => !subjectId || s.subjectId === subjectId,
  );
  const pending = series.filter(
    (s) => !latestAttempt(data.attempts, s.id)?.completedAt,
  );
  const done = series.filter(
    (s) => latestAttempt(data.attempts, s.id)?.completedAt,
  );
  const columns = width >= 1000 ? 3 : width >= 620 ? 2 : 1;
  return (
    <ChildShell active="exercises" subject={subject}>
      <PageHeading
        title={
          subject ? `Mes exercices de ${subject.shortLabel}` : "Mes exercices"
        }
        description="Des petites séries pour essayer, comprendre et recommencer."
        action={
          subjectId ? (
            <Button
              variant="ghost"
              icon="arrow-left"
              onPress={() => router.replace("/student/exercises")}
            >
              Toutes les matières
            </Button>
          ) : undefined
        }
      />
      {!data.isReady ? (
        <Loading />
      ) : subjectId && !subject ? (
        <Unavailable kind="contenu" />
      ) : series.length === 0 ? (
        <EmptyState
          icon="pencil"
          title="Tes exercices arriveront ici"
          description="Un parent peut préparer et publier une série à partir de tes cours. En attendant, tu peux relire tes fiches."
        >
          <Button
            variant="secondary"
            icon="book"
            onPress={() => router.push("/student")}
          >
            Voir mes matières
          </Button>
        </EmptyState>
      ) : (
        <>
          <View style={styles.sectionHeading}>
            <AppText variant="heading">À faire ou à reprendre</AppText>
            <Badge tone="orange">{plural(pending.length, "série")}</Badge>
          </View>
          {pending.length ? (
            <View style={styles.grid}>
              {pending.map((s) => (
                <View
                  key={s.id}
                  style={{ width: (width - (columns - 1) * 18) / columns }}
                >
                  <SeriesCard
                    series={s}
                    attempts={data.attempts}
                    subjects={data.subjects}
                  />
                </View>
              ))}
            </View>
          ) : (
            <Card
              style={{
                backgroundColor: colors.greenLight,
                borderWidth: 0,
                gap: 8,
              }}
            >
              <AppText variant="heading" color={colors.green}>
                Tes séries sont terminées !
              </AppText>
              <AppText color={colors.muted}>
                Tu peux revenir sur un bilan ou refaire une série à ton rythme.
              </AppText>
            </Card>
          )}
          {done.length > 0 && (
            <>
              <View style={styles.sectionHeading}>
                <AppText variant="heading">Déjà faites</AppText>
                <Button
                  variant="ghost"
                  icon="chart"
                  onPress={() => router.push("/student/progress")}
                >
                  Mes progrès
                </Button>
              </View>
              <View style={styles.grid}>
                {done.map((s) => (
                  <View
                    key={s.id}
                    style={{ width: (width - (columns - 1) * 18) / columns }}
                  >
                    <SeriesCard
                      series={s}
                      attempts={data.attempts}
                      subjects={data.subjects}
                    />
                  </View>
                ))}
              </View>
            </>
          )}
        </>
      )}
    </ChildShell>
  );
}
