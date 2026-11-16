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
} from "@/components/ui";
import { learningOverview, latestAttempts } from "@/domain/study-overview";
import { VocabularyActivityCard } from "@/features/vocabulary/activity-card";
import { expectedAnswerLabel } from "@/domain/answers";
import { dateOnly, stepIsLate } from "@/domain/planning";
import { useLearning } from "@/state/learning-store";
import { plural } from "@/domain/format";
import { useTheme } from "@/theme";
import { AnswerReviewList } from "./answer-reviews";
import { LoadingParent, ParentLayout } from "./shared";

export function ParentProgressScreen() {
  const { colors, subjectAccent } = useTheme();
  const data = useLearning();
  const router = useRouter();
  if (!data.isReady) return <LoadingParent active="progress" />;
  const overview = learningOverview({ ...data, version: 1 });
  const unfinished = latestAttempts(data.attempts).filter(
    (attempt) => !attempt.completedAt,
  );
  const late = data.plans.filter(
    (plan) =>
      plan.status === "published" &&
      plan.steps.some((step) => stepIsLate(step)),
  );
  const today = dateOnly();
  return (
    <ParentLayout active="progress">
      <View testID="parent-progress" style={{ gap: 22 }}>
        <PageHeading
          title="Suivi"
          description={`Comprendre les réussites et accompagner les révisions de ${data.childName}.`}
        />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14 }}>
          {[
            {
              title: "Séances terminées",
              value: String(overview.completed.length),
              detail: "Tous les essais terminés",
            },
            {
              title: "Bonnes réponses",
              value: overview.answered
                ? `${Math.round((overview.correct * 100) / overview.answered)} %`
                : "—",
              detail: overview.answered
                ? `${overview.correct} sur ${overview.answered} réponses · Dernier essai terminé de chaque série`
                : "Après les premiers exercices",
            },
            {
              title: "Fiches relues",
              value: String(
                data.reviewedCourseIds.filter((id) =>
                  data.courses.some(
                    (course) =>
                      course.id === id && course.status === "published",
                  ),
                ).length,
              ),
              detail: "Lecture déclarée par votre enfant",
            },
          ].map((stat) => (
            <Card
              key={stat.title}
              style={{ flexGrow: 1, flexBasis: 220, gap: 9 }}
            >
              <AppText variant="label">{stat.title}</AppText>
              <AppText variant="title" color={colors.primary}>
                {stat.value}
              </AppText>
              <AppText variant="small" color={colors.muted}>
                {stat.detail}
              </AppText>
            </Card>
          ))}
        </View>
        <AppText variant="small" color={colors.muted}>
          Les lectures indiquent une activité. Les résultats décrivent les
          exercices réalisés ; ils ne suffisent pas à établir la maîtrise d’une
          notion.
        </AppText>
        <AnswerReviewList />
        <VocabularyActivityCard sessions={data.vocabularySessions} />
        <Card style={{ gap: 18 }}>
          <AppText variant="heading">Les notions à revoir</AppText>
          <AppText color={colors.muted}>
            Erreurs encore présentes dans le dernier essai terminé de chaque
            série. Les réponses et corrections ci-dessous sont celles réellement
            présentées.
          </AppText>
          {!overview.concepts.length ? (
            <AppText>
              {overview.completed.length
                ? "Aucune erreur à revoir dans les derniers essais terminés."
                : "Les notions à revoir apparaîtront après les premiers exercices."}
            </AppText>
          ) : (
            overview.concepts.map((item, index) => {
              const subject = data.subjects.find(
                (subject) => subject.id === item.subjectId,
              );
              const courseId = item.courseIds.find((id) =>
                data.courses.some(
                  (course) => course.id === id && course.status === "published",
                ),
              );
              return (
                <Card
                  inset
                  key={`${item.subjectId}-${item.concept}`}
                  testID={`review-concept-${index}`}
                  style={{ gap: 12 }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      flexWrap: "wrap",
                      gap: 10,
                      alignItems: "center",
                    }}
                  >
                    <AppIcon
                      name={subject?.icon ?? "book"}
                      color={subjectAccent(subject?.color)}
                    />
                    <AppText variant="heading">{item.concept}</AppText>
                    <Badge tone="orange">
                      {item.errors} erreur{item.errors > 1 ? "s" : ""} observée
                      {item.errors > 1 ? "s" : ""}
                    </Badge>
                  </View>
                  <AppText variant="small" color={colors.muted}>
                    {subject?.title} · Nombre d’erreurs sur l’ensemble des
                    essais terminés
                  </AppText>
                  <AppText>{item.question.prompt}</AppText>
                  <AppText variant="small">
                    Réponse donnée : {item.response || "Sans réponse"}
                  </AppText>
                  <AppText variant="label" color={colors.green}>
                    Réponse attendue : {expectedAnswerLabel(item.question)}
                  </AppText>
                  <AppText color={colors.muted}>
                    {item.question.explanation}
                  </AppText>
                  {courseId && (
                    <Button
                      variant="secondary"
                      icon="pencil"
                      onPress={() =>
                        router.push({
                          pathname: "/parent/exercises",
                          params: { courseId },
                        })
                      }
                    >
                      Préparer un entraînement sur ce cours
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    icon="calendar"
                    onPress={() => router.push("/parent/controls")}
                  >
                    Préparer un contrôle avec reprise des erreurs
                  </Button>
                </Card>
              );
            })
          )}
        </Card>
        <Card style={{ gap: 16 }}>
          <AppText variant="heading">À accompagner</AppText>
          {unfinished.length ? (
            unfinished.map((attempt) => (
              <View key={attempt.id} style={{ gap: 5 }}>
                <AppText variant="label">{attempt.seriesTitle}</AppText>
                <AppText color={colors.muted}>
                  Séance commencée · {plural(attempt.answers.length, "réponse")}{" "}
                  sur {attempt.questions.length}. Votre enfant peut la reprendre
                  depuis son accueil.
                </AppText>
              </View>
            ))
          ) : (
            <AppText color={colors.muted}>
              Aucun exercice commencé à reprendre.
            </AppText>
          )}
          {late.map((plan) => (
            <View key={plan.id} style={{ gap: 8 }}>
              <Badge tone="orange">
                {plan.examDate < today
                  ? "Date du contrôle passée"
                  : "Séances à reprogrammer"}
              </Badge>
              <AppText variant="label">{plan.title}</AppText>
              <Button
                variant="secondary"
                icon="calendar"
                onPress={() =>
                  router.push({
                    pathname: "/parent/controls",
                    params: { id: plan.id },
                  })
                }
              >
                Ajuster le plan
              </Button>
            </View>
          ))}
        </Card>
        <AppText variant="heading">Résultats par matière</AppText>
        {!overview.latest.length ? (
          <EmptyState
            icon="chart"
            title="Les premiers résultats arriveront ici"
            description="Publiez un cours et des exercices pour commencer les révisions."
          >
            <Button icon="book" onPress={() => router.push("/parent/library")}>
              Ouvrir les cours et exercices
            </Button>
          </EmptyState>
        ) : (
          data.subjects
            .filter((subject) =>
              overview.latest.some(
                (attempt) => attempt.subjectId === subject.id,
              ),
            )
            .map((subject) => {
              const answers = overview.latest
                .filter((attempt) => attempt.subjectId === subject.id)
                .flatMap((attempt) => attempt.answers);
              const correct = answers.filter(
                (answer) => answer.isCorrect,
              ).length;
              return (
                <Card key={subject.id} style={{ gap: 10 }}>
                  <AppText variant="heading">{subject.title}</AppText>
                  <AppText>
                    {correct} bonnes réponses sur {answers.length}
                    {answers.some((answer) => answer.usedHint)
                      ? " · certaines avec un indice"
                      : ""}
                  </AppText>
                  <AppText variant="small" color={colors.muted}>
                    Dernier essai terminé de chaque série de cette matière.
                  </AppText>
                </Card>
              );
            })
        )}
      </View>
    </ParentLayout>
  );
}
