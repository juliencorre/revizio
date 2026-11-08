import type { Question } from "./model";

export function normalizeAnswer(value: string): string {
  return value
    .normalize("NFC")
    .replace(/[’‘]/g, "'")
    .replace(/[−–]/g, "-")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("fr-FR");
}

function numericAnswer(value: string): number | null {
  const normalized = normalizeAnswer(value)
    .replace(/\s/g, "")
    .replace(",", ".");
  if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(normalized))
    return Number(normalized);
  const fraction = normalized.match(/^([+-]?\d+)\/([+-]?\d+)$/);
  return fraction && Number(fraction[2]) !== 0
    ? Number(fraction[1]) / Number(fraction[2])
    : null;
}

export function evaluateAnswer(question: Question, response: string): boolean {
  if (
    !question.type ||
    question.type === "single-choice" ||
    question.type === "true-false"
  )
    return question.correctChoiceId === response;
  const normalized = normalizeAnswer(response);
  if (!normalized) return false;
  return (question.expectedAnswers ?? []).some((expected) => {
    if (normalizeAnswer(expected) === normalized) return true;
    const actualNumber = numericAnswer(response);
    const expectedNumber = numericAnswer(expected);
    return (
      actualNumber !== null &&
      expectedNumber !== null &&
      Number.isFinite(actualNumber) &&
      Number.isFinite(expectedNumber) &&
      Math.abs(actualNumber - expectedNumber) <=
        (question.tolerance ?? 1e-8) * Math.max(1, Math.abs(expectedNumber))
    );
  });
}

export function expectedAnswerLabel(question: Question): string {
  if (
    !question.type ||
    question.type === "single-choice" ||
    question.type === "true-false"
  )
    return (
      question.choices.find((choice) => choice.id === question.correctChoiceId)
        ?.label ?? ""
    );
  return question.expectedAnswers?.join(" / ") ?? "";
}
