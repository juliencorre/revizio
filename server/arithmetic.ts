/** A deliberately small arithmetic parser. Model output is never executed. */
export function calculate(raw: string): number | null {
  const input = raw.replace(/[−–]/g, "-").replace(/[×·]/g, "*").replace(/÷/g, "/").replace(/,/g, ".").replace(/\s+/g, "");
  if (!input || input.length > 300 || /[^\d.+*/()\-]/.test(input)) return null;
  const tokens = input.match(/\d+(?:\.\d+)?|\.\d+|[()+*/-]/g) ?? [];
  if (tokens.join("") !== input || tokens.length > 150) return null;
  let index = 0, depth = 0;
  function atom(): number {
    if (++depth > 30) throw new Error("depth");
    const token = tokens[index++];
    let value: number;
    if (token === "+" || token === "-") value = (token === "-" ? -1 : 1) * atom();
    else if (token === "(") { value = sum(); if (tokens[index++] !== ")") throw new Error("parenthesis"); }
    else { if (!token || !/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(token)) throw new Error("number"); value = Number(token); }
    depth--; return value;
  }
  function product(): number { let value = atom(); while (tokens[index] === "*" || tokens[index] === "/") { const op = tokens[index++], right = atom(); if (op === "/" && right === 0) throw new Error("zero"); value = op === "*" ? value * right : value / right; } return value; }
  function sum(): number { let value = product(); while (tokens[index] === "+" || tokens[index] === "-") { const op = tokens[index++], right = product(); value = op === "+" ? value + right : value - right; } return value; }
  try { const value = sum(); return index === tokens.length && Number.isFinite(value) && Math.abs(value) <= 1e15 ? value : null; } catch { return null; }
}
export function numericKey(value: string): string {
  const parsed = calculate(value);
  return parsed === null ? value.trim().toLocaleLowerCase("fr").normalize("NFKC") : `number:${Number(parsed.toPrecision(12))}`;
}
/** Only an explicit, unambiguous numerical expression is eligible for a check. */
export function promptCalculation(prompt: string): { expression: string; value: number } | null {
  const content = prompt.replace(/=\s*(?:_+|\.{2,}|\?)/g, "").replace(/\((?:page|source)\b[^)]*\)/gi, "").replace(/[.,](?!\d)/g, "|");
  if (/[=<>≤≥]/.test(content)) return null;
  const candidates = [...content.replace(/\*\*/g, "").matchAll(/[\d()+\-−–×÷*/.,\s]+/g)]
    .map((match) => match[0].trim().replace(/[.,]+$/, ""))
    .filter((candidate) => /\d\s*\)?\s*[+\-−–×÷*/]\s*\(?\s*[+\-−–]?\s*\d/.test(candidate))
    .map((expression) => ({ expression, value: calculate(expression) }))
    .filter((candidate): candidate is { expression: string; value: number } => candidate.value !== null);
  return candidates.length === 1 ? candidates[0] : null;
}
export function requestedCalculation(prompt: string): ReturnType<typeof promptCalculation> {
  const instruction = prompt.split(/\n|\bindice\b/i)[0];
  return /calcule|calculer|combien vaut|résultat|valeur de|résous|résoudre|effectue|évalue/i.test(instruction) && !/oppos[ée]|inverse|signe|distance/i.test(instruction) ? promptCalculation(prompt) : null;
}
