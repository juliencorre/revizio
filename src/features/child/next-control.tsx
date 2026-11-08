import { View } from "react-native";
import { useRouter } from "expo-router";
import { AppText, Badge, Button, Card } from "@/components/ui";
import { colors } from "@/theme";
import { dateOnly } from "@/domain/planning";
import { formatDate, useChildData } from "./shared";
export function NextControl({ subjectId }: { subjectId?: string }) {
  const data = useChildData();
  const router = useRouter();
  const next = data.plans
    .filter(
      (plan) =>
        plan.status === "published" &&
        plan.examDate >= dateOnly() &&
        (!subjectId || plan.subjectId === subjectId),
    )
    .sort((a, b) => a.examDate.localeCompare(b.examDate))[0];
  if (!next) return null;
  const remaining = next.steps.filter((step) => !step.completedAt).length;
  return (
    <Card style={{ gap: 16, backgroundColor: colors.primaryLight }}>
      <View
        style={{
          flexDirection: "row",
          gap: 16,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <View style={{ flex: 1, minWidth: 180, gap: 8 }}>
          <Badge tone="orange">
            Mon prochain contrôle · {formatDate(next.examDate)}
          </Badge>
          <AppText variant="heading">{next.title}</AppText>
          <AppText color={colors.muted}>
            {remaining
              ? `${remaining} séance${remaining > 1 ? "s" : ""} pour me préparer, à mon rythme.`
              : "Mon plan est terminé. Je peux revenir sur mes corrections."}
          </AppText>
        </View>
        <Button
          icon="calendar"
          onPress={() => router.push(`/student/plans?id=${next.id}`)}
        >
          Voir mon plan
        </Button>
      </View>
    </Card>
  );
}
