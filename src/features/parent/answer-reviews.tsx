import { View } from "react-native";
import { AppText, Button, Card } from "@/components/ui";
import { reviewDetails } from "@/domain/answer-reviews";
import { expectedAnswerLabel } from "@/domain/answers";
import { useLearning } from "@/state/learning-store";
import { useTheme } from "@/theme";

export function AnswerReviewList() {
  const data = useLearning();
  const { colors } = useTheme();
  const pending =
    data.answerReviews?.filter((review) => review.status === "pending") ?? [];
  if (!pending.length) return null;
  return (
    <Card style={{ gap: 16 }}>
      <AppText variant="heading">Réponses à vérifier</AppText>
      {pending.map((review) => {
        const details = reviewDetails(data.attempts, review);
        if (!details) return null;
        const { attempt, question, response } = details;
        const courseIds =
          data.series.find((series) => series.id === attempt.seriesId)
            ?.courseIds ?? [];
        const sources = data.courses
          .filter((course) => courseIds.includes(course.id))
          .flatMap((course) => course.sources);
        return (
          <Card inset key={review.id} style={{ gap: 10 }}>
            <AppText variant="small" color={colors.muted}>
              {attempt.seriesTitle}
            </AppText>
            <AppText variant="label">{question.prompt}</AppText>
            <AppText>
              Réponse de {data.childName} : {response}
            </AppText>
            <AppText>
              Réponse attendue : {expectedAnswerLabel(question)}
            </AppText>
            <AppText>{question.explanation}</AppText>
            {question.sourceRefs?.map((ref, index) => (
              <AppText key={index} variant="small" color={colors.muted}>
                {sources.find(
                  (source) =>
                    source.id === ref.sourceId ||
                    source.storageId === ref.sourceId,
                )?.name ?? "Texte du cours"}
                {ref.page ? ` · page ${ref.page}` : ""}
                {ref.excerpt ? ` · « ${ref.excerpt} »` : ""}
              </AppText>
            ))}
            <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
              <Button
                icon="check"
                onPress={() => data.reviewAnswer(review.id, "accepted")}
              >
                Accepter pour les prochaines séances
              </Button>
              <Button
                variant="secondary"
                onPress={() => data.reviewAnswer(review.id, "declined")}
              >
                Confirmer la correction
              </Button>
            </View>
          </Card>
        );
      })}
    </Card>
  );
}
