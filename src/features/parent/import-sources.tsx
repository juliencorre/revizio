import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { AppText, Button, IconButton } from "@/components/ui";
import type { CourseSource } from "@/domain/model";
import { pickDocuments } from "@/services/pick-documents";
import { pickPhotos } from "@/services/pick-photos";
import { cacheSource } from "@/services/source-cache";
import { uploadCourseSource } from "@/services/api";
import { useLearning } from "@/state/learning-store";
import { localId, Notice, useParentStyles } from "./shared";

const maxSources = 30;
type Picker = "camera" | "photos" | "files";

export async function selectSources(
  mode: Picker,
  count: number,
  append: (source: CourseSource) => void,
  photoMaxEdge = 2200,
) {
  const room = maxSources - count;
  if (room <= 0) return;
  const makeId = () => localId("source");
  const selected =
    mode === "files"
      ? await pickDocuments(true, makeId)
      : await pickPhotos(mode === "camera", room, makeId, photoMaxEdge);
  try {
    for (const source of selected.slice(0, room)) {
      const cached = await cacheSource(source);
      append({ ...cached, uri: cached.cachedUri || cached.uri });
    }
    if (selected.length > room)
      throw new Error(
        "Vous pouvez joindre 30 documents. Les documents supplémentaires n’ont pas été ajoutés.",
      );
  } finally {
    for (const { uri } of selected)
      if (uri?.startsWith("blob:")) URL.revokeObjectURL(uri);
  }
}

export function SourceButtons({
  count,
  disabled,
  onPick,
}: {
  count: number;
  disabled: boolean;
  onPick: (mode: Picker) => void;
}) {
  const s = useParentStyles();
  const full = disabled || count >= maxSources;
  return (
    <View style={s.row}>
      <Button
        icon="camera"
        disabled={full}
        testID="ai-import-camera"
        onPress={() => onPick("camera")}
      >
        Prendre une photo
      </Button>
      <Button
        icon="upload"
        variant="secondary"
        disabled={full}
        testID="ai-import-photos"
        onPress={() => onPick("photos")}
      >
        Choisir des images
      </Button>
      <Button
        icon="file"
        variant="secondary"
        disabled={full}
        testID="ai-import-files"
        onPress={() => onPick("files")}
      >
        Choisir des fichiers
      </Button>
    </View>
  );
}

export function LanguageSourceImport({
  onAnalyze,
  onBusyChange,
}: {
  onAnalyze: (sources: CourseSource[]) => Promise<void>;
  onBusyChange?: (busy: boolean) => void;
}) {
  const { activeProfileId, isDemo, serverAvailable } = useLearning();
  const [sources, setSources] = useState<CourseSource[]>([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const locked = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const s = useParentStyles();
  async function run(message: string, action: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true;
    setStatus(message);
    setError("");
    onBusyChange?.(true);
    try {
      await action();
    } catch (cause) {
      if (mounted.current)
        setError(
          cause instanceof Error
            ? cause.message
            : "L’import a échoué. Réessayez.",
        );
    } finally {
      locked.current = false;
      if (mounted.current) {
        setStatus("");
        onBusyChange?.(false);
      }
    }
  }
  async function analyze() {
    const uploaded: CourseSource[] = [];
    for (const source of sources) {
      if (!mounted.current) return;
      const stored = await uploadCourseSource(source, activeProfileId);
      uploaded.push(stored);
      // Keep successful uploads if a later attachment or the analysis needs a retry.
      if (mounted.current && source.id !== stored.id)
        setSources((current) =>
          current.map((item) => (item.id === source.id ? stored : item)),
        );
    }
    if (!mounted.current) return;
    await onAnalyze(uploaded);
    if (mounted.current) setSources([]);
  }
  return (
    <View style={{ gap: 12 }}>
      <SourceButtons
        count={sources.length}
        disabled={!!status}
        onPick={(mode) =>
          void run("Ajout des documents…", () =>
            selectSources(
              mode,
              sources.length,
              (source) => {
                if (mounted.current)
                  setSources((current) => [...current, source]);
              },
              1600,
            ),
          )
        }
      />
      {sources.map((source) => (
        <View key={source.id} style={s.row}>
          <AppText style={{ flex: 1 }}>{source.name}</AppText>
          {!status && (
            <IconButton
              icon="trash"
              label={"Retirer " + source.name}
              onPress={() =>
                setSources((current) =>
                  current.filter((item) => item.id !== source.id),
                )
              }
            />
          )}
        </View>
      ))}
      {error && <Notice error>{error}</Notice>}
      {status && <Notice>{status}</Notice>}
      {isDemo || !serverAvailable ? (
        <Notice>
          Connectez-vous au serveur familial pour analyser les documents.
        </Notice>
      ) : null}
      {sources.length > 0 && (
        <Button
          icon="file"
          disabled={!!status || isDemo || !serverAvailable}
          onPress={() => void run("Lecture des documents en cours…", analyze)}
        >
          Analyser les documents
        </Button>
      )}
    </View>
  );
}
