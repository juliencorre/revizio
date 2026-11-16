import { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import * as Speech from "expo-speech";
import {
  AppText,
  Button,
  Card,
  EmptyState,
  PageHeading,
} from "@/components/ui";
import { conjugationVerbs, type ConjugationSheet } from "@/domain/conjugation";
import {
  conjugationSeriesId,
  conjugationTitle,
} from "@/domain/conjugation-practice";
import { conjugationDestination } from "@/domain/study-overview";
import { ChildShell, Loading } from "@/features/child/shared";
import { speechSupported } from "@/services/speech-supported";
import { useLearning } from "@/state/learning-store";
import { spacing, useTheme } from "@/theme";
import { ConjugationExercise } from "./conjugation-exercise";
import { ConjugationPracticeFrame } from "./conjugation-practice-frame";
import { ConjugationTable } from "./conjugation-table";

const actions = {
  flexDirection: "row",
  flexWrap: "wrap",
  alignItems: "center",
  gap: spacing.md,
} as const;

export function StudentConjugationScreen() {
  const data = useLearning();
  const router = useRouter();
  const { verb, tense, mode, attemptId } = useLocalSearchParams<{
    verb?: string;
    tense?: string;
    mode?: string;
    attemptId?: string;
  }>();
  const [choosing, setChoosing] = useState(false);
  const targeted = verb !== undefined || tense !== undefined;
  const sheet = targeted
    ? data.conjugationSheets.find(
        (item) => item.verb === verb && item.tense === tense,
      )
    : data.conjugationSheets[0];
  const practicing = mode === "practice";
  const lesson = sheet && (
    <ConjugationLesson
      key={data.activeProfileId + conjugationSeriesId(sheet)}
      sheet={sheet}
      practicing={practicing}
      attemptId={attemptId}
    />
  );
  const unavailable = !data.isReady ? (
    <Loading />
  ) : !sheet ? (
    <EmptyState
      icon="book"
      title={
        targeted
          ? "Cette fiche est indisponible"
          : "Tes fiches de conjugaison arriveront ici"
      }
      description={
        targeted
          ? "Retrouve les verbes et les temps publiés pour toi dans tes fiches."
          : "Un parent peut choisir un verbe et un temps, puis ajouter la fiche à ta révision."
      }
    >
      {targeted && data.conjugationSheets.length > 0 && (
        <Button
          icon="book"
          onPress={() => router.replace("/student/conjugation")}
        >
          Mes fiches
        </Button>
      )}
    </EmptyState>
  ) : null;
  if (practicing) {
    return (
      <ConjugationPracticeFrame
        backLabel={sheet ? "Revoir la fiche" : "Mes cours d’anglais"}
        onBack={() =>
          router.replace(
            sheet ? conjugationDestination(sheet) : "/student/subject/english",
          )
        }
      >
        {unavailable ?? lesson}
      </ConjugationPracticeFrame>
    );
  }
  return (
    <ChildShell active="courses">
      <View style={{ gap: spacing.xl }} testID="student-conjugation">
        <PageHeading
          eyebrow="Anglais"
          title="Ma conjugaison"
          action={
            <Button
              variant="ghost"
              icon="arrow-left"
              onPress={() => router.navigate("/student/subject/english")}
            >
              Mes cours d’anglais
            </Button>
          }
        />
        {unavailable ?? (
          <>
            {data.conjugationSheets.length > 1 && (
              <View style={{ gap: spacing.sm }}>
                <Button
                  variant="secondary"
                  icon="chevron-down"
                  expanded={choosing}
                  testID="choose-conjugation-sheet"
                  onPress={() => setChoosing(!choosing)}
                >
                  Changer de fiche
                </Button>
                {choosing && (
                  <View style={actions}>
                    {data.conjugationSheets.map((item) => (
                      <Button
                        key={conjugationSeriesId(item)}
                        variant={item === sheet ? "primary" : "secondary"}
                        selected={item === sheet}
                        onPress={() => {
                          router.replace(conjugationDestination(item));
                          setChoosing(false);
                        }}
                      >
                        {conjugationTitle(item)}
                      </Button>
                    ))}
                  </View>
                )}
              </View>
            )}
            {lesson}
          </>
        )}
      </View>
    </ChildShell>
  );
}

function ConjugationLesson({
  sheet,
  practicing,
  attemptId,
}: {
  sheet: ConjugationSheet;
  practicing: boolean;
  attemptId?: string;
}) {
  const { colors } = useTheme();
  const data = useLearning();
  const router = useRouter();
  const [error, setError] = useState("");
  const seriesId = conjugationSeriesId(sheet);
  const attempt = data.attempts.find(
    (item) => practicing && item.id === attemptId && item.seriesId === seriesId,
  );
  const pending = data.attempts.some(
    (item) => item.seriesId === seriesId && !item.completedAt,
  );
  const verb = conjugationVerbs.find((item) => item.base === sheet.verb);
  const start = data.startConjugationAttempt;
  const practice = useCallback(() => {
    try {
      const id = start(sheet);
      if (!id) throw new Error("Cette fiche est indisponible.");
      router.replace(conjugationDestination(sheet, id));
      setError("");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "La séance est indisponible.",
      );
    }
  }, [router, sheet, start]);
  useEffect(() => {
    if (practicing && !attemptId) practice();
  }, [attemptId, practice, practicing]);
  if (practicing) {
    return (
      <>
        {attempt ? (
          <ConjugationExercise
            key={attempt.id}
            attempt={attempt}
            onRestart={practice}
          />
        ) : (
          <Card>
            <AppText color={colors.muted}>
              {attemptId
                ? "Cette tentative est indisponible."
                : "Ouverture de la séance…"}
            </AppText>
          </Card>
        )}
        {!!error && (
          <View accessibilityRole="alert">
            <AppText color={colors.danger}>{error}</AppText>
          </View>
        )}
      </>
    );
  }
  return (
    <Card style={{ gap: spacing.lg }}>
      <View style={{ gap: spacing.xs }}>
        <AppText variant="title">{conjugationTitle(sheet)}</AppText>
        {verb && <AppText color={colors.muted}>{verb.meaning}</AppText>}
      </View>
      <View style={actions}>
        <Button
          icon="book"
          selected
          testID="conjugation-learn"
          onPress={() => {
            router.replace(conjugationDestination(sheet));
            setError("");
          }}
        >
          Apprendre
        </Button>
        <Button
          icon="pencil"
          variant="secondary"
          testID="conjugation-practice"
          onPress={practice}
        >
          {pending ? "Reprendre l’entraînement" : "M’entraîner"}
        </Button>
      </View>
      {!!error && <AppText color={colors.danger}>{error}</AppText>}
      <SpokenTable sheet={sheet} />
    </Card>
  );
}

function SpokenTable({ sheet }: { sheet: ConjugationSheet }) {
  const { colors } = useTheme();
  const generation = useRef(0);
  const [error, setError] = useState("");
  useFocusEffect(
    useCallback(
      () => () => {
        generation.current++;
        if (speechSupported()) void Speech.stop().catch(() => undefined);
      },
      [],
    ),
  );
  async function speak(phrase: string) {
    const current = ++generation.current;
    const unavailable = () => {
      if (generation.current === current)
        setError("La lecture audio est indisponible sur cet appareil.");
    };
    if (!speechSupported()) {
      unavailable();
      return;
    }
    setError("");
    try {
      await Speech.stop();
      if (generation.current === current)
        Speech.speak(phrase, {
          language: "en-GB",
          rate: 0.85,
          onError: unavailable,
        });
    } catch {
      unavailable();
    }
  }
  return (
    <View style={{ gap: spacing.md }}>
      <AppText color={colors.muted}>Touche une forme pour l’écouter.</AppText>
      <ConjugationTable sheet={sheet} onSpeak={speak} />
      {!!error && <AppText color={colors.orange}>{error}</AppText>}
    </View>
  );
}
