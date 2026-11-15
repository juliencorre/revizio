import { useEffect, useRef, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppIcon, AppText, IconButton, useFocusVisible } from "@/components/ui";
import { useLearning } from "@/state/learning-store";
import type { Subject } from "@/domain/model";
import { colors, radius, spacing } from "@/theme";
import { subjectHref } from "./subject-navigation";

export function SubjectSelector({ subject }: { subject: Subject }) {
  const router = useRouter();
  const { subjects } = useLearning();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const trigger = useRef<View>(null);
  const [anchor, setAnchor] = useState<{ left: number; bottom: number } | null>(
    null,
  );
  const { focusVisible, onFocus, onBlur } = useFocusVisible();
  useEffect(() => {
    setAnchor(null);
  }, [width, height, subject.id]);
  function open() {
    trigger.current?.measureInWindow((left, top, _width, triggerHeight) =>
      setAnchor({ left, bottom: top + triggerHeight }),
    );
  }
  const margin = spacing.md;
  const menuWidth = Math.min(
    292,
    width - insets.left - insets.right - margin * 2,
  );
  const menuHeight = Math.min(
    height - insets.top - insets.bottom - 2 * margin,
    390,
  );
  const left = Math.max(
    insets.left + margin,
    Math.min(anchor?.left ?? 0, width - insets.right - menuWidth - margin),
  );
  const top = Math.max(
    insets.top + margin,
    Math.min(
      (anchor?.bottom ?? 0) + 4,
      height - insets.bottom - menuHeight - margin,
    ),
  );
  return (
    <>
      <Pressable
        ref={trigger}
        testID="parent-subject-banner"
        accessibilityRole="button"
        accessibilityLabel={`Changer de matière : ${subject.title}`}
        accessibilityState={{ expanded: !!anchor }}
        onPress={open}
        onFocus={onFocus}
        onBlur={onBlur}
        style={({ pressed }) => [
          styles.trigger,
          focusVisible && styles.focus,
          pressed && styles.pressed,
        ]}
      >
        <AppIcon name={subject.icon} size={26} color={subject.color} />
        <AppText variant="title" style={styles.title}>
          {subject.title}
        </AppText>
        <AppIcon name="chevron-down" size={18} color={colors.ink} />
      </Pressable>
      <Modal
        visible={!!anchor}
        transparent
        animationType="none"
        onRequestClose={() => setAnchor(null)}
      >
        <View style={StyleSheet.absoluteFill} accessibilityViewIsModal>
          <Pressable
            accessible={false}
            importantForAccessibility="no"
            tabIndex={-1}
            style={StyleSheet.absoluteFill}
            onPress={() => setAnchor(null)}
          />
          <View
            role="dialog"
            aria-label="Choisir une matière"
            style={[
              styles.menu,
              { left, top, width: menuWidth, maxHeight: menuHeight },
            ]}
          >
            <View style={styles.menuTitle}>
              <AppText variant="label">Changer de matière</AppText>
              <IconButton
                icon="close"
                label="Fermer la liste"
                onPress={() => setAnchor(null)}
              />
            </View>
            <ScrollView keyboardShouldPersistTaps="handled">
              {subjects.map((item) => (
                <Pressable
                  key={item.id}
                  accessibilityRole="button"
                  accessibilityLabel={item.title}
                  accessibilityState={{ selected: item.id === subject.id }}
                  onPress={() => {
                    setAnchor(null);
                    if (item.id !== subject.id)
                      router.navigate(subjectHref(item.id));
                  }}
                  style={({ pressed }) => [
                    styles.option,
                    item.id === subject.id && styles.selected,
                    pressed && styles.pressed,
                  ]}
                >
                  <AppIcon name={item.icon} color={item.color} size={19} />
                  <AppText style={{ flex: 1 }}>{item.title}</AppText>
                  {item.id === subject.id && <AppIcon name="check" size={18} />}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}
const styles = StyleSheet.create({
  trigger: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    alignSelf: "flex-start",
    maxWidth: "100%",
    paddingHorizontal: 4,
    borderRadius: 6,
  },
  title: { fontSize: 30, lineHeight: 38, fontWeight: "600", flexShrink: 1 },
  focus: {
    outlineWidth: 2,
    outlineStyle: "solid",
    outlineColor: colors.primary,
  },
  pressed: { backgroundColor: colors.surfaceInset },
  selected: { backgroundColor: colors.primaryLight },
  menu: {
    position: "absolute",
    borderRadius: radius.sm,
    borderColor: colors.border,
    borderWidth: 1,
    padding: 6,
    backgroundColor: colors.surface,
    boxShadow: "0px 8px 28px rgba(22,27,69,0.14)",
  },
  menuTitle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingLeft: spacing.md,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 46,
    paddingHorizontal: spacing.md,
    gap: spacing.md,
    borderRadius: 6,
  },
});
