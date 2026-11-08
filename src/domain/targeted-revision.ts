import type { Attempt, ExerciseSeries, Question } from "./model";
import { expectedAnswerLabel } from "./answers";

export interface TargetedRevision {
  questions: Question[];
  latestAttemptIds: string[];
}
const normalized = (value: string) =>
  value.normalize("NFC").trim().replace(/\s+/g, " ");
function snapshotKey(question: Question): string {
  return JSON.stringify({
    prompt: normalized(question.prompt),
    type: question.type ?? "single-choice",
    choices: question.choices.map((choice) => normalized(choice.label)).sort(),
    answer: normalized(expectedAnswerLabel(question)),
    explanation: normalized(question.explanation),
    tolerance: question.tolerance,
  });
}
const completedTime = (attempt: Attempt) => Date.parse(attempt.completedAt!);

/** Select known errors from the latest completed attempt of each approved series.
 * Current series questions are never substituted for the questions actually shown.
 */
export function buildTargetedRevision(
  approvedSeries: ExerciseSeries[],
  attempts: Attempt[],
): TargetedRevision {
  const approved = new Set(
    approvedSeries
      .filter((series) => series.status === "published")
      .map((series) => series.id),
  );
  const latest = new Map<string, Attempt>();
  for (const attempt of attempts) {
    if (!attempt.completedAt || !approved.has(attempt.seriesId)) continue;
    const previous = latest.get(attempt.seriesId);
    if (
      !previous ||
      completedTime(attempt) > completedTime(previous) ||
      (completedTime(attempt) === completedTime(previous) &&
        attempt.startedAt > previous.startedAt)
    )
      latest.set(attempt.seriesId, attempt);
  }
  const sources = [...latest.values()].sort(
    (a, b) =>
      completedTime(b) - completedTime(a) ||
      b.startedAt.localeCompare(a.startedAt) ||
      a.id.localeCompare(b.id),
  );
  const seen = new Set<string>();
  const ids = new Set<string>();
  const questions: Question[] = [];
  for (const attempt of sources) {
    for (const question of attempt.questions) {
      const answer = attempt.answers.find(
        (answer) => answer.questionId === question.id,
      );
      if (answer?.isCorrect) continue;
      const key = snapshotKey(question);
      if (seen.has(key)) continue;
      seen.add(key);
      // Preserve the snapshot, allocating a fresh ID only if two historical
      // versions used the same ID for different questions.
      const copy = JSON.parse(JSON.stringify(question)) as Question;
      let suffix = 1;
      while (ids.has(copy.id))
        copy.id = `targeted-${questions.length + 1}-${suffix++}-${question.id}`;
      ids.add(copy.id);
      questions.push(copy);
    }
  }
  return { questions, latestAttemptIds: sources.map((attempt) => attempt.id) };
}
