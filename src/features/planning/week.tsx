import { useState } from "react";
import { View } from "react-native";
import { AppText, Badge, Button, Card } from "@/components/ui";
import type { PlanStep, RevisionPlan, Subject } from "@/domain/model";
import { dateOnly, weekDates, weeklyWorkload } from "@/domain/planning";
import { useTheme, spacing } from "@/theme";

const dateLabel = (date: string) =>
  new Date(date + "T12:00:00").toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
const row = {
  flexDirection: "row",
  alignItems: "center",
  flexWrap: "wrap",
  gap: spacing.sm,
} as const;
type Move = (plan: RevisionPlan, step: PlanStep, date: string) => void;

export function RevisionWeek({
  plans,
  subjects,
  onMove,
}: {
  plans: RevisionPlan[];
  subjects: Subject[];
  onMove?: Move;
}) {
  const { colors } = useTheme();
  const today = dateOnly();
  const [anchor, setAnchor] = useState(today);
  const [moving, setMoving] = useState<{
    planId: string;
    stepId: string;
  } | null>(null);
  const [message, setMessage] = useState("");
  const days = weeklyWorkload(plans, anchor);
  const scheduled = days.filter((day) => day.sessions.length);
  const go = (date: string) => {
    setAnchor(date);
    setMoving(null);
    setMessage("");
  };
  return (
    <Card style={{ gap: spacing.md }} testID="revision-week">
      <AppText variant="heading">
        {onMove ? "Semaine de révision" : "Ma semaine de révision"}
      </AppText>
      <AppText variant="label">
        Du {dateLabel(days[0].date)} au {dateLabel(days[6].date)}
      </AppText>
      <View style={row}>
        <Button
          variant="secondary"
          icon="arrow-left"
          onPress={() => go(weekDates(anchor, -1)[0])}
        >
          Semaine précédente
        </Button>
        <Button
          variant="secondary"
          icon="arrow-right"
          onPress={() => go(weekDates(anchor, 1)[0])}
        >
          Semaine suivante
        </Button>
        {!days.some((day) => day.date === today) && (
          <Button variant="ghost" onPress={() => go(today)}>
            Cette semaine
          </Button>
        )}
      </View>
      {!!message && (
        <View accessibilityLiveRegion="polite">
          <AppText>{message}</AppText>
        </View>
      )}
      {!scheduled.length && (
        <AppText color={colors.muted}>
          Aucune séance prévue cette semaine.
        </AppText>
      )}
      {scheduled.map(({ date, sessions, minutes }) => (
        <View
          key={date}
          style={{
            gap: spacing.sm,
            paddingTop: spacing.sm,
            borderTopWidth: 1,
            borderColor: colors.border,
          }}
        >
          <View style={row}>
            <AppText variant="label">{dateLabel(date)}</AppText>
            <Badge>{minutes} min au total</Badge>
          </View>
          {sessions.map(({ plan, step }) => (
            <View key={plan.id + "/" + step.id} style={{ gap: spacing.xs }}>
              <View style={row}>
                <View style={{ flex: 1, minWidth: 140 }}>
                  <AppText>
                    {step.title}
                    {step.completedAt ? " · Terminée" : ""}
                  </AppText>
                  <AppText variant="small" color={colors.muted}>
                    {subjects.find((s) => s.id === plan.subjectId)?.shortLabel}{" "}
                    · {plan.title} · {step.minutes} min
                    {plan.status === "draft" ? " · Brouillon" : ""}
                  </AppText>
                </View>
                {onMove && !step.completedAt && plan.examDate >= today && (
                  <Button
                    variant="secondary"
                    accessibilityLabel={`Déplacer ${step.title} du contrôle ${plan.title}`}
                    onPress={() => {
                      setMoving({ planId: plan.id, stepId: step.id });
                      setMessage("");
                    }}
                  >
                    Déplacer
                  </Button>
                )}
              </View>
              {onMove &&
                moving?.planId === plan.id &&
                moving.stepId === step.id && (
                  <MoveDay
                    step={step}
                    plan={plan}
                    today={today}
                    onCancel={() => setMoving(null)}
                    onPick={(target) => {
                      onMove(plan, step, target);
                      setAnchor(target);
                      setMoving(null);
                      setMessage(
                        `« ${step.title} » est prévue le ${dateLabel(target)}.`,
                      );
                    }}
                  />
                )}
            </View>
          ))}
        </View>
      ))}
    </Card>
  );
}

function MoveDay({
  step,
  plan,
  today,
  onPick,
  onCancel,
}: {
  step: PlanStep;
  plan: RevisionPlan;
  today: string;
  onPick: (date: string) => void;
  onCancel: () => void;
}) {
  const { colors } = useTheme();
  const [anchor, setAnchor] = useState(step.date < today ? today : step.date);
  const [error, setError] = useState("");
  const days = weekDates(anchor);
  return (
    <View
      style={{
        gap: spacing.sm,
        padding: spacing.md,
        backgroundColor: colors.surfaceInset,
      }}
    >
      <AppText variant="label">
        {plan.status === "published"
          ? "Déplacer la séance publiée au…"
          : "Déplacer la séance au…"}
      </AppText>
      <View style={row}>
        {days.map((day) => (
          <Button
            key={day}
            variant="secondary"
            disabled={day < today || day > plan.examDate || day === step.date}
            onPress={() => {
              try {
                onPick(day);
              } catch (cause) {
                setError(
                  cause instanceof Error
                    ? cause.message
                    : "Le déplacement a échoué.",
                );
              }
            }}
          >
            {dateLabel(day)}
          </Button>
        ))}
      </View>
      <View style={row}>
        {days[0] > today && (
          <Button
            variant="ghost"
            icon="arrow-left"
            onPress={() => setAnchor(weekDates(anchor, -1)[0])}
          >
            Sept jours avant
          </Button>
        )}
        {days[6] < plan.examDate && (
          <Button
            variant="ghost"
            icon="arrow-right"
            onPress={() => setAnchor(weekDates(anchor, 1)[0])}
          >
            Sept jours après
          </Button>
        )}
        <Button variant="ghost" onPress={onCancel}>
          Annuler
        </Button>
      </View>
      {!!error && (
        <View accessibilityRole="alert">
          <AppText color={colors.danger}>{error}</AppText>
        </View>
      )}
    </View>
  );
}
