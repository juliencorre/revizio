import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, AppState, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import {
  AppIcon,
  AppText,
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeading,
} from "@/components/ui";
import { colors } from "@/theme";
import type { AiJob } from "@/domain/model";
import { useLearning } from "@/state/learning-store";
import { apiFetch } from "@/services/api";
import { Notice, ParentLayout, parentStyles as common } from "./shared";

export type PreparationJob = AiJob & {
  profileId?: string;
  input?: {
    title?: string;
    subjectId?: string;
    courseIds?: string[];
    existingCourseId?: string;
    level?: string;
    types?: string[];
    count?: number;
  };
};
const jobLabels: Record<AiJob["kind"], string> = {
  course: "Fiche de révision",
  exercises: "Série d’exercices",
  english: "Répertoire d’anglais",
};
const stateLabels: Record<AiJob["status"], string> = {
  queued: "En attente",
  running: "En préparation",
  succeeded: "À relire",
  failed: "À relancer",
};

/** Only the focused screen polls actual server jobs. Demo mode never fabricates jobs. */
export function usePreparationJobs(
  isDemo: boolean,
  profileId: string,
  serverAvailable: boolean,
) {
  const [jobs, setJobs] = useState<PreparationJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const active = useRef(false);
  const sequence = useRef(0);
  const request = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    if (isDemo || !profileId) {
      setJobs([]);
      setError("");
      setLoading(false);
      return;
    }
    if (
      !active.current ||
      request.current ||
      (AppState.currentState && AppState.currentState !== "active")
    )
      return;
    const own = ++sequence.current;
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    try {
      const result = await apiFetch<{ jobs: PreparationJob[] }>(
        "/jobs?profileId=" + encodeURIComponent(profileId),
        { signal: controller.signal },
      );
      if (!active.current || own !== sequence.current) return;
      setJobs(
        Array.isArray(result.jobs)
          ? result.jobs.filter(
              (job) => !job.profileId || job.profileId === profileId,
            )
          : [],
      );
      setUpdatedAt(new Date().toISOString());
      setError("");
    } catch (cause) {
      if (
        active.current &&
        own === sequence.current &&
        !controller.signal.aborted
      )
        setError(
          cause instanceof Error
            ? cause.message
            : "Les préparations ne peuvent pas être chargées. Réessayez quand la connexion est rétablie.",
        );
    } finally {
      if (request.current === controller) request.current = null;
      if (active.current && own === sequence.current) setLoading(false);
    }
  }, [isDemo, profileId]);
  useFocusEffect(
    useCallback(() => {
      active.current = true;
      setJobs([]);
      setUpdatedAt(null);
      void refresh();
      const timer = setInterval(() => void refresh(), 5000);
      const subscription = AppState.addEventListener("change", (state) => {
        if (state === "active") void refresh();
      });
      return () => {
        active.current = false;
        sequence.current++;
        request.current?.abort();
        request.current = null;
        clearInterval(timer);
        subscription.remove();
      };
    }, [refresh, serverAvailable]),
  );
  return { jobs, loading, error, updatedAt, refresh };
}

function JobSteps({ job }: { job: PreparationJob }) {
  const index =
    job.status === "succeeded"
      ? 2
      : job.stage === "lecture"
        ? 0
        : ["fiche", "exercices", "anglais"].includes(job.stage ?? "")
          ? 1
          : job.stage === "relecture"
            ? 2
            : -1;
  return (
    <View
      accessibilityLabel="Étapes de préparation"
      style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}
    >
      {["Lecture des sources", "Préparation", "Relecture parent"].map(
        (label, position) => (
          <View
            key={label}
            style={{
              flex: 1,
              minWidth: 140,
              minHeight: 46,
              padding: 12,
              borderRadius: 14,
              backgroundColor:
                position < index
                  ? colors.greenLight
                  : position === index
                    ? colors.primaryLight
                    : colors.background,
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
            }}
          >
            <AppIcon
              name={position < index ? "check" : "clock"}
              size={18}
              color={
                position < index
                  ? colors.green
                  : position === index
                    ? colors.primary
                    : colors.muted
              }
            />
            <AppText
              variant="small"
              color={
                position < index
                  ? colors.green
                  : position === index
                    ? colors.primary
                    : colors.muted
              }
              style={{ flex: 1 }}
            >
              {label}
            </AppText>
          </View>
        ),
      )}
    </View>
  );
}

export function ParentPreparationsScreen() {
  const data = useLearning();
  const router = useRouter();
  const state = usePreparationJobs(
    data.isDemo,
    data.activeProfileId,
    data.serverAvailable,
  );
  const [filter, setFilter] = useState<"all" | "active" | "review" | "failed">(
    "all",
  );
  const [actionError, setActionError] = useState("");
  const [retrying, setRetrying] = useState<string | null>(null);
  const pending = state.jobs.filter(
    (job) => job.status === "queued" || job.status === "running",
  );
  const ready = state.jobs.filter((job) => job.status === "succeeded");
  const failed = state.jobs.filter((job) => job.status === "failed");
  const visible = state.jobs
    .filter(
      (job) =>
        filter === "all" ||
        (filter === "active" &&
          (job.status === "queued" || job.status === "running")) ||
        (filter === "review" && job.status === "succeeded") ||
        (filter === "failed" && job.status === "failed"),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  async function retry(job: PreparationJob) {
    setRetrying(job.id);
    setActionError("");
    try {
      await apiFetch("/jobs/" + encodeURIComponent(job.id) + "/retry", {
        method: "POST",
      });
      await state.refresh();
    } catch (cause) {
      setActionError(
        cause instanceof Error
          ? cause.message
          : "Cette préparation n’a pas pu être relancée.",
      );
    } finally {
      setRetrying(null);
    }
  }
  function review(job: PreparationJob) {
    setActionError("");
    if (job.kind === "english") {
      router.push({ pathname: "/parent/english", params: { jobId: job.id } });
      return;
    }
    try {
      const id = data.adoptJob(job);
      if (!id) {
        setActionError(
          "Le résultat ne contient pas tous les éléments nécessaires à la relecture. Vos documents restent conservés ; vous pouvez préparer le contenu à la main.",
        );
        return;
      }
      if (job.kind === "course")
        router.push({ pathname: "/parent/review/[id]", params: { id } });
      else
        router.push({ pathname: "/parent/exercises", params: { draftId: id } });
    } catch (cause) {
      setActionError(
        cause instanceof Error
          ? cause.message
          : "Le brouillon n’a pas pu être ouvert.",
      );
    }
  }
  return (
    <ParentLayout active="preparations">
      <View testID="parent-preparations" style={{ gap: 26 }}>
        <PageHeading
          eyebrow="Du document au contenu vérifié"
          title="Mes préparations"
          description={
            "Retrouvez les lectures et les générations pour " +
            data.childName +
            "."
          }
          action={
            <Button
              variant="secondary"
              icon="refresh"
              disabled={state.loading || data.isDemo}
              onPress={() => void state.refresh()}
              testID="refresh-preparations"
            >
              Actualiser
            </Button>
          }
        />
        {data.isDemo ? (
          <EmptyState
            icon="sparkles"
            title="Les préparations IA nécessitent votre espace familial"
            description="La démonstration contient des cours d’exemple. Connectez votre famille pour importer vos documents et suivre de vraies préparations."
          >
            <Button
              icon="users"
              onPress={() =>
                router.push({ pathname: "/auth", params: { target: "parent" } })
              }
            >
              Créer ou ouvrir mon espace familial
            </Button>
            <Button
              icon="pencil"
              variant="secondary"
              onPress={() => router.push("/parent/exercises")}
            >
              Préparer un exercice à la main
            </Button>
          </EmptyState>
        ) : (
          <>
            {(state.error || actionError) && (
              <Notice error>{actionError || state.error}</Notice>
            )}
            <Notice>
              Les contenus terminés restent à relire. Aucun résultat de l’IA
              n’est publié automatiquement pour votre enfant.
            </Notice>
            <View style={common.row}>
              {(
                [
                  { id: "all", label: "Toutes", count: state.jobs.length },
                  { id: "active", label: "En cours", count: pending.length },
                  { id: "review", label: "À relire", count: ready.length },
                  { id: "failed", label: "À relancer", count: failed.length },
                ] as const
              ).map((item) => (
                <Button
                  key={item.id}
                  variant={filter === item.id ? "primary" : "secondary"}
                  onPress={() => setFilter(item.id)}
                  accessibilityLabel={
                    item.label + " : " + item.count + " préparations"
                  }
                >
                  {item.label} ({item.count})
                </Button>
              ))}
            </View>
            {state.loading && !state.jobs.length ? (
              <Card
                style={{ alignItems: "center", gap: 14, paddingVertical: 34 }}
              >
                <ActivityIndicator color={colors.primary} />
                <AppText color={colors.muted}>
                  On retrouve vos préparations…
                </AppText>
              </Card>
            ) : !visible.length ? (
              <EmptyState
                icon={filter === "failed" ? "check" : "file"}
                title={
                  state.error
                    ? "Les préparations sont momentanément indisponibles"
                    : state.jobs.length
                      ? "Aucune préparation dans cette catégorie"
                      : "Votre première préparation arrivera ici"
                }
                description={
                  state.error
                    ? "Vérifiez la connexion puis actualisez. Les traitements déjà lancés continuent sur le serveur."
                    : filter === "failed"
                      ? "Aucune préparation n’a besoin d’être relancée."
                      : "Ajoutez un cours ou préparez des exercices pour retrouver ici leur progression."
                }
              >
                <Button
                  icon="camera"
                  onPress={() => router.push("/parent/import")}
                >
                  Ajouter un cours
                </Button>
                <Button
                  variant="secondary"
                  icon="pencil"
                  onPress={() => router.push("/parent/exercises")}
                >
                  Préparer des exercices
                </Button>
              </EmptyState>
            ) : (
              visible.map((job) => {
                const course = data.courses.find(
                  (course) => course.generationJobId === job.id,
                );
                const series = data.series.find(
                  (series) => series.generationJobId === job.id,
                );
                const adopted = course ?? series;
                const title =
                  job.input?.title ||
                  job.result?.course?.title ||
                  adopted?.title ||
                  jobLabels[job.kind];
                return (
                  <Card key={job.id} style={{ gap: 18 }}>
                    <View testID={"job-" + job.id} style={{ gap: 18 }}>
                      <View
                        style={[
                          common.row,
                          { justifyContent: "space-between" },
                        ]}
                      >
                        <View style={{ flex: 1, minWidth: 190, gap: 7 }}>
                          <AppText
                            variant="small"
                            color={colors.primary}
                            style={{ fontWeight: "700" }}
                          >
                            {jobLabels[job.kind]}
                          </AppText>
                          <AppText variant="heading">{title}</AppText>
                          <AppText variant="small" color={colors.muted}>
                            {new Date(job.createdAt).toLocaleString("fr-FR", {
                              day: "numeric",
                              month: "long",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </AppText>
                        </View>
                        <Badge
                          tone={
                            job.status === "succeeded"
                              ? "green"
                              : job.status === "failed"
                                ? "orange"
                                : "primary"
                          }
                        >
                          {adopted
                            ? adopted.status === "published"
                              ? "Déjà publié"
                              : "Brouillon créé"
                            : stateLabels[job.status]}
                        </Badge>
                      </View>
                      <JobSteps job={job} />
                      <View
                        accessibilityLiveRegion="polite"
                        style={{
                          flexDirection: "row",
                          gap: 10,
                          alignItems: "center",
                        }}
                      >
                        {job.status === "running" && (
                          <ActivityIndicator color={colors.primary} />
                        )}
                        <AppText color={colors.muted} style={{ flex: 1 }}>
                          {job.message || stateLabels[job.status]}
                        </AppText>
                      </View>
                      {job.status === "failed" && (
                        <>
                          <Notice error>
                            {job.error ||
                              "Cette préparation n’a pas abouti. Les documents importés sont conservés."}
                          </Notice>
                          <View style={common.row}>
                            <Button
                              icon="refresh"
                              disabled={retrying === job.id}
                              onPress={() => void retry(job)}
                              testID={"retry-job-" + job.id}
                            >
                              {retrying === job.id
                                ? "Relance en cours…"
                                : "Réessayer la préparation"}
                            </Button>
                            <Button
                              variant="ghost"
                              icon="users"
                              onPress={() => router.push("/parent/settings")}
                            >
                              Vérifier les réglages IA
                            </Button>
                          </View>
                        </>
                      )}
                      {job.status === "succeeded" && (
                        <View style={common.row}>
                          <Button
                            icon="pencil"
                            onPress={() => review(job)}
                            testID={"review-job-" + job.id}
                          >
                            {adopted
                              ? adopted.status === "published"
                                ? "Consulter le contenu"
                                : "Reprendre la relecture"
                              : job.kind === "english"
                                ? "Relire la liste"
                                : "Ouvrir le brouillon à relire"}
                          </Button>
                          <AppText variant="small" color={colors.muted}>
                            {adopted?.status === "published"
                              ? "La version partagée reste disponible à l’enfant."
                              : "La publication demandera votre validation."}
                          </AppText>
                        </View>
                      )}
                      {(job.status === "queued" ||
                        job.status === "running") && (
                        <AppText variant="small" color={colors.muted}>
                          Vous pouvez quitter cette page. La préparation
                          continue et vous la retrouverez ici.
                        </AppText>
                      )}
                    </View>
                  </Card>
                );
              })
            )}
            {state.updatedAt && (
              <AppText variant="small" color={colors.muted}>
                Dernière actualisation :{" "}
                {new Date(state.updatedAt).toLocaleTimeString("fr-FR", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </AppText>
            )}
          </>
        )}
      </View>
    </ParentLayout>
  );
}
