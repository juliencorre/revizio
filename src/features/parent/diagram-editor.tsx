import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { AppText, Badge, Button, Card } from "@/components/ui";
import { LearningDiagram } from "@/components/learning-diagram";
import type { LearningDiagram as Diagram } from "@/domain/model";
import { colors } from "@/theme";
import { useLocalDraft } from "@/features/planning/use-local-draft";
import { Field, Notice, localId, parentStyles as s } from "./shared";

interface DiagramForm {
  base: string;
  type: Diagram["type"] | "none";
  min: string;
  max: string;
  numerator: string;
  denominator: string;
  points: { id: string; value: string; label: string }[];
}
interface DiagramEditorProps {
  value?: Diagram;
  storageKey: string;
  testID?: string;
  readOnly?: boolean;
  disabled?: boolean;
  onChange(value: Diagram | undefined): void;
  onPendingChange(pending: boolean): void;
}
const options = [
  { id: "none", label: "Aucun" },
  { id: "number-line", label: "Droite graduée" },
  { id: "fraction", label: "Fraction" },
  { id: "timeline", label: "Frise" },
] as const;
function signature(value?: Diagram) {
  if (!value) return "none";
  return JSON.stringify(
    value.type === "fraction"
      ? {
          type: value.type,
          numerator: value.numerator,
          denominator: value.denominator,
        }
      : {
          type: value.type,
          min: value.min ?? -5,
          max: value.max ?? 5,
          points: (value.points ?? []).map((point) => ({
            value: point.value,
            label: point.label,
          })),
        },
  );
}
function fromDiagram(value?: Diagram): DiagramForm {
  return {
    base: signature(value),
    type: value?.type ?? "none",
    min: String(value?.min ?? -5),
    max: String(value?.max ?? 5),
    numerator: String(value?.numerator ?? 1),
    denominator: String(value?.denominator ?? 4),
    points: (value?.points ?? []).map((point, index) => ({
      id: "point-" + index,
      value: String(point.value),
      label: point.label,
    })),
  };
}
function validForm(value: unknown): value is DiagramForm {
  if (!value || typeof value !== "object") return false;
  const form = value as DiagramForm;
  return (
    typeof form.base === "string" &&
    options.some((option) => option.id === form.type) &&
    [form.min, form.max, form.numerator, form.denominator].every(
      (field) => typeof field === "string",
    ) &&
    Array.isArray(form.points) &&
    form.points.length <= 12 &&
    form.points.every(
      (point) =>
        !!point &&
        typeof point.id === "string" &&
        typeof point.value === "string" &&
        typeof point.label === "string",
    )
  );
}
function number(value: string, label: string) {
  const text = value.trim().replace(/\s/g, "").replace(",", ".");
  if (
    !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text) ||
    !Number.isFinite(Number(text))
  )
    throw new Error(label + " doit être un nombre valide.");
  return Number(text);
}
function diagramFromForm(form: DiagramForm): Diagram | undefined {
  if (form.type === "none") return undefined;
  if (form.type === "fraction") {
    const numerator = number(form.numerator, "Le numérateur"),
      denominator = number(form.denominator, "Le dénominateur");
    if (!Number.isInteger(denominator) || denominator < 1 || denominator > 24)
      throw new Error("Le dénominateur doit être un entier de 1 à 24.");
    if (
      !Number.isInteger(numerator) ||
      numerator < 0 ||
      numerator > denominator
    )
      throw new Error(
        "Le numérateur doit être un entier compris entre 0 et le dénominateur.",
      );
    return { type: "fraction", numerator, denominator };
  }
  const min = number(form.min, "La borne de début"),
    max = number(form.max, "La borne de fin");
  if (Math.abs(min) > 1_000_000 || Math.abs(max) > 1_000_000)
    throw new Error(
      "Les bornes doivent rester entre −1 000 000 et +1 000 000.",
    );
  if (min >= max)
    throw new Error(
      "La borne de fin doit être plus grande que la borne de début.",
    );
  if (form.points.length > 12)
    throw new Error("Conservez au maximum 12 repères.");
  const points = form.points.map((point, index) => {
    const value = number(point.value, "La valeur du repère " + (index + 1));
    if (value < min || value > max)
      throw new Error(
        "Le repère " + (index + 1) + " doit rester entre les deux bornes.",
      );
    const label = point.label.trim();
    if (!label || label.length > 40)
      throw new Error(
        "Le libellé du repère " +
          (index + 1) +
          " doit contenir de 1 à 40 caractères.",
      );
    return { value, label };
  });
  return { type: form.type, min, max, points };
}
export function DiagramEditor(props: DiagramEditorProps) {
  if (props.readOnly)
    return props.value ? (
      <Card inset style={{ gap: 14 }} testID={props.testID}>
        <AppText variant="label">Schéma de la fiche</AppText>
        <LearningDiagram diagram={props.value} />
      </Card>
    ) : null;
  return <EditableDiagram {...props} />;
}
function EditableDiagram({
  value,
  storageKey,
  testID,
  disabled = false,
  onChange,
  onPendingChange,
}: DiagramEditorProps) {
  const [form, setForm, local] = useLocalDraft(
    storageKey,
    fromDiagram(value),
    validForm,
  );
  const [actionError, setActionError] = useState("");
  const notify = useRef(onPendingChange);
  notify.current = onPendingChange;
  let candidate: Diagram | undefined;
  let error = "";
  try {
    candidate = diagramFromForm(form);
  } catch (caught) {
    error =
      caught instanceof Error
        ? caught.message
        : "Vérifiez les valeurs du schéma.";
  }
  const pending = !!error || signature(candidate) !== signature(value);
  const base = signature(value);
  useEffect(() => {
    if (local.ready && form.base !== base) setForm(fromDiagram(value));
  }, [base, local.ready, form.base]);
  useEffect(() => {
    if (local.ready) notify.current(pending);
  }, [pending, local.ready]);
  useEffect(() => () => notify.current(false), []);
  function change(update: Partial<DiagramForm>) {
    setActionError("");
    const next = { ...form, ...update };
    setForm(next);
    let nextPending = true;
    try {
      nextPending = signature(diagramFromForm(next)) !== signature(value);
    } catch {}
    notify.current(nextPending);
  }
  function apply() {
    if (disabled) return;
    try {
      const next = diagramFromForm(form);
      onChange(next);
      setForm(fromDiagram(next));
      notify.current(false);
    } catch (cause) {
      setActionError(
        cause instanceof Error
          ? cause.message
          : "Le schéma n’a pas pu être appliqué. Réessayez sans fermer le brouillon.",
      );
    }
  }
  function reset() {
    setActionError("");
    setForm(fromDiagram(value));
    notify.current(false);
  }
  if (!local.ready)
    return (
      <Card inset>
        <AppText variant="small">Chargement du schéma…</AppText>
      </Card>
    );
  return (
    <Card inset style={{ gap: 18 }} testID={testID}>
      <View style={[s.row, { justifyContent: "space-between" }]}>
        <AppText variant="heading">Un schéma pour comprendre</AppText>
        <Badge tone="muted">Facultatif</Badge>
      </View>
      <AppText variant="small" color={colors.muted}>
        Ajoutez une représentation simple, puis appliquez-la au brouillon.
        Chaque modification sera à relire avant la publication.
      </AppText>
      <View style={s.row}>
        {options.map((option) => (
          <Button
            key={option.id}
            variant={form.type === option.id ? "primary" : "secondary"}
            onPress={() => change({ type: option.id })}
            disabled={disabled}
            accessibilityLabel={
              "Schéma : " +
              option.label +
              (form.type === option.id ? ", choisi" : "")
            }
            testID={"diagram-type-" + option.id}
          >
            {option.label}
          </Button>
        ))}
      </View>
      {form.type === "fraction" && (
        <>
          <View style={s.grid}>
            <View style={{ flex: 1, minWidth: 180 }}>
              <Field
                label="Numérateur"
                value={form.numerator}
                onChangeText={(numerator) => change({ numerator })}
                keyboardType="number-pad"
                maxLength={3}
                editable={!disabled}
                testID="diagram-numerator"
              />
            </View>
            <View style={{ flex: 1, minWidth: 180 }}>
              <Field
                label="Dénominateur"
                value={form.denominator}
                onChangeText={(denominator) => change({ denominator })}
                keyboardType="number-pad"
                maxLength={3}
                editable={!disabled}
                testID="diagram-denominator"
              />
            </View>
          </View>
          <AppText variant="small" color={colors.muted}>
            De 1 à 24 parts égales ; le numérateur indique combien de parts sont
            coloriées.
          </AppText>
        </>
      )}
      {(form.type === "number-line" || form.type === "timeline") && (
        <>
          <View style={s.grid}>
            <View style={{ flex: 1, minWidth: 180 }}>
              <Field
                label="Borne de début"
                value={form.min}
                onChangeText={(min) => change({ min })}
                keyboardType="numbers-and-punctuation"
                maxLength={20}
                editable={!disabled}
                testID="diagram-min"
              />
            </View>
            <View style={{ flex: 1, minWidth: 180 }}>
              <Field
                label="Borne de fin"
                value={form.max}
                onChangeText={(max) => change({ max })}
                keyboardType="numbers-and-punctuation"
                maxLength={20}
                editable={!disabled}
                testID="diagram-max"
              />
            </View>
          </View>
          <AppText variant="small" color={colors.muted}>
            Les nombres décimaux sont acceptés. Les valeurs restent entre −1 000
            000 et +1 000 000.
          </AppText>
          <View style={{ gap: 16 }}>
            {form.points.map((point, index) => (
              <View key={point.id} style={{ gap: 12 }}>
                <AppText variant="label">Repère {index + 1}</AppText>
                <View style={s.grid}>
                  <View style={{ flex: 1, minWidth: 140 }}>
                    <Field
                      label={"Valeur du repère " + (index + 1)}
                      value={point.value}
                      onChangeText={(newValue) =>
                        change({
                          points: form.points.map((item) =>
                            item.id === point.id
                              ? { ...item, value: newValue }
                              : item,
                          ),
                        })
                      }
                      keyboardType="numbers-and-punctuation"
                      maxLength={20}
                      editable={!disabled}
                      testID={"diagram-point-value-" + index}
                    />
                  </View>
                  <View style={{ flex: 2, minWidth: 180 }}>
                    <Field
                      label={"Libellé du repère " + (index + 1)}
                      value={point.label}
                      onChangeText={(label) =>
                        change({
                          points: form.points.map((item) =>
                            item.id === point.id ? { ...item, label } : item,
                          ),
                        })
                      }
                      maxLength={40}
                      editable={!disabled}
                      testID={"diagram-point-label-" + index}
                    />
                  </View>
                </View>
                <Button
                  variant="danger"
                  icon="trash"
                  disabled={disabled}
                  onPress={() =>
                    change({
                      points: form.points.filter(
                        (item) => item.id !== point.id,
                      ),
                    })
                  }
                  accessibilityLabel={"Retirer le repère " + (index + 1)}
                  testID={"diagram-point-remove-" + index}
                >
                  Retirer ce repère
                </Button>
              </View>
            ))}
          </View>
          <Button
            variant="secondary"
            icon="plus"
            disabled={disabled || form.points.length >= 12}
            onPress={() =>
              change({
                points: [
                  ...form.points,
                  { id: localId("diagram-point"), value: "0", label: "" },
                ],
              })
            }
            testID="diagram-add-point"
          >
            Ajouter un repère · {form.points.length} / 12
          </Button>
        </>
      )}
      {local.error && <Notice error>{local.error}</Notice>}
      {(error || actionError) && (
        <View testID="diagram-error">
          <Notice error>{error || actionError}</Notice>
        </View>
      )}
      {!error && candidate && (
        <View style={{ gap: 12 }} testID="diagram-preview">
          <AppText variant="label">Aperçu du schéma</AppText>
          <LearningDiagram diagram={candidate} />
        </View>
      )}
      {pending && (
        <AppText variant="small" color={colors.orange}>
          Ces modifications ne sont pas encore appliquées au cours.
        </AppText>
      )}
      {(pending || value) && (
        <View style={s.row}>
          <Button
            icon={form.type === "none" ? "trash" : "check"}
            variant={form.type === "none" ? "danger" : "primary"}
            disabled={disabled || !!error || !pending}
            onPress={apply}
            testID="diagram-apply"
          >
            {form.type === "none" ? "Retirer le schéma" : "Appliquer le schéma"}
          </Button>
          {pending && (
            <Button
              variant="ghost"
              disabled={disabled}
              onPress={reset}
              testID="diagram-cancel"
            >
              Annuler les modifications
            </Button>
          )}
          {!pending && (
            <AppText variant="small" color={colors.green}>
              Schéma enregistré dans le brouillon
            </AppText>
          )}
        </View>
      )}
    </Card>
  );
}
