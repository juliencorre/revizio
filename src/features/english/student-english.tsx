import { useEffect, useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import * as Speech from "expo-speech";
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
import { useLearning } from "@/state/learning-store";
import { englishFlashcards, englishTenses } from "@/domain/english";
import { StudyWorkspace } from "@/features/planning/shared";
import { speechSupported } from "@/services/speech-supported";

export function StudentEnglishScreen() {
  const data = useLearning();
  const router = useRouter();
  const [filter, setFilter] = useState<"all" | "words" | "verbs">("all");
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [speechError, setSpeechError] = useState("");
  const cards = useMemo(
    () =>
      englishFlashcards(data.english).filter(
        (card) =>
          filter === "all" ||
          (filter === "words" ? card.kind === "Mot" : card.kind !== "Mot"),
      ),
    [data.english, filter],
  );
  const card = cards[index % Math.max(1, cards.length)];
  const quiz = data.series.find(
    (series) =>
      series.id === "english-repertoire-practice" &&
      series.status === "published",
  );
  useEffect(
    () => () => {
      if (speechSupported()) void Speech.stop().catch(() => undefined);
    },
    [],
  );
  function changeFilter(next: typeof filter) {
    setFilter(next);
    setIndex(0);
    setFlipped(false);
    if (speechSupported()) void Speech.stop().catch(() => undefined);
    setSpeaking(false);
  }
  function next(direction: number) {
    setIndex((current) => (current + direction + cards.length) % cards.length);
    setFlipped(false);
    if (speechSupported()) void Speech.stop().catch(() => undefined);
    setSpeaking(false);
  }
  async function speak() {
    if (!card) return;
    if (!speechSupported()) {
      setSpeechError(
        "La lecture audio est indisponible sur cet appareil. Tu peux continuer avec les cartes écrites.",
      );
      return;
    }
    setSpeechError("");
    try {
      await Speech.stop();
      if (speaking) {
        setSpeaking(false);
        return;
      }
      const text =
        flipped && ["Prétérit", "Participe passé"].includes(card.kind)
          ? card.back
          : card.front;
      Speech.speak(text, {
        language: "en-GB",
        rate: 0.85,
        onStart: () => setSpeaking(true),
        onDone: () => setSpeaking(false),
        onStopped: () => setSpeaking(false),
        onError: () => {
          setSpeaking(false);
          setSpeechError(
            "La lecture audio est indisponible sur cet appareil. Tu peux continuer avec les cartes écrites.",
          );
        },
      });
    } catch {
      setSpeaking(false);
      setSpeechError("La lecture audio n’a pas pu démarrer.");
    }
  }
  return (
    <StudyWorkspace role="child" active="english">
      <View testID="student-english" style={{ gap: 26 }}>
        <PageHeading
          eyebrow="Des mots qui deviennent familiers"
          title="Mon anglais"
          description="Retrouve les mots et les verbes que tu as étudiés en classe."
        />
        {!englishFlashcards(data.english).length ? (
          <EmptyState
            icon="languages"
            title="Tes cartes d’anglais arriveront ici"
            description="Un parent peut ajouter et vérifier les mots, les verbes et les temps vus en classe."
          >
            <Button
              icon="book"
              onPress={() => router.push("/student/subject/english")}
            >
              Mes cours d’anglais
            </Button>
          </EmptyState>
        ) : (
          <>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
              {(
                [
                  { id: "all", label: "Toutes mes cartes" },
                  { id: "words", label: "Mes mots" },
                  { id: "verbs", label: "Mes verbes" },
                ] as const
              ).map((item) => (
                <Button
                  key={item.id}
                  variant={filter === item.id ? "primary" : "secondary"}
                  onPress={() => changeFilter(item.id)}
                >
                  {item.label}
                </Button>
              ))}
            </View>
            {card ? (
              <>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <AppText variant="heading">Je me rappelle…</AppText>
                  <Badge>
                    {(index % cards.length) + 1} / {cards.length}
                  </Badge>
                </View>
                <ProgressBar
                  value={(((index % cards.length) + 1) / cards.length) * 100}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    flipped
                      ? "Voir le mot anglais"
                      : "Retourner la carte pour voir la réponse"
                  }
                  onPress={() => setFlipped(!flipped)}
                  testID="english-flashcard"
                >
                  <Card
                    style={{
                      minHeight: 270,
                      alignItems: "center",
                      justifyContent: "center",
                      padding: 34,
                      gap: 24,
                    }}
                  >
                    <Badge tone={flipped ? "green" : "primary"}>
                      {card.kind}
                      {flipped ? " · Réponse" : ""}
                    </Badge>
                    <AppText
                      variant="hero"
                      color={flipped ? colors.green : colors.primary}
                      style={{
                        textAlign: "center",
                        fontSize: 44,
                        lineHeight: 56,
                      }}
                    >
                      {flipped ? card.back : card.front}
                    </AppText>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <AppIcon name="refresh" size={18} />
                      <AppText variant="small" color={colors.muted}>
                        Touche la carte pour la retourner
                      </AppText>
                    </View>
                  </Card>
                </Pressable>
                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    justifyContent: "center",
                    gap: 14,
                  }}
                >
                  <Button
                    variant="secondary"
                    icon="arrow-left"
                    onPress={() => next(-1)}
                  >
                    Précédente
                  </Button>
                  <Button
                    variant="secondary"
                    icon="volume"
                    onPress={() => void speak()}
                    testID="speak-english-word"
                  >
                    {speaking ? "Arrêter la lecture" : "Écouter le mot"}
                  </Button>
                  <Button icon="arrow-right" onPress={() => next(1)}>
                    Suivante
                  </Button>
                </View>
                {speechError && (
                  <AppText color={colors.orange}>{speechError}</AppText>
                )}
              </>
            ) : (
              <EmptyState
                icon="languages"
                title="Pas encore de carte dans cette catégorie"
                description="Tu peux choisir une autre catégorie pour retrouver tes mots."
              />
            )}
            <Card style={{ gap: 16 }}>
              <AppText variant="heading">Je vérifie ce que j’ai retenu</AppText>
              <AppText color={colors.muted}>
                Les exercices utilisent ton répertoire vérifié. Tu retrouveras
                ensuite les réponses et les notions à revoir.
              </AppText>
              {quiz ? (
                <Button
                  icon="play"
                  testID="start-english-quiz"
                  onPress={() =>
                    router.push({
                      pathname: "/student/exercise/[id]",
                      params: { id: quiz.id },
                    })
                  }
                >
                  Commencer mon quiz d’anglais
                </Button>
              ) : (
                <AppText color={colors.muted}>
                  Un parent peut enregistrer le répertoire pour préparer le
                  quiz.
                </AppText>
              )}
            </Card>
            {!!data.english.tenses.length && (
              <Card style={{ gap: 16 }}>
                <AppText variant="heading">Les temps que j’ai étudiés</AppText>
                <View
                  style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}
                >
                  {englishTenses
                    .filter((tense) => data.english.tenses.includes(tense.id))
                    .map((tense) => (
                      <Badge key={tense.id}>{tense.label}</Badge>
                    ))}
                </View>
                <Button
                  variant="ghost"
                  icon="book"
                  onPress={() => router.push("/student/subject/english")}
                >
                  Retrouver mes fiches d’anglais
                </Button>
              </Card>
            )}
          </>
        )}
      </View>
    </StudyWorkspace>
  );
}
