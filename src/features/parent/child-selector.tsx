import { useEffect, useRef, useState, type ComponentRef } from "react";
import { usePathname } from "expo-router";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type ViewProps,
} from "react-native";
import { AppIcon, AppText, useFocusVisible } from "@/components/ui";
import { useSession } from "@/state/session";
import type { ChildProfile } from "@/domain/model";
import { colors, radius, spacing } from "@/theme";

type Anchor = { x: number; y: number; width: number; height: number };
type MenuKey = Parameters<NonNullable<ViewProps["onKeyDown"]>>[0];
const avatarColors = [
  { background: colors.primary, ink: colors.onPrimary },
  { background: colors.welcomeInk, ink: colors.onPrimary },
];

function ChildAvatar({ name, index }: { name: string; index: number }) {
  const palette = avatarColors[Math.max(0, index) % avatarColors.length];
  return (
    <View
      accessible={false}
      style={[styles.avatar, { backgroundColor: palette.background }]}
    >
      <AppText
        color={palette.ink}
        style={{ fontSize: 16, lineHeight: 22, fontWeight: "700" }}
      >
        {Array.from(name.trim())[0]?.toLocaleUpperCase("fr") ?? "?"}
      </AppText>
    </View>
  );
}

function ChildOption({
  profile,
  index,
  selected,
  onFocus,
  onPress,
  optionRef,
}: {
  profile: ChildProfile;
  index: number;
  selected: boolean;
  onFocus: () => void;
  onPress: () => void;
  optionRef: (node: ComponentRef<typeof View> | null) => void;
}) {
  const focus = useFocusVisible();
  return (
    <Pressable
      ref={optionRef}
      focusable
      testID={`parent-child-option-${profile.id}`}
      accessibilityRole="menuitemradio"
      accessibilityLabel={profile.name}
      accessibilityState={{ checked: selected }}
      aria-checked={selected}
      onFocus={() => {
        focus.onFocus();
        onFocus();
      }}
      onBlur={focus.onBlur}
      onPress={onPress}
      style={({ pressed, ...state }) => [
        styles.option,
        selected && styles.selected,
        ((state as { hovered?: boolean }).hovered || pressed) &&
          styles.optionHover,
        focus.focusVisible && styles.focus,
      ]}
    >
      <ChildAvatar name={profile.name} index={index} />
      <AppText
        variant="label"
        numberOfLines={2}
        style={{ flex: 1 }}
        color={selected ? colors.primaryDark : colors.ink}
      >
        {profile.name}
      </AppText>
      <View style={{ width: 24, alignItems: "center" }}>
        {selected && (
          <AppIcon name="check" size={22} color={colors.primaryDark} />
        )}
      </View>
    </Pressable>
  );
}

/** A compact, anchored choice of the child whose workspace the parent sees. */
export function ParentChildSelector() {
  const session = useSession();
  const pathname = usePathname();
  const { width, height } = useWindowDimensions();
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const trigger = useRef<ComponentRef<typeof View>>(null);
  const options = useRef<(ComponentRef<typeof View> | null)[]>([]);
  const focus = useFocusVisible();
  const selectedIndex = session.profiles.findIndex(
    (profile) => profile.id === session.activeProfileId,
  );
  const canChoose = session.profiles.length > 1;
  const open = anchor !== null;

  // A menu never survives a route change, a rotation or a profile refresh.
  useEffect(() => {
    setAnchor(null);
  }, [pathname, width, height, session.activeProfileId]);

  function close() {
    setAnchor(null);
    requestAnimationFrame(() => trigger.current?.focus());
  }
  function focusOption(index: number) {
    const next = (index + session.profiles.length) % session.profiles.length;
    setFocusedIndex(next);
    options.current[next]?.focus();
  }
  function show() {
    if (!canChoose) return;
    trigger.current?.measureInWindow((x, y, width, height) => {
      setFocusedIndex(Math.max(0, selectedIndex));
      setAnchor({ x, y, width, height });
    });
  }
  function onKeyDown(event: MenuKey) {
    const key = event.nativeEvent.key;
    if (key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(key)) {
      event.preventDefault();
      focusOption(
        key === "Home"
          ? 0
          : key === "End"
            ? session.profiles.length - 1
            : focusedIndex + (key === "ArrowDown" ? 1 : -1),
      );
    }
  }
  const menuWidth = Math.min(280, width - 2 * spacing.lg);
  const desiredHeight = session.profiles.length * 64 + spacing.sm + 2;
  const spaceBelow =
    height - (anchor ? anchor.y + anchor.height : 0) - spacing.lg - spacing.sm;
  const above = !!anchor && spaceBelow < desiredHeight && anchor.y > spaceBelow;
  const menuHeight = Math.min(
    desiredHeight,
    Math.max(60, above ? anchor.y - spacing.lg - spacing.sm : spaceBelow),
  );
  const left = anchor
    ? Math.max(
        spacing.lg,
        Math.min(
          anchor.x + anchor.width - menuWidth,
          width - menuWidth - spacing.lg,
        ),
      )
    : spacing.lg;
  const top = anchor
    ? above
      ? anchor.y - menuHeight - spacing.sm
      : anchor.y + anchor.height + spacing.sm
    : 0;

  return (
    <>
      <Pressable
        ref={trigger}
        testID="parent-child-trigger"
        accessibilityRole="button"
        accessibilityLabel={`Choisir l’enfant accompagné, ${session.childName} sélectionné`}
        accessibilityHint={
          canChoose
            ? "Ouvre la liste des enfants"
            : "Un seul enfant dans cet espace"
        }
        accessibilityState={{ expanded: open, disabled: !canChoose }}
        aria-expanded={open}
        aria-haspopup="menu"
        disabled={!canChoose}
        onPress={open ? close : show}
        onFocus={focus.onFocus}
        onBlur={focus.onBlur}
        style={({ pressed, ...state }) => [
          styles.trigger,
          ((state as { hovered?: boolean }).hovered || pressed || open) &&
            styles.triggerActive,
          focus.focusVisible && styles.focus,
        ]}
      >
        <ChildAvatar name={session.childName} index={selectedIndex} />
        <AppText variant="label" numberOfLines={1} style={{ flexShrink: 1 }}>
          {session.childName}
        </AppText>
        {canChoose && (
          <View style={{ transform: [{ rotate: open ? "270deg" : "90deg" }] }}>
            <AppIcon name="chevron-right" size={20} color={colors.muted} />
          </View>
        )}
      </Pressable>
      <Modal
        visible={open}
        transparent
        animationType="none"
        onRequestClose={close}
        onShow={() => focusOption(Math.max(0, selectedIndex))}
      >
        <View style={styles.overlay}>
          <Pressable
            accessible={false}
            focusable={false}
            onPress={close}
            style={StyleSheet.absoluteFill}
          />
          <View
            role="menu"
            aria-label="Enfant accompagné"
            testID="parent-child-menu"
            onKeyDown={onKeyDown}
            style={[
              styles.menu,
              { width: menuWidth, maxHeight: menuHeight, left, top },
            ]}
          >
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ padding: spacing.xs }}
            >
              {session.profiles.map((profile, index) => (
                <ChildOption
                  key={profile.id}
                  profile={profile}
                  index={index}
                  selected={profile.id === session.activeProfileId}
                  optionRef={(node) => {
                    options.current[index] = node;
                  }}
                  onFocus={() => setFocusedIndex(index)}
                  onPress={() => {
                    close();
                    if (profile.id !== session.activeProfileId)
                      session.selectProfile(profile.id);
                  }}
                />
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
    maxWidth: "100%",
    flexShrink: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
  },
  triggerActive: { backgroundColor: colors.surfaceInset },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  overlay: { flex: 1 },
  menu: {
    position: "absolute",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    boxShadow: "0px 12px 32px rgba(22,27,69,0.16)",
  },
  option: {
    minHeight: 60,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
  },
  selected: { backgroundColor: colors.primaryLight },
  optionHover: { backgroundColor: colors.surfaceInset },
  focus: {
    outlineColor: colors.primary,
    outlineStyle: "solid",
    outlineWidth: 2,
    outlineOffset: -2,
  },
});
