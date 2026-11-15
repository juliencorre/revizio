import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { useNavigation } from "expo-router";
import {
  AppText,
  Badge,
  Button,
  IconButton,
  useWindowClass,
} from "@/components/ui";
import { SourceViewer } from "@/components/source-viewer";
import type { AiJob, VocabularyList, VocabularyWord } from "@/domain/model";
import { languageLabel, reviewVocabularyPhoto } from "@/domain/vocabulary";
import { Field, Notice } from "@/features/parent/shared";
import { apiFetch, waitForJob } from "@/services/api";
import { useLearning } from "@/state/learning-store";
import { radius, spacing, useTheme } from "@/theme";
import { pickVocabularyPhoto } from "./photo-source";
import { useVocabularyStyles } from "./shared";

interface ImportProps {
  list: VocabularyList;
  onAdd: (words: VocabularyWord[]) => void;
}

function PhotoReview({
  list,
  job,
  onAdd,
  onClose,
}: ImportProps & { job: AiJob; onClose: () => void }) {
  const vocabularyStyles = useVocabularyStyles();
  const [rows, setRows] = useState(() =>
    (job.result?.vocabulary ?? []).map((word, index) => ({
      ...word,
      id: `photo-${job.id}-${index}`,
    })),
  );
  const [showPhoto, setShowPhoto] = useState(false);
  const sources = job.input?.sourceIds;
  const photoId =
    Array.isArray(sources) && typeof sources[0] === "string"
      ? sources[0]
      : undefined;
  const compact = useWindowClass() === "compact";
  const fieldStyle = {
    flex: compact ? undefined : 1,
    width: compact ? ("100%" as const) : undefined,
    minWidth: 0,
  };
  const states = reviewVocabularyPhoto(list.words, rows);
  const ready = rows.filter((_, i) => states[i] === "ready");
  const remaining = Math.max(
    0,
    200 -
      list.words.filter((word) => word.term.trim() || word.translation.trim())
        .length,
  );
  const canAdd =
    ready.length > 0 &&
    ready.length <= remaining &&
    !states.includes("incomplete");
  function edit(id: string, field: "term" | "translation", value: string) {
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, [field]: value } : row)),
    );
  }
  function add() {
    if (!canAdd) return;
    onAdd(
      ready.map(({ id, term, translation }) => ({
        id,
        term: term.trim(),
        translation: translation.trim(),
      })),
    );
    onClose();
  }
  return (
    <>
      {photoId && (
        <Button
          icon="search"
          variant="ghost"
          style={{ alignSelf: "flex-start" }}
          onPress={() => setShowPhoto(true)}
        >
          Voir la photo
        </Button>
      )}
      {showPhoto && photoId && (
        <SourceViewer
          source={{
            id: photoId,
            storageId: photoId,
            name: "Photo de la liste à relire",
            uri: "/api/uploads/" + encodeURIComponent(photoId),
            mimeType: "image/png",
          }}
          onClose={() => setShowPhoto(false)}
        />
      )}
      {!compact && rows.length > 0 && (
        <View style={vocabularyStyles.row}>
          <AppText variant="label" style={fieldStyle}>
            {languageLabel(list.language)}
          </AppText>
          <AppText variant="label" style={fieldStyle}>
            Français
          </AppText>
          <View style={{ width: 48 }} />
        </View>
      )}
      {rows.map((row, i) => (
        <View key={row.id} style={{ gap: spacing.xs }}>
          <View style={vocabularyStyles.row}>
            <View style={fieldStyle}>
              <Field
                label={languageLabel(list.language)}
                hideLabel={!compact}
                accessibilityLabel={`Mot proposé ${i + 1}`}
                value={row.term}
                maxLength={300}
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={(value) => edit(row.id, "term", value)}
              />
            </View>
            <View style={fieldStyle}>
              <Field
                label="Français"
                hideLabel={!compact}
                accessibilityLabel={`Traduction proposée ${i + 1}`}
                value={row.translation}
                maxLength={300}
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={(value) => edit(row.id, "translation", value)}
              />
            </View>
            <IconButton
              icon="trash"
              label={`Écarter la proposition ${i + 1}`}
              onPress={() =>
                setRows((current) =>
                  current.filter((item) => item.id !== row.id),
                )
              }
            />
          </View>
          <View style={vocabularyStyles.row}>
            {states[i] === "duplicate" ? (
              <Badge tone="muted">Mot en double · ignoré</Badge>
            ) : row.reading === "suggested" ? (
              <Badge tone="orange">Traduction proposée par l’IA</Badge>
            ) : row.reading === "uncertain" ? (
              <Badge tone="orange">Lecture incertaine</Badge>
            ) : null}
            {states[i] === "incomplete" && (
              <AppText variant="small">
                Complétez cette paire ou écartez-la.
              </AppText>
            )}
          </View>
        </View>
      ))}
      {ready.length > remaining && (
        <Notice error>
          La liste est limitée à 200 mots. Il reste {remaining}{" "}
          {remaining > 1 ? "places" : "place"}.
        </Notice>
      )}
      {!rows.length && (
        <AppText>Toutes les propositions ont été écartées.</AppText>
      )}
      <View style={vocabularyStyles.row}>
        <Button icon="plus" disabled={!canAdd} onPress={add}>
          {ready.length === 1
            ? "Ajouter 1 mot au brouillon"
            : `Ajouter ${ready.length} mots au brouillon`}
        </Button>
        <Button variant="ghost" onPress={onClose}>
          Annuler l’import
        </Button>
      </View>
    </>
  );
}

export function VocabularyPhotoImport({
  list,
  jobId,
  onAdd,
}: ImportProps & { jobId?: string }) {
  const { colors } = useTheme();
  const vocabularyStyles = useVocabularyStyles();
  const { activeProfileId, isDemo, serverAvailable } = useLearning();
  const navigation = useNavigation<{
    setParams(params: { photoJob?: string }): void;
  }>();
  const [open, setOpen] = useState(!!jobId);
  const [job, setJob] = useState<AiJob | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(
    jobId ? "Lecture de la photo en cours…" : "",
  );
  const mounted = useRef(false);
  const { id, language } = list;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!jobId || isDemo) return;
    const controller = new AbortController();
    const signal = controller.signal;
    void waitForJob(
      jobId,
      (update) => {
        if (signal.aborted) return;
        if (
          update.kind !== "vocabulary" ||
          update.profileId !== activeProfileId ||
          update.input?.listId !== id ||
          update.input.subjectId !== language
        )
          throw new Error(
            "Cette lecture ne correspond pas à la liste ouverte.",
          );
        setProgress(update.message ?? "Lecture de la photo en cours…");
      },
      signal,
    )
      .then((result) => {
        if (signal.aborted) return;
        if (!result.result?.vocabulary?.length)
          throw new Error("Aucun mot lisible sur cette photo.");
        setJob(result);
      })
      .catch((cause) => {
        if (!signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : "La photo n’a pas pu être lue.",
          );
      })
      .finally(() => {
        if (!signal.aborted) setProgress("");
      });
    return () => controller.abort();
  }, [jobId, activeProfileId, id, language, isDemo]);

  async function choose(camera: boolean) {
    setError("");
    setChoosing(true);
    try {
      const photo = await pickVocabularyPhoto(camera, activeProfileId);
      if (!photo || !mounted.current) return;
      const { job: queued } = await apiFetch<{ job: AiJob }>("/ai/vocabulary", {
        method: "POST",
        body: JSON.stringify({
          profileId: activeProfileId,
          listId: id,
          subjectId: language,
          title: list.title.trim() || undefined,
          sourceIds: [photo.id],
        }),
      });
      // A reload of the editor can resume this specific reading without submitting the photo again.
      if (mounted.current) navigation.setParams({ photoJob: queued.id });
    } catch (cause) {
      if (mounted.current)
        setError(
          cause instanceof Error
            ? cause.message
            : "La photo n’a pas pu être importée. Réessayez avec une autre image.",
        );
    } finally {
      if (mounted.current) setChoosing(false);
    }
  }
  function close() {
    setOpen(false);
    setError("");
    if (jobId) navigation.setParams({ photoJob: undefined });
  }
  if (!open)
    return (
      <Button
        icon="camera"
        variant="secondary"
        style={{ alignSelf: "flex-start" }}
        onPress={() => setOpen(true)}
      >
        Importer une photo
      </Button>
    );
  return (
    <View
      style={{
        gap: spacing.md,
        padding: spacing.lg,
        borderRadius: radius.md,
        backgroundColor: colors.background,
      }}
    >
      <View style={[vocabularyStyles.row, { justifyContent: "space-between" }]}>
        <AppText variant="heading">
          {job ? "Relire les mots de la photo" : "Importer une photo"}
        </AppText>
        {!choosing && (
          <IconButton
            icon="close"
            label="Fermer l’import photo"
            onPress={close}
          />
        )}
      </View>
      {error && <Notice error>{error}</Notice>}
      {isDemo ? (
        <Notice>
          Connectez-vous à votre espace familial pour faire lire une photo par
          l’IA.
        </Notice>
      ) : job ? (
        <PhotoReview job={job} list={list} onAdd={onAdd} onClose={close} />
      ) : choosing || progress ? (
        <Notice>
          {choosing ? "Sélection et envoi de la photo…" : progress}
        </Notice>
      ) : serverAvailable ? (
        <>
          <AppText>
            Photographiez la page ou choisissez-la dans vos photos. Vous pourrez
            corriger les mots avant de les ajouter.
          </AppText>
          <View style={vocabularyStyles.row}>
            <Button icon="camera" onPress={() => void choose(true)}>
              Prendre une photo
            </Button>
            <Button
              icon="upload"
              variant="secondary"
              onPress={() => void choose(false)}
            >
              Choisir une photo
            </Button>
          </View>
        </>
      ) : (
        <Notice>
          Reconnectez-vous au serveur familial pour importer une photo.
        </Notice>
      )}
    </View>
  );
}
