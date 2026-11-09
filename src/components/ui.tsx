import React, {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type PressableStateCallbackType,
  type StyleProp,
  type ViewStyle,
  type TextStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
import {
  colors,
  radius,
  fontFamily,
  layout,
  neumorphic,
  windowClassFor,
  type WindowClass,
} from "@/theme";
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
/* ----------------------------------------------------------------------- */
/* Responsive foundations                                                  */
/* ----------------------------------------------------------------------- */

const WindowClassContext = createContext<WindowClass | null>(null);
const ContentWidthContext = createContext<number | null>(null);

/** Shares the Material window size class with every component. */
export function ResponsiveProvider({ children }: { children: ReactNode }) {
  const { width } = useWindowDimensions();
  return (
    <WindowClassContext.Provider value={windowClassFor(width)}>
      {children}
    </WindowClassContext.Provider>
  );
}
export function useWindowClass(): WindowClass {
  return useContext(WindowClassContext) ?? "expanded";
}
/** Width estimated before the page content has been measured. */
export function estimateContentWidth(width: number) {
  const windowClass = windowClassFor(width);
  const navigation =
    windowClass === "expanded"
      ? layout.drawer
      : windowClass === "medium"
        ? layout.rail
        : 0;
  return Math.max(
    240,
    Math.min(
      layout.maxContent,
      width - navigation - 2 * layout.gutter[windowClass],
    ),
  );
}
/** Width really available for the page content inside the shell. */
export function useContentWidth() {
  const measured = useContext(ContentWidthContext);
  const { width } = useWindowDimensions();
  return measured ?? estimateContentWidth(width);
}
/**
 * French typography: a non-breaking space before « ? ! : ; » keeps the
 * punctuation with its word when a title wraps on a narrow screen.
 */
export function frenchSpacing(text: string) {
  return text.replace(/ ([?!:;»])/g, "\u00A0$1").replace(/« /g, "«\u00A0");
}
/*
 * Focus ring only for keyboard navigation (like :focus-visible): a tap or a
 * click focuses the element on the web, but should not leave a ring behind.
 */
let keyboardModality = Platform.OS !== "web";
if (Platform.OS === "web" && typeof document !== "undefined") {
  document.addEventListener(
    "keydown",
    (event) => {
      if (!event.metaKey && !event.ctrlKey && !event.altKey)
        keyboardModality = true;
    },
    true,
  );
  document.addEventListener(
    "pointerdown",
    () => {
      keyboardModality = false;
    },
    true,
  );
}
export function useFocusVisible() {
  const [focusVisible, setFocusVisible] = useState(false);
  return {
    focusVisible,
    onFocus: () => setFocusVisible(keyboardModality),
    onBlur: () => setFocusVisible(false),
  };
}
/** Pressable state with the pointer hover exposed by react-native-web. */
function isHovered(state: PressableStateCallbackType) {
  return !!(state as PressableStateCallbackType & { hovered?: boolean })
    .hovered;
}

/* ----------------------------------------------------------------------- */
/* Base components                                                         */
/* ----------------------------------------------------------------------- */

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
  const windowClass = useWindowClass();
  return (
    <Text
      {...props}
      accessibilityRole={
        ["hero", "title", "heading"].includes(variant) ? "header" : undefined
      }
      style={[
        styles.text,
        textStyles[variant],
        windowClass === "compact" && compactText[variant],
        windowClass === "medium" && mediumText[variant],
        color ? { color } : undefined,
        style,
      ]}
    >
      {typeof children === "string"
        ? frenchSpacing(children)
        : React.Children.map(children, (child) =>
            typeof child === "string" ? frenchSpacing(child) : child,
          )}
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
  const { focusVisible: focused, onFocus, onBlur } = useFocusVisible();
  const compact = useWindowClass() === "compact";
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
      onFocus={onFocus}
      onBlur={onBlur}
      style={(state) => {
        const { pressed } = state;
        const hovered = isHovered(state) && !pressed && !disabled;
        return [
          styles.button,
          compact && styles.buttonCompact,
          buttonStyles[variant],
          hovered && (filled ? filledHover[variant] : styles.raisedHover),
          focused && !disabled && styles.focusRing,
          pressed &&
            !disabled &&
            (filled ? neumorphic.coloredPressed : neumorphic.inset),
          pressed && !disabled && { transform: [{ scale: 0.985 }] },
          disabled && { opacity: 0.48, boxShadow: neumorphic.inset.boxShadow },
          style,
        ];
      }}
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
/** Compact square action, with a 48 px touch target (Material icon button). */
export function IconButton({
  icon,
  label,
  onPress,
  color = colors.primary,
  testID,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  color?: string;
  testID?: string;
}) {
  const { focusVisible: focused, onFocus, onBlur } = useFocusVisible();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      onPress={onPress}
      onFocus={onFocus}
      onBlur={onBlur}
      style={(state) => [
        styles.iconButton,
        isHovered(state) && styles.raisedHover,
        focused && styles.focusRing,
        state.pressed && neumorphic.inset,
      ]}
    >
      <AppIcon name={icon} color={color} />
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
  const windowClass = useWindowClass();
  return (
    <View
      testID={testID}
      style={[
        styles.card,
        windowClass === "compact" && styles.cardCompact,
        windowClass === "medium" && styles.cardMedium,
        inset && neumorphic.inset,
        style,
      ]}
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
  const compact = useWindowClass() === "compact";
  return (
    <Card style={{ alignItems: "center", padding: compact ? 24 : 36, gap: 14 }}>
      <View style={styles.emptyIcon}>
        <AppIcon name={icon} size={30} />
      </View>
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
  const compact = useWindowClass() === "compact";
  return (
    <View style={[styles.heading, compact && { gap: 16 }]}>
      <View
        style={{
          flexGrow: 1,
          flexShrink: 1,
          flexBasis: compact ? "100%" : 260,
          gap: compact ? 6 : 8,
        }}
      >
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
      {action && (
        <View style={{ flexShrink: 1, maxWidth: "100%" }}>{action}</View>
      )}
    </View>
  );
}

/* ----------------------------------------------------------------------- */
/* Adaptive navigation: bar (phone), rail (tablet portrait), drawer        */
/* ----------------------------------------------------------------------- */

export interface NavigationItem {
  label: string;
  /** Short label shown under the icon in the navigation bar and rail. */
  shortLabel?: string;
  href: Href;
  icon: IconName;
  active?: boolean;
}
/**
 * react-native-web ignores accessibilityState: the current destination is
 * exposed with aria-current, which RN types do not declare yet.
 */
function currentPage(active?: boolean): object {
  return active ? { "aria-current": "page" } : {};
}
/** Material navigation bars stay readable with five destinations at most. */
const MAX_BAR_ITEMS = 5;

function DrawerItem({
  item,
  onPress,
}: {
  item: Pick<NavigationItem, "label" | "icon" | "active">;
  onPress: () => void;
}) {
  const { focusVisible: focused, onFocus, onBlur } = useFocusVisible();
  const tint = item.active ? colors.primary : colors.muted;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!item.active }}
      {...currentPage(item.active)}
      onPress={onPress}
      onFocus={onFocus}
      onBlur={onBlur}
      style={(state) => [
        styles.drawerItem,
        isHovered(state) && !item.active && styles.drawerItemHover,
        (state.pressed || item.active) && styles.drawerItemActive,
        focused && styles.focusRing,
      ]}
    >
      <AppIcon name={item.icon} color={tint} />
      <AppText
        color={item.active ? colors.primaryDark : colors.ink}
        style={{
          fontSize: 16,
          lineHeight: 22,
          fontWeight: item.active ? "700" : "600",
          flex: 1,
        }}
      >
        {item.label}
      </AppText>
    </Pressable>
  );
}
/** Icon in an active indicator with a short label underneath. */
function StackedNavItem({
  label,
  shortLabel,
  icon,
  active,
  onPress,
  testID,
  stretch,
  expanded,
}: {
  label: string;
  shortLabel?: string;
  icon: IconName;
  active?: boolean;
  onPress: () => void;
  testID?: string;
  stretch?: boolean;
  expanded?: boolean;
}) {
  const { focusVisible: focused, onFocus, onBlur } = useFocusVisible();
  const tint = active ? colors.primaryDark : colors.muted;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!active, expanded }}
      aria-expanded={expanded}
      {...currentPage(active)}
      testID={testID}
      onPress={onPress}
      onFocus={onFocus}
      onBlur={onBlur}
      style={[styles.stackedItem, stretch ? { flex: 1 } : { width: 84 }]}
    >
      {(state) => (
        <>
          <View
            style={[
              styles.indicator,
              isHovered(state) && !active && styles.indicatorHover,
              (active || state.pressed) && styles.indicatorActive,
              focused && styles.focusRing,
            ]}
          >
            <AppIcon
              name={icon}
              color={active ? colors.primary : colors.muted}
            />
          </View>
          <AppText
            numberOfLines={2}
            color={tint}
            style={[styles.navLabel, active && { fontWeight: "800" }]}
          >
            {shortLabel ?? label}
          </AppText>
        </>
      )}
    </Pressable>
  );
}
/** Modal bottom sheet listing the destinations that do not fit in the bar. */
function NavigationSheet({
  visible,
  items,
  onClose,
  onNavigate,
  onSwitchProfile,
}: {
  visible: boolean;
  items: NavigationItem[];
  onClose: () => void;
  onNavigate: (item: NavigationItem) => void;
  onSwitchProfile: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.sheetRoot}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Fermer le menu"
          onPress={onClose}
          style={styles.scrim}
        />
        <View
          role="dialog"
          aria-modal
          aria-label="Plus de rubriques"
          style={[styles.sheet, { paddingBottom: 20 + insets.bottom }]}
        >
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <AppText variant="label">Plus de rubriques</AppText>
            <IconButton icon="close" label="Fermer le menu" onPress={onClose} />
          </View>
          {items.map((item) => (
            <DrawerItem
              key={item.label}
              item={item}
              onPress={() => onNavigate(item)}
            />
          ))}
          <View style={styles.divider} />
          <DrawerItem
            item={{ label: "Changer de profil", icon: "users" }}
            onPress={onSwitchProfile}
          />
        </View>
      </View>
    </Modal>
  );
}
function NavigationBar({
  items,
  onNavigate,
  onSwitchProfile,
}: {
  items: NavigationItem[];
  onNavigate: (item: NavigationItem) => void;
  onSwitchProfile: () => void;
}) {
  const [open, setOpen] = useState(false);
  const overflowing = items.length > MAX_BAR_ITEMS;
  const primary = overflowing ? items.slice(0, MAX_BAR_ITEMS - 1) : items;
  const overflow = overflowing ? items.slice(MAX_BAR_ITEMS - 1) : [];
  return (
    <View
      role="navigation"
      aria-label="Navigation principale"
      style={styles.navigationBar}
    >
      {primary.map((item) => (
        <StackedNavItem
          key={item.label}
          {...item}
          stretch
          onPress={() => onNavigate(item)}
        />
      ))}
      {overflowing && (
        <StackedNavItem
          label="Plus de rubriques"
          shortLabel="Plus"
          icon="menu"
          stretch
          testID="navigation-more"
          active={overflow.some((item) => item.active)}
          expanded={open}
          onPress={() => setOpen(true)}
        />
      )}
      <NavigationSheet
        visible={open}
        items={overflow}
        onClose={() => setOpen(false)}
        onNavigate={(item) => {
          setOpen(false);
          onNavigate(item);
        }}
        onSwitchProfile={() => {
          setOpen(false);
          onSwitchProfile();
        }}
      />
    </View>
  );
}
function NavigationRail({
  role,
  items,
  onNavigate,
  onSwitchProfile,
}: {
  role: "child" | "parent";
  items: NavigationItem[];
  onNavigate: (item: NavigationItem) => void;
  onSwitchProfile: () => void;
}) {
  return (
    <View
      role="navigation"
      aria-label="Navigation principale"
      style={styles.rail}
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.railContent}
      >
        <BrandMark />
        <AppText
          variant="small"
          color={role === "parent" ? colors.orange : colors.primary}
          style={styles.railRole}
        >
          {role === "parent" ? "Parent" : "Élève"}
        </AppText>
        <View style={{ gap: 6, alignItems: "center" }}>
          {items.map((item) => (
            <StackedNavItem
              key={item.label}
              {...item}
              onPress={() => onNavigate(item)}
            />
          ))}
        </View>
        <View style={{ flex: 1, minHeight: 16 }} />
        <StackedNavItem
          label="Changer de profil"
          shortLabel="Profils"
          icon="users"
          onPress={onSwitchProfile}
        />
      </ScrollView>
    </View>
  );
}
export function AppShell({
  children,
  role,
  navigation,
  subject,
  focus = false,
}: {
  children: ReactNode;
  role: "child" | "parent";
  navigation: NavigationItem[];
  subject?: { title: string; color: string; icon: IconName };
  /** Hides the phone navigation bar during a focused task (exercise). */
  focus?: boolean;
}) {
  const { width } = useWindowDimensions();
  const windowClass = windowClassFor(width);
  const session = useSession();
  const router = useRouter();
  const [measured, setMeasured] = useState<number | null>(null);
  const gutter = layout.gutter[windowClass];
  const navigate = (item: NavigationItem) => {
    if (!item.active) router.push(item.href);
  };
  const switchProfile = () => router.replace("/");
  return (
    <View style={styles.shell}>
      {windowClass === "expanded" && (
        <View
          role="navigation"
          aria-label="Navigation principale"
          style={styles.sidebar}
        >
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.sidebarContent}
          >
            <Brand />
            <AppText
              variant="small"
              color={role === "parent" ? colors.orange : colors.muted}
              style={{ fontWeight: "700", letterSpacing: 1 }}
            >
              {role === "parent" ? "ESPACE PARENT" : "MON ESPACE DE RÉVISION"}
            </AppText>
            {subject && (
              <View
                style={[styles.subject, { backgroundColor: subject.color }]}
              >
                <AppIcon name={subject.icon} color="#FFFFFF" size={28} />
                <AppText variant="heading" color="#FFFFFF">
                  {subject.title}
                </AppText>
                <AppText variant="small" color="#FFFFFF">
                  {session.childGrade} · À ton rythme
                </AppText>
              </View>
            )}
            <View style={{ gap: 6, marginTop: 12 }}>
              {navigation.map((item) => (
                <DrawerItem
                  key={item.label}
                  item={item}
                  onPress={() => navigate(item)}
                />
              ))}
            </View>
            <View style={{ flex: 1, minHeight: 24 }} />
            <Button variant="ghost" icon="users" onPress={switchProfile}>
              Changer de profil
            </Button>
          </ScrollView>
        </View>
      )}
      {windowClass === "medium" && (
        <NavigationRail
          role={role}
          items={navigation}
          onNavigate={navigate}
          onSwitchProfile={switchProfile}
        />
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        {windowClass === "compact" && (
          <View style={styles.topBar}>
            <Brand compact />
            {role === "parent" && (
              <View style={{ alignSelf: "center" }}>
                <Badge tone="orange">Parent</Badge>
              </View>
            )}
            <View style={{ flex: 1 }} />
            <IconButton
              icon="users"
              label="Changer de profil"
              onPress={switchProfile}
            />
          </View>
        )}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[
            styles.page,
            {
              paddingHorizontal: gutter,
              paddingTop: windowClass === "compact" ? 12 : gutter,
            },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <View
            role="main"
            onLayout={(event) => {
              const next = Math.floor(event.nativeEvent.layout.width);
              if (next > 0 && next !== measured) setMeasured(next);
            }}
            style={{
              width: "100%",
              maxWidth: layout.maxContent,
              alignSelf: "center",
              gap: layout.sectionGap[windowClass],
            }}
          >
            <ContentWidthContext.Provider value={measured}>
              {children}
            </ContentWidthContext.Provider>
            <View style={styles.demo}>
              <View
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: colors.orange,
                }}
              />
              <AppText
                variant="small"
                color={colors.muted}
                style={{ textAlign: "center" }}
              >
                {session.mode === "demo"
                  ? "Démonstration locale · Données enregistrées sur cet appareil"
                  : session.offline
                    ? "Hors connexion · Modifications conservées sur cet appareil"
                    : `Espace familial · ${session.childName}`}
              </AppText>
            </View>
          </View>
        </ScrollView>
        {windowClass === "compact" && !focus && (
          <NavigationBar
            items={navigation}
            onNavigate={navigate}
            onSwitchProfile={switchProfile}
          />
        )}
      </View>
    </View>
  );
}
function BrandMark({ size = 44 }: { size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: 14,
        ...neumorphic.small,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <AppIcon name="sparkles" size={Math.round(size * 0.62)} />
    </View>
  );
}
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <BrandMark size={compact ? 36 : 42} />
      <AppText
        variant={compact ? "heading" : "title"}
        style={compact ? { fontSize: 22, lineHeight: 28 } : undefined}
      >
        Révizo
      </AppText>
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
/** Material type scale for phones: smaller display sizes, same body. */
const compactText: Partial<Record<keyof typeof textStyles, TextStyle>> = {
  hero: { fontSize: 34, lineHeight: 42, letterSpacing: -1 },
  title: { fontSize: 28, lineHeight: 35, letterSpacing: -0.6 },
  heading: { fontSize: 20, lineHeight: 27 },
  body: { fontSize: 16, lineHeight: 25 },
  label: { fontSize: 15, lineHeight: 22 },
};
const mediumText: Partial<Record<keyof typeof textStyles, TextStyle>> = {
  hero: { fontSize: 42, lineHeight: 52 },
  title: { fontSize: 32, lineHeight: 40 },
  heading: { fontSize: 22, lineHeight: 30 },
};
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
const filledHover: Partial<Record<keyof typeof buttonStyles, ViewStyle>> = {
  primary: { backgroundColor: colors.primaryDark },
  orange: { backgroundColor: "#8E3A09" },
};
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
  buttonCompact: {
    minHeight: 48,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 11,
    gap: 8,
  },
  raisedHover: {
    ...neumorphic.hover,
    backgroundColor: colors.surfaceRaised,
  },
  focusRing: {
    outlineColor: colors.primary,
    outlineStyle: "solid",
    outlineWidth: 3,
    outlineOffset: 2,
  },
  iconButton: {
    ...neumorphic.small,
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  card: { ...neumorphic.raised, borderRadius: radius.lg, padding: 26 },
  cardCompact: {
    ...neumorphic.raisedCompact,
    borderRadius: 24,
    padding: 18,
  },
  cardMedium: { borderRadius: 28, padding: 22 },
  emptyIcon: {
    ...neumorphic.inset,
    width: 64,
    height: 64,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
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
    width: layout.drawer,
    backgroundColor: colors.surface,
    boxShadow: "6px 0px 14px rgba(174,186,205,0.34)",
    zIndex: 1,
  },
  sidebarContent: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingVertical: 24,
    gap: 14,
  },
  subject: {
    ...neumorphic.colored,
    borderRadius: 26,
    padding: 22,
    gap: 12,
    marginTop: 10,
  },
  drawerItem: {
    minHeight: 52,
    borderRadius: 26,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: "transparent",
  },
  drawerItemHover: {
    ...neumorphic.small,
    backgroundColor: colors.surfaceRaised,
  },
  drawerItemActive: {
    ...neumorphic.inset,
    backgroundColor: colors.primaryLight,
    borderColor: "rgba(81,76,207,0.14)",
  },
  stackedItem: {
    minHeight: 60,
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 4,
    paddingVertical: 4,
  },
  indicator: {
    width: 56,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "transparent",
  },
  indicatorHover: {
    ...neumorphic.small,
    backgroundColor: colors.surfaceRaised,
  },
  indicatorActive: {
    ...neumorphic.inset,
    backgroundColor: colors.primaryLight,
    borderColor: "rgba(81,76,207,0.14)",
  },
  navLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
    textAlign: "center",
  },
  navigationBar: {
    minHeight: layout.navigationBar,
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 6,
    paddingTop: 10,
    paddingBottom: 8,
    backgroundColor: colors.surface,
    boxShadow: "0px -6px 16px rgba(174,186,205,0.38)",
    zIndex: 1,
  },
  rail: {
    width: layout.rail,
    backgroundColor: colors.surface,
    boxShadow: "6px 0px 14px rgba(174,186,205,0.34)",
    zIndex: 1,
  },
  railContent: {
    flexGrow: 1,
    alignItems: "center",
    paddingVertical: 20,
    gap: 10,
  },
  railRole: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  topBar: {
    minHeight: layout.topBar,
    paddingHorizontal: 16,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.surface,
    boxShadow: "0px 4px 12px rgba(174,186,205,0.3)",
    zIndex: 1,
  },
  sheetRoot: { flex: 1, justifyContent: "flex-end" },
  scrim: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(37,45,61,0.32)",
  },
  sheet: {
    ...neumorphic.raised,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 6,
    width: "100%",
    maxWidth: 640,
    alignSelf: "center",
  },
  sheetHandle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#AEB8CA",
    marginBottom: 4,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingLeft: 16,
    marginBottom: 4,
  },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 6 },
  page: { flexGrow: 1, paddingBottom: 28 },
  demo: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 20,
  },
});
