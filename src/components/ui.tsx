import React, { useState, type ReactNode } from "react";
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
  Settings,
  Download,
  Lock,
  LogOut,
  Cloud,
  Search,
  Save,
  Eye,
  RotateCw,
  EyeOff,
  Wifi,
  Headphones,
} from "lucide-react-native";
import { useRouter, type Href } from "expo-router";
import { colors, radius, fontFamily, neumorphic } from "@/theme";
import type { IconName } from "@/domain/model";
import { useSession } from "@/state/session";
const icons: Record<string, typeof Sparkles> = {
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
  settings: Settings,
  download: Download,
  lock: Lock,
  logout: LogOut,
  cloud: Cloud,
  search: Search,
  save: Save,
  eye: Eye,
  rotate: RotateCw,
  "eye-off": EyeOff,
  wifi: Wifi,
  headphones: Headphones,
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
  const [focused, setFocused] = useState(false);
  const filled = variant === "primary" || variant === "orange";
  const foreground = filled
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
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={({ pressed }) => [
        styles.button,
        buttonStyles[variant],
        focused && !disabled && neumorphic.focus,
        pressed &&
          !disabled &&
          (filled ? neumorphic.coloredPressed : neumorphic.inset),
        pressed && !disabled && { transform: [{ scale: 0.985 }] },
        disabled && { opacity: 0.48, boxShadow: neumorphic.inset.boxShadow },
        style,
      ]}
    >
      {icon && <AppIcon name={icon} color={foreground} size={21} />}
      <AppText
        variant="label"
        color={foreground}
        style={{ flexShrink: 1, textAlign: "center" }}
      >
        {children}
      </AppText>
    </Pressable>
  );
}
export function Card({
  children,
  style,
  testID,
  inset = false,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  inset?: boolean;
}) {
  return (
    <View
      testID={testID}
      style={[styles.card, inset && neumorphic.inset, style]}
    >
      {children}
    </View>
  );
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
      <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 260, gap: 8 }}>
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
function NavigationButton({
  item,
  onPress,
}: {
  item: NavigationItem;
  onPress: () => void;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!item.active }}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={({ pressed }) => [
        styles.navItem,
        item.active && styles.navSelected,
        (pressed || item.active) && neumorphic.inset,
        focused && neumorphic.focus,
      ]}
    >
      <AppIcon
        name={item.icon}
        color={item.active ? colors.primary : colors.muted}
      />
      <AppText
        color={item.active ? colors.primary : colors.muted}
        style={{ fontWeight: item.active ? "700" : "600", flex: 1 }}
      >
        {item.label}
      </AppText>
    </Pressable>
  );
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
  const session = useSession();
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
                {session.childGrade} · À ton rythme
              </AppText>
            </View>
          )}
          <View style={{ gap: 8, marginTop: 20 }}>
            {navigation.map((item) => (
              <NavigationButton
                key={item.label}
                item={item}
                onPress={() => router.push(item.href)}
              />
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
            style={{
              height: 84,
              maxHeight: 84,
              flexGrow: 0,
              flexShrink: 0,
              backgroundColor: colors.surface,
            }}
            contentContainerStyle={{
              paddingHorizontal: 20,
              gap: 14,
              paddingVertical: 12,
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
                {session.mode === "demo"
                  ? "Démonstration locale · Données enregistrées sur cet appareil"
                  : session.offline
                    ? "Hors connexion · Modifications conservées sur cet appareil"
                    : `Espace familial · ${session.childName}`}
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
          ...neumorphic.small,
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
    lineHeight: 59,
    fontWeight: "800",
    letterSpacing: -1.5,
  },
  title: {
    fontSize: 35,
    lineHeight: 44,
    fontWeight: "800",
    letterSpacing: -0.8,
  },
  heading: {
    fontSize: 23,
    lineHeight: 31,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  body: { fontSize: 17, lineHeight: 27 },
  small: { fontSize: 14, lineHeight: 21 },
  label: { fontSize: 16, lineHeight: 23, fontWeight: "700" },
});
const buttonStyles = StyleSheet.create({
  primary: {
    ...neumorphic.colored,
    backgroundColor: colors.primary,
    borderColor: "rgba(255,255,255,0.14)",
  },
  secondary: { ...neumorphic.small, backgroundColor: colors.surface },
  ghost: { ...neumorphic.small, backgroundColor: colors.surface },
  orange: {
    ...neumorphic.colored,
    backgroundColor: colors.orange,
    borderColor: "rgba(255,255,255,0.14)",
  },
  danger: { ...neumorphic.small, backgroundColor: colors.dangerLight },
});
const styles = StyleSheet.create({
  text: { color: colors.ink, fontFamily, flexShrink: 1 },
  button: {
    minHeight: 52,
    maxWidth: "100%",
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderWidth: 1,
    borderColor: "transparent",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  card: { ...neumorphic.raised, borderRadius: radius.lg, padding: 26 },
  badge: {
    ...neumorphic.inset,
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  track: {
    ...neumorphic.inset,
    height: 11,
    borderRadius: 9,
    overflow: "hidden",
    borderWidth: 0,
  },
  heading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 22,
    flexWrap: "wrap",
  },
  shell: { flex: 1, flexDirection: "row", backgroundColor: colors.background },
  sidebar: {
    width: 264,
    backgroundColor: colors.surface,
    padding: 24,
    gap: 16,
    boxShadow: "6px 0px 14px rgba(174,186,205,0.34)",
    zIndex: 1,
  },
  subject: {
    ...neumorphic.colored,
    borderRadius: 26,
    padding: 22,
    gap: 12,
    marginTop: 14,
  },
  navItem: {
    ...neumorphic.small,
    minHeight: 56,
    borderRadius: 17,
    padding: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 4,
  },
  navSelected: {
    backgroundColor: colors.primaryLight,
    borderColor: "rgba(81,76,207,0.18)",
  },
  page: { flexGrow: 1, paddingBottom: 36 },
  mobileHeader: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.surface,
    zIndex: 1,
  },
  demo: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 20,
  },
});
