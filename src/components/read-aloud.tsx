import React, { useEffect, useState } from "react";
import { View } from "react-native";
import * as Speech from "expo-speech";
import { AppText, Button } from "./ui";
import { colors } from "@/theme";
import { speechSupported } from "@/services/speech-supported";
export function ReadAloud({
  text,
  language = "fr-FR",
}: {
  text: string;
  language?: string;
}) {
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState("");
  useEffect(
    () => () => {
      if (speechSupported()) void Speech.stop().catch(() => undefined);
    },
    [text],
  );
  function play() {
    if (!speechSupported()) {
      setError("La lecture audio n’est pas disponible sur cet appareil.");
      return;
    }
    if (speaking) {
      void Speech.stop();
      setSpeaking(false);
      return;
    }
    setError("");
    setSpeaking(true);
    Speech.speak(text, {
      language,
      rate: 0.9,
      onDone: () => setSpeaking(false),
      onStopped: () => setSpeaking(false),
      onError: () => {
        setSpeaking(false);
        setError("La lecture audio n’est pas disponible sur cet appareil.");
      },
    });
  }
  return (
    <View style={{ gap: 8 }}>
      <Button variant="secondary" icon="volume" onPress={play}>
        {speaking ? "Arrêter la lecture" : "Écouter la fiche"}
      </Button>
      {!!error && (
        <AppText variant="small" color={colors.danger}>
          {error}
        </AppText>
      )}
    </View>
  );
}
