import React from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import {
  AppIcon,
  AppText,
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeading,
  ProgressBar,
} from "@/components/ui";
import { colors } from "@/theme";
import {
  ChildShell,
  Loading,
  formatDate,
  plural,
  styles,
  useChildData,
  useContentWidth,
} from "./shared";
export function StudentProgressScreen() {
  const data = useChildData();
  const width = useContentWidth();
  const router = useRouter();
  const completed = data.attempts.filter((a) => !!a.completedAt);
  const answers = completed.flatMap((a) => a.answers);
  const correct = answers.filter((a) => a.isCorrect).length;
  const reviewed = data.publishedCourses.filter((c) =>
    data.reviewedCourseIds.includes(c.id),
  );
  const seenSeries = new Set(completed.map((a) => a.seriesId));
  const latest = completed.filter(
    (a) =>
      !completed.some(
        (b) => b.seriesId === a.seriesId && b.startedAt > a.startedAt,
      ),
  );
  const errors = latest.flatMap((a) =>
    a.questions
      .filter((q) =>
        a.answers.some(
          (answer) => answer.questionId === q.id && !answer.isCorrect,
        ),
      )
      .map((q) => ({
        question: q,
        seriesId: a.seriesId,
        seriesTitle: a.seriesTitle,
        attemptId: a.id,
      })),
  );
  const concepts = errors.filter(
    (item, index, list) =>
      list.findIndex(
        (other) =>
          other.question.concept === item.question.concept &&
          other.seriesId === item.seriesId,
      ) === index,
  );
  const activity = [...data.attempts]
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .slice(0, 8);
  const split = width >= 850;
  return (
    <ChildShell active="progress">
      <PageHeading
        title="Mes progrès"
        description="Ce que tu as fait, les questions réussies et les notions à revoir."
      />
      {!data.isReady ? (
        <Loading />
      ) : (
        <>
          <View style={styles.grid}>
            {[
              {
                label: "Séries différentes terminées",
                value: String(seenSeries.size),
                note: plural(
                  completed.length,
                  "essai terminé",
                  "essais terminés",
                ),
                icon: "check" as const,
              },
              {
                label: "Bonnes réponses",
                value: answers.length
                  ? `${Math.round((correct / answers.length) * 100)} %`
                  : "—",
                note: answers.length
                  ? `${correct} sur ${answers.length} réponses · Tous les essais terminés`
                  : "Tes résultats apparaîtront après une série",
                icon: "chart" as const,
              },
              {
                label: "Fiches marquées relues",
                value: String(reviewed.length),
                note: `Sur ${data.publishedCourses.length} fiches disponibles`,
                icon: "file" as const,
              },
            ].map((item) => (
              <Card
                key={item.label}
                style={{
                  width: width >= 660 ? (width - 36) / 3 : width,
                  gap: 12,
                }}
              >
                <View style={styles.row}>
                  <AppIcon name={item.icon} size={21} />
                  <AppText
                    variant="small"
                    color={colors.muted}
                    style={{ flex: 1, fontWeight: "700" }}
                  >
                    {item.label}
                  </AppText>
                </View>
                <AppText
                  variant="hero"
                  style={{ fontSize: 40, lineHeight: 50 }}
                >
                  {item.value}
                </AppText>
                <AppText variant="small" color={colors.muted}>
                  {item.note}
                </AppText>
              </Card>
            ))}
          </View>
          <AppText variant="small" color={colors.muted}>
            Les séries refaites comptent comme plusieurs essais. Les réponses
            avec indice sont incluses. Une fiche marquée relue indique une
            activité de lecture.
          </AppText>
          {activity.length === 0 && reviewed.length === 0 ? (
            <EmptyState
              icon="chart"
              title="Ton parcours commence ici"
              description="Relis une fiche ou termine une première série. Tu retrouveras ici tes activités et tes résultats."
            >
              <Button icon="book" onPress={() => router.push("/student")}>
                Explorer mes matières
              </Button>
            </EmptyState>
          ) : (
            <View style={{ flexDirection: split ? "row" : "column", gap: 22 }}>
              <View style={{ flex: 1, gap: 20 }}>
                <Card style={{ gap: 22 }}>
                  <AppText variant="heading">Mes résultats par matière</AppText>
                  {data.subjects.map((subject) => {
                    const sa = completed
                      .filter((a) => a.subjectId === subject.id)
                      .flatMap((a) => a.answers);
                    if (!sa.length) return null;
                    const right = sa.filter((a) => a.isCorrect).length;
                    const percent = Math.round((right / sa.length) * 100);
                    return (
                      <View key={subject.id} style={{ gap: 10 }}>
                        <View style={styles.sectionHeading}>
                          <AppText style={{ fontWeight: "700" }}>
                            {subject.title}
                          </AppText>
                          <AppText variant="label" color={subject.color}>
                            {percent} %
                          </AppText>
                        </View>
                        <ProgressBar value={percent} color={subject.color} />
                        <AppText variant="small" color={colors.muted}>
                          {right} bonnes réponses sur {sa.length}
                        </AppText>
                      </View>
                    );
                  })}
                  {answers.length === 0 && (
                    <AppText color={colors.muted}>
                      Termine une série pour retrouver ici tes premiers
                      résultats.
                    </AppText>
                  )}
                </Card>
                {concepts.length > 0 && (
                  <Card style={{ gap: 16 }}>
                    <AppText variant="heading">Des notions à revoir</AppText>
                    <AppText variant="small" color={colors.muted}>
                      À partir de ton dernier essai terminé pour chaque série.
                    </AppText>
                    {concepts.slice(0, 6).map((item) => (
                      <View
                        key={`${item.seriesId}-${item.question.id}`}
                        style={{
                          borderRadius: 16,
                          padding: 17,
                          backgroundColor: colors.orangeLight,
                          gap: 8,
                        }}
                      >
                        <AppText style={{ fontWeight: "700" }}>
                          {item.question.concept || item.question.prompt}
                        </AppText>
                        <AppText variant="small" color={colors.muted}>
                          {item.seriesTitle}
                        </AppText>
                        {data.publishedSeries.some(
                          (s) => s.id === item.seriesId,
                        ) && (
                          <Button
                            variant="ghost"
                            icon="arrow-right"
                            onPress={() =>
                              router.push(
                                `/student/exercise/${item.seriesId}?attemptId=${item.attemptId}&errors=1`,
                              )
                            }
                          >
                            Revoir mes erreurs
                          </Button>
                        )}
                      </View>
                    ))}
                  </Card>
                )}
              </View>
              <Card style={{ flex: 1, gap: 20 }}>
                <View style={styles.sectionHeading}>
                  <AppText variant="heading">Ce que j’ai fait</AppText>
                  <Badge tone="muted">Derniers essais</Badge>
                </View>
                {activity.length ? (
                  activity.map((a) => (
                    <View
                      key={a.id}
                      style={{
                        gap: 8,
                        borderBottomWidth: 1,
                        borderBottomColor: colors.border,
                        paddingBottom: 18,
                      }}
                    >
                      <View style={styles.row}>
                        <View
                          style={[
                            styles.smallIcon,
                            {
                              backgroundColor: a.completedAt
                                ? colors.greenLight
                                : colors.primaryLight,
                            },
                          ]}
                        >
                          <AppIcon
                            name={a.completedAt ? "check" : "clock"}
                            color={
                              a.completedAt ? colors.green : colors.primary
                            }
                            size={20}
                          />
                        </View>
                        <View style={{ flex: 1, gap: 2 }}>
                          <AppText style={{ fontWeight: "700" }}>
                            {a.seriesTitle}
                          </AppText>
                          <AppText variant="small" color={colors.muted}>
                            {formatDate(a.completedAt ?? a.startedAt)}
                          </AppText>
                        </View>
                      </View>
                      <AppText
                        variant="small"
                        color={a.completedAt ? colors.green : colors.muted}
                      >
                        {a.completedAt
                          ? `${a.answers.filter((answer) => answer.isCorrect).length} bonnes réponses sur ${a.questions.length}`
                          : `En cours · ${a.answers.length} réponses sur ${a.questions.length}`}
                        {a.answers.some((answer) => answer.usedHint)
                          ? ` · ${a.answers.filter((answer) => answer.usedHint).length} avec indice`
                          : ""}
                      </AppText>
                      {(a.completedAt ||
                        data.publishedSeries.some(
                          (s) => s.id === a.seriesId,
                        )) && (
                        <Button
                          variant="secondary"
                          icon="play"
                          onPress={() =>
                            router.push(
                              `/student/exercise/${a.seriesId}?attemptId=${a.id}`,
                            )
                          }
                        >
                          {a.completedAt ? "Revoir ce bilan" : "Reprendre"}
                        </Button>
                      )}
                    </View>
                  ))
                ) : (
                  <AppText color={colors.muted}>
                    Tu n’as pas encore commencé de série.
                  </AppText>
                )}
                {reviewed.length > 0 && (
                  <View style={{ gap: 12 }}>
                    <AppText variant="label">Mes fiches relues</AppText>
                    {reviewed.map((c) => (
                      <View key={c.id} style={styles.row}>
                        <AppIcon name="file" size={18} />
                        <AppText style={{ flex: 1 }}>{c.title}</AppText>
                      </View>
                    ))}
                  </View>
                )}
              </Card>
            </View>
          )}
        </>
      )}
    </ChildShell>
  );
}
