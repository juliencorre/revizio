import { useRef, useState, type ComponentRef } from "react";
import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import {
  AppIcon,
  AppText,
  Button,
  Card,
  PageHeading,
  useFocusVisible,
} from "@/components/ui";
import { maxSubjectNameLength } from "@/domain/subjects";
import type { Subject } from "@/domain/model";
import { useLearning } from "@/state/learning-store";
import { spacing, useTheme } from "@/theme";
import { Field, Notice, ParentLayout, useParentStyles } from "./shared";

function SubjectChoice({
  subject,
  checked,
  onPress,
}: {
  subject: Subject;
  checked: boolean;
  onPress: () => void;
}) {
  const { colors, subjectAccent, neumorphic } = useTheme();
  const styles = useParentStyles();
  const focus = useFocusVisible();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={subject.title}
      accessibilityState={{ checked }}
      aria-checked={checked}
      onPress={onPress}
      onFocus={focus.onFocus}
      onBlur={focus.onBlur}
      style={({ pressed }) => [
        styles.choice,
        { flexGrow: 1, flexBasis: 250 },
        checked && styles.selected,
        pressed && neumorphic.inset,
        focus.focusVisible && neumorphic.focus,
      ]}
    >
      <AppIcon name={subject.icon} color={subjectAccent(subject.color)} />
      <AppText variant="label" style={{ flex: 1 }}>
        {subject.title}
      </AppText>
      <View
        style={{
          width: 24,
          height: 24,
          borderWidth: 2,
          borderRadius: 6,
          alignItems: "center",
          justifyContent: "center",
          borderColor: checked ? colors.primary : colors.muted,
          backgroundColor: checked ? colors.primary : colors.surface,
        }}
      >
        {checked && <AppIcon name="check" size={18} color={colors.onPrimary} />}
      </View>
    </Pressable>
  );
}

function SubjectActions() {
  const { addSubject } = useLearning();
  const router = useRouter();
  const trigger = useRef<ComponentRef<typeof Pressable>>(null);
  const [name, setName] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [added, setAdded] = useState("");

  function close() {
    setName(null);
    setError("");
    requestAnimationFrame(() => trigger.current?.focus());
  }

  function submit() {
    if (!name?.trim()) return;
    try {
      addSubject(name);
      setAdded(name.trim());
      close();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Impossible d’ajouter cette matière.",
      );
    }
  }

  return (
    <View style={{ gap: spacing.sm }}>
      {name === null ? (
        <>
          <View style={actionRow}>
            <Button
              icon="check"
              onPress={() => router.replace("/parent/subjects")}
            >
              Terminer
            </Button>
            <Button
              ref={trigger}
              variant="ghost"
              icon="plus"
              onPress={() => {
                setAdded("");
                setName("");
              }}
            >
              Ajouter une matière
            </Button>
          </View>
          {!!added && (
            <Notice success>La matière « {added} » a été ajoutée.</Notice>
          )}
        </>
      ) : (
        <>
          <Field
            autoFocus
            label="Nom de la nouvelle matière"
            placeholder="Par exemple, Sciences et technologie"
            value={name}
            maxLength={maxSubjectNameLength}
            returnKeyType="done"
            onChangeText={(text) => {
              setName(text);
              setError("");
            }}
            onSubmitEditing={submit}
          />
          {!!error && <Notice error>{error}</Notice>}
          <View style={actionRow}>
            <Button onPress={submit} disabled={!name.trim()}>
              Ajouter
            </Button>
            <Button variant="ghost" onPress={close}>
              Annuler
            </Button>
          </View>
        </>
      )}
    </View>
  );
}

const actionRow = {
  flexDirection: "row",
  flexWrap: "wrap",
  alignItems: "center",
  gap: spacing.sm,
} as const;

export function SubjectSettings() {
  const data = useLearning();
  return (
    <ParentLayout active="subjects">
      <PageHeading
        title={`Matières de ${data.childName}`}
        description="Cochez les matières à afficher pour cet enfant. Vous pouvez réactiver une matière pour retrouver ses cours et ses résultats."
      />
      <Card style={{ gap: spacing.lg }}>
        <View
          style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.md }}
        >
          {data.allSubjects.map((subject) => {
            const checked = data.subjectVisibility?.[subject.id] !== false;
            return (
              <SubjectChoice
                key={subject.id}
                subject={subject}
                checked={checked}
                onPress={() => data.setSubjectVisible(subject.id, !checked)}
              />
            );
          })}
        </View>
        {data.storageError && <Notice error>{data.storageError}</Notice>}
        <SubjectActions key={data.activeProfileId} />
      </Card>
    </ParentLayout>
  );
}
