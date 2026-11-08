import React, { useEffect, useRef, useState } from "react";
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
  const generation = useRef(0);
  useEffect(() => {
    setSpeaking(false);
    return () => {
      generation.current++;
      if (speechSupported()) void Speech.stop().catch(() => undefined);
    };
  }, [text]);
  function play() {
    if (!speechSupported()) {
      setError("La lecture audio n’est pas disponible sur cet appareil.");
      return;
    }
    if (speaking) {
      generation.current++;
      void Speech.stop().catch(() => undefined);
      setSpeaking(false);
      return;
    }
    setError("");
    setSpeaking(true);
    const chunks = text.match(/[\s\S]{1,2000}(?:\s|$)|[\s\S]{1,2000}/g) ?? [];
    const current = ++generation.current;
    function read(index: number) {
      if (current !== generation.current) return;
      if (index >= chunks.length) {
        setSpeaking(false);
        return;
      }
      Speech.speak(chunks[index], {
        language,
        rate: 0.9,
        onDone: () => read(index + 1),
        onStopped: () => {
          if (current === generation.current) setSpeaking(false);
        },
        onError: () => {
          if (current !== generation.current) return;
          setSpeaking(false);
          setError("La lecture audio n’est pas disponible sur cet appareil.");
        },
      });
    }
    read(0);
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
