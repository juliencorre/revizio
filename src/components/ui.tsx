import React, { type ReactNode } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
  type TextStyle,
} from "react-native";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarDays,
  Camera,
  ChartNoAxesCombined,
  Check,
  ChevronRight,
  Clock3,
  Cpu,
  FileText,
  FlaskConical,
  Globe,
  GraduationCap,
  House,
  Languages,
  Leaf,
  Lightbulb,
  Menu,
  Music,
  Palette,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  Users,
  Volume2,
  X,
  Calculator,
} from "lucide-react-native";
import { useRouter, type Href } from "expo-router";
import { colors, radius } from "@/theme";
import type { IconName } from "@/domain/model";
const icons = {
  sparkles: Sparkles,
  book: BookOpen,
  calculator: Calculator,
  globe: Globe,
  languages: Languages,
  leaf: Leaf,
  flask: FlaskConical,
  palette: Palette,
  music: Music,
  activity: Activity,
  cpu: Cpu,
  calendar: CalendarDays,
  camera: Camera,
  upload: Upload,
  check: Check,
  "arrow-right": ArrowRight,
  "arrow-left": ArrowLeft,
  play: Play,
  chart: ChartNoAxesCombined,
  file: FileText,
  pencil: Pencil,
  shield: ShieldCheck,
  plus: Plus,
  close: X,
  lightbulb: Lightbulb,
  volume: Volume2,
  clock: Clock3,
  home: House,
  users: Users,
  "chevron-right": ChevronRight,
  refresh: RefreshCw,
  menu: Menu,
  trash: Trash2,
};
export function AppIcon({
  name,
  size = 22,
  color = colors.primary,
}: {
  name: IconName;
  size?: number;
  color?: string;
}) {
  const Icon = icons[name] ?? GraduationCap;
  return <Icon size={size} color={color} strokeWidth={1.8} />;
}
export function AppText({
  children,
  variant = "body",
  color,
  style,
  ...props
}: {
  children: ReactNode;
  variant?: "hero" | "title" | "heading" | "body" | "small" | "label";
  color?: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  testID?: string;
}) {
  return (
    <Text
      {...props}
      accessibilityRole={
        ["hero", "title", "heading"].includes(variant) ? "header" : undefined
      }
      style={[
        styles.text,
        textStyles[variant],
        color ? { color } : undefined,
        style,
      ]}
    >
      {children}
    </Text>
  );
}
export function Button({
  children,
  onPress,
  icon,
  variant = "primary",
  disabled,
  style,
  testID,
  accessibilityLabel,
}: {
  children: ReactNode;
  onPress: () => void;
  icon?: IconName;
  variant?: "primary" | "secondary" | "ghost" | "orange" | "danger";
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityLabel?: string;
}) {
  const foreground =
    variant === "primary" || variant === "orange"
      ? "#FFFFFF"
      : variant === "danger"
        ? colors.danger
        : colors.primary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        buttonStyles[variant],
        disabled && { opacity: 0.42 },
        pressed && !disabled && { opacity: 0.8, transform: [{ scale: 0.99 }] },
        style,
      ]}
    >
      {icon && <AppIcon name={icon} color={foreground} size={20} />}
      <AppText variant="label" color={foreground}>
        {children}
      </AppText>
    </Pressable>
  );
}
export function Card({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}
export function Badge({
  children,
  tone = "primary",
}: {
  children: ReactNode;
  tone?: "primary" | "green" | "orange" | "muted";
}) {
  const tones = {
    primary: [colors.primaryLight, colors.primary],
    green: [colors.greenLight, colors.green],
    orange: [colors.orangeLight, colors.orange],
    muted: ["#ECEEF4", colors.muted],
  };
  return (
    <View style={[styles.badge, { backgroundColor: tones[tone][0] }]}>
      <AppText
        variant="small"
        color={tones[tone][1]}
        style={{ fontWeight: "700" }}
      >
        {children}
      </AppText>
    </View>
  );
}
export function EmptyState({
  icon = "book",
  title,
  description,
  children,
}: {
  icon?: IconName;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <Card style={{ alignItems: "center", padding: 36, gap: 14 }}>
      <AppIcon name={icon} size={36} />
      <AppText variant="heading" style={{ textAlign: "center" }}>
        {title}
      </AppText>
      <AppText
        color={colors.muted}
        style={{ textAlign: "center", maxWidth: 420 }}
      >
        {description}
      </AppText>
      {children}
    </Card>
  );
}
export function ProgressBar({
  value,
  color = colors.primary,
}: {
  value: number;
  color?: string;
}) {
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(value) }}
      style={styles.track}
    >
      <View
        style={{
          width: `${Math.min(100, Math.max(0, value))}%`,
          height: "100%",
          borderRadius: 8,
          backgroundColor: color,
        }}
      />
    </View>
  );
}
export function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <View style={styles.heading}>
      <View style={{ flex: 1, gap: 8 }}>
        {eyebrow && (
          <AppText
            variant="small"
            color={colors.primary}
            style={{ fontWeight: "700", letterSpacing: 1 }}
          >
            {eyebrow.toUpperCase()}
          </AppText>
        )}
        <AppText variant="title">{title}</AppText>
        {description && <AppText color={colors.muted}>{description}</AppText>}
      </View>
      {action}
    </View>
  );
}
export interface NavigationItem {
  label: string;
  href: Href;
  icon: IconName;
  active?: boolean;
}
export function AppShell({
  children,
  role,
  navigation,
  subject,
}: {
  children: ReactNode;
  role: "child" | "parent";
  navigation: NavigationItem[];
  subject?: { title: string; color: string; icon: IconName };
}) {
  const { width } = useWindowDimensions();
  const wide = width >= 1000;
  const router = useRouter();
  return (
    <View style={styles.shell}>
      {wide && (
        <View style={styles.sidebar}>
          <Brand />
          <AppText
            variant="small"
            color={role === "parent" ? colors.orange : colors.muted}
          >
            {role === "parent" ? "ESPACE PARENT" : "MON ESPACE DE RÉVISION"}
          </AppText>
          {subject && (
            <View style={[styles.subject, { backgroundColor: subject.color }]}>
              <AppIcon name={subject.icon} color="#FFFFFF" size={28} />
              <AppText variant="heading" color="#FFFFFF">
                {subject.title}
              </AppText>
              <AppText variant="small" color="#FFFFFF">
                5e · À ton rythme
              </AppText>
            </View>
          )}
          <View style={{ gap: 8, marginTop: 20 }}>
            {navigation.map((item) => (
              <Pressable
                key={item.label}
                accessibilityRole="button"
                onPress={() => router.push(item.href)}
                style={[
                  styles.navItem,
                  item.active && { backgroundColor: colors.primaryLight },
                ]}
              >
                <AppIcon
                  name={item.icon}
                  color={item.active ? colors.primary : colors.muted}
                />
                <AppText
                  color={item.active ? colors.primary : colors.muted}
                  style={{ fontWeight: item.active ? "700" : "500", flex: 1 }}
                >
                  {item.label}
                </AppText>
              </Pressable>
            ))}
          </View>
          <View style={{ flex: 1 }} />
          <Button
            variant="ghost"
            icon="users"
            onPress={() => router.replace("/")}
          >
            Changer de profil
          </Button>
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        {!wide && (
          <View style={styles.mobileHeader}>
            <Brand compact />
            <Button
              variant="ghost"
              icon="users"
              onPress={() => router.replace("/")}
            >
              Profils
            </Button>
          </View>
        )}
        {!wide && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ maxHeight: 66, backgroundColor: colors.surface }}
            contentContainerStyle={{
              paddingHorizontal: 16,
              gap: 8,
              paddingVertical: 8,
            }}
          >
            {navigation.map((item) => (
              <Button
                key={item.label}
                variant={item.active ? "primary" : "ghost"}
                icon={item.icon}
                onPress={() => router.push(item.href)}
              >
                {item.label}
              </Button>
            ))}
          </ScrollView>
        )}
        <ScrollView
          contentContainerStyle={[styles.page, { padding: wide ? 36 : 20 }]}
          keyboardShouldPersistTaps="handled"
        >
          <View
            style={{
              width: "100%",
              maxWidth: 1360,
              alignSelf: "center",
              gap: 26,
            }}
          >
            {children}
            <View style={styles.demo}>
              <View
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: colors.orange,
                }}
              />
              <AppText variant="small" color={colors.muted}>
                Démonstration locale · Données enregistrées sur cet appareil
              </AppText>
            </View>
          </View>
        </ScrollView>
      </View>
    </View>
  );
}
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <View
        style={{
          width: compact ? 34 : 42,
          height: compact ? 34 : 42,
          borderRadius: 14,
          backgroundColor: colors.primaryLight,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <AppIcon name="sparkles" size={compact ? 22 : 27} />
      </View>
      <AppText variant={compact ? "heading" : "title"}>Révizo</AppText>
    </View>
  );
}
const textStyles = StyleSheet.create({
  hero: {
    fontSize: 48,
    lineHeight: 57,
    fontWeight: "800",
    letterSpacing: -1.7,
  },
  title: { fontSize: 34, lineHeight: 42, fontWeight: "800", letterSpacing: -1 },
  heading: {
    fontSize: 22,
    lineHeight: 29,
    fontWeight: "700",
    letterSpacing: -0.4,
  },
  body: { fontSize: 16, lineHeight: 25 },
  small: { fontSize: 13, lineHeight: 20 },
  label: { fontSize: 15, lineHeight: 21, fontWeight: "700" },
});
const buttonStyles = StyleSheet.create({
  primary: { backgroundColor: colors.primary },
  secondary: { backgroundColor: colors.primaryLight },
  ghost: { backgroundColor: "transparent" },
  orange: { backgroundColor: colors.orange },
  danger: { backgroundColor: colors.dangerLight },
});
const styles = StyleSheet.create({
  text: { color: colors.ink },
  button: {
    minHeight: 48,
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 26,
    borderWidth: 1,
    borderColor: colors.border,
  },
  badge: {
    alignSelf: "flex-start",
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 20,
  },
  track: {
    height: 9,
    backgroundColor: "#E9EAF3",
    borderRadius: 8,
    overflow: "hidden",
  },
  heading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 20,
    flexWrap: "wrap",
  },
  shell: { flex: 1, flexDirection: "row", backgroundColor: colors.background },
  sidebar: {
    width: 264,
    backgroundColor: colors.surface,
    borderRightWidth: 1,
    borderColor: colors.border,
    padding: 24,
    gap: 14,
  },
  subject: { borderRadius: 22, padding: 22, gap: 12, marginTop: 14 },
  navItem: {
    minHeight: 52,
    borderRadius: 14,
    padding: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  page: { flexGrow: 1 },
  mobileHeader: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  demo: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
  },
});
