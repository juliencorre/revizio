import {
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { AppIcon, AppText, useFocusVisible } from "@/components/ui";
import { colors, neumorphic } from "@/theme";
import type { IconName } from "@/domain/model";

export function NeumorphicProfileCard({
  title,
  subtitle,
  description,
  icon,
  tone = "primary",
  onPress,
  testID,
  accessibilityLabel,
  style,
  compact = false,
}: {
  title: string;
  subtitle: string;
  description: string;
  icon: IconName;
  tone?: "primary" | "orange";
  onPress: () => void;
  testID?: string;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  /** Horizontal list layout for phones. */
  compact?: boolean;
}) {
  const { focusVisible: focused, onFocus, onBlur } = useFocusVisible();
  const accent = tone === "orange" ? colors.orange : colors.primary;
  if (compact)
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        testID={testID}
        onPress={onPress}
        onFocus={onFocus}
        onBlur={onBlur}
        style={({ pressed }) => [
          styles.compactCard,
          focused && styles.focusRing,
          pressed && neumorphic.inset,
          style,
        ]}
      >
        <View style={[styles.compactAvatar, { backgroundColor: accent }]}>
          <AppIcon name={icon} size={30} color="#FFFFFF" />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="heading" style={{ fontSize: 22, lineHeight: 28 }}>
            {title}
          </AppText>
          <AppText variant="label" color={accent}>
            {subtitle}
          </AppText>
          <AppText variant="small" color={colors.muted}>
            {description}
          </AppText>
        </View>
        <AppIcon name="chevron-right" color={accent} size={26} />
      </Pressable>
    );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      onPress={onPress}
      onFocus={onFocus}
      onBlur={onBlur}
      style={(state) => [
        styles.card,
        (state as { hovered?: boolean }).hovered &&
          !state.pressed && { boxShadow: neumorphic.hover.boxShadow },
        focused && styles.focusRing,
        state.pressed && neumorphic.inset,
        style,
      ]}
    >
      <View style={[styles.avatar, { backgroundColor: accent }]}>
        <AppIcon name={icon} size={40} color="#FFFFFF" />
      </View>
      <View style={{ gap: 7, alignItems: "center" }}>
        <AppText
          variant="heading"
          style={{ fontSize: 30, lineHeight: 39, textAlign: "center" }}
        >
          {title}
        </AppText>
        <AppText variant="label" color={accent} style={{ textAlign: "center" }}>
          {subtitle}
        </AppText>
      </View>
      <AppText
        color={colors.muted}
        style={{ textAlign: "center", maxWidth: 330 }}
      >
        {description}
      </AppText>
      <View style={[styles.enter]}>
        <AppText variant="label" color={accent}>
          Entrer
        </AppText>
        <AppIcon name="chevron-right" color={accent} />
      </View>
    </Pressable>
  );
}
const styles = StyleSheet.create({
  focusRing: {
    outlineColor: colors.primary,
    outlineStyle: "solid",
    outlineWidth: 3,
    outlineOffset: 2,
  },
  compactCard: {
    ...neumorphic.raisedCompact,
    minHeight: 112,
    borderRadius: 26,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  compactAvatar: {
    ...neumorphic.colored,
    width: 60,
    height: 60,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    ...neumorphic.raised,
    minHeight: 350,
    borderRadius: 36,
    padding: 30,
    alignItems: "center",
    justifyContent: "center",
    gap: 24,
  },
  avatar: {
    ...neumorphic.colored,
    width: 86,
    height: 86,
    borderRadius: 31,
    alignItems: "center",
    justifyContent: "center",
  },
  enter: {
    ...neumorphic.small,
    minHeight: 50,
    borderRadius: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 25,
  },
});
