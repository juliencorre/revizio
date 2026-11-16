import type { AiJob } from "../domain/model";
import { apiFetch, waitForJob } from "./api";

interface PreparationOwner {
  profileId: string;
  check(): void;
}

/** The submitted profile owns the job throughout polling, including after navigation. */
export async function runPreparation(
  owner: PreparationOwner,
  kind: AiJob["kind"],
  input: Record<string, unknown>,
  onProgress?: (job: AiJob) => void,
  onQueued?: (job: AiJob) => void,
) {
  owner.check();
  const { job } = await apiFetch<{ job: AiJob }>("/ai/" + kind, {
    method: "POST",
    body: JSON.stringify({ ...input, profileId: owner.profileId }),
  });
  function check(update: AiJob) {
    owner.check();
    if (update.profileId && update.profileId !== owner.profileId)
      throw new Error("Cette préparation appartient à un autre enfant.");
  }
  check(job);
  onQueued?.(job);
  const result = await waitForJob(job.id, (update) => {
    check(update);
    onProgress?.(update);
  });
  check(result);
  return result;
}
