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
import { subjects } from "@/domain/fixtures";
import type { Subject } from "@/domain/model";
import { useLearning } from "@/state/learning-store";
import { spacing, useTheme } from "@/theme";
import { Notice, ParentLayout, useParentStyles } from "./shared";

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

export function SubjectSettings() {
  const data = useLearning();
  const router = useRouter();
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
          {subjects.map((subject) => {
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
        <Button
          icon="check"
          style={{ alignSelf: "flex-start" }}
          onPress={() => router.replace("/parent/subjects")}
        >
          Terminer
        </Button>
      </Card>
    </ParentLayout>
  );
}
