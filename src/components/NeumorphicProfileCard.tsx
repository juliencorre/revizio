import { useState } from "react";
import {
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { AppIcon, AppText } from "@/components/ui";
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
}) {
  const [focused, setFocused] = useState(false);
  const accent = tone === "orange" ? colors.orange : colors.primary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={({ pressed }) => [
        styles.card,
        focused && neumorphic.focus,
        pressed && neumorphic.inset,
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
