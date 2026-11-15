import { View, type StyleProp, type ViewStyle } from "react-native";
import { ActionCard, AppIcon, AppText } from "@/components/ui";
import { createThemedStyles, useTheme, radius, spacing } from "@/theme";
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
  tone?: "primary" | "neutral";
  onPress: () => void;
  testID?: string;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const accent = tone === "neutral" ? colors.muted : colors.primary;
  const tint = tone === "neutral" ? colors.surfaceInset : colors.primaryLight;
  return (
    <ActionCard
      accessibilityLabel={
        accessibilityLabel ?? `Entrer dans l’espace de ${title}`
      }
      testID={testID}
      onPress={onPress}
      style={[styles.card, compact && styles.compactCard, style]}
    >
      <View style={[styles.avatar, { backgroundColor: tint }]}>
        <AppIcon name={icon} size={compact ? 26 : 32} color={accent} />
      </View>
      <View style={[styles.content, compact && { flex: 1 }]}>
        <AppText
          variant="title"
          style={compact ? styles.compactTitle : undefined}
        >
          {title}
        </AppText>
        <AppText variant="label" color={accent}>
          {subtitle}
        </AppText>
        <AppText color={colors.muted} style={styles.description}>
          {description}
        </AppText>
      </View>
      {compact ? (
        <AppIcon name="arrow-right" color={colors.primary} />
      ) : (
        <View style={styles.enter}>
          <AppText variant="label" color={colors.primary}>
            Entrer dans mon espace
          </AppText>
          <AppIcon name="arrow-right" color={colors.primary} />
        </View>
      )}
    </ActionCard>
  );
}
const useStyles = createThemedStyles(({ colors }) => ({
  card: {
    minHeight: 316,
    borderRadius: radius.lg,
    padding: spacing.xxl,
    alignItems: "flex-start",
    gap: spacing.xl,
  },
  compactCard: {
    minHeight: 144,
    padding: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  content: { gap: spacing.xs, flexGrow: 1, minWidth: 0 },
  compactTitle: { fontSize: 24, lineHeight: 32 },
  description: { marginTop: spacing.sm, maxWidth: 360 },
  enter: {
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.lg,
    minHeight: 44,
  },
}));
