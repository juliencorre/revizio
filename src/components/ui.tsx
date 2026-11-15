import React, {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type PressableStateCallbackType,
  type ScrollViewInstance,
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
import { usePathname, useRouter, type Href } from "expo-router";
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
export function estimateContentWidth(width: number, navigationWidth?: number) {
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
      width - (navigationWidth ?? navigation) - 2 * layout.gutter[windowClass],
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
  selected,
  expanded,
}: {
  children: ReactNode;
  onPress: () => void;
  icon?: IconName;
  variant?: "primary" | "secondary" | "ghost" | "orange" | "danger";
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityLabel?: string;
  selected?: boolean;
  expanded?: boolean;
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
      {...(selected === undefined ? {} : { "aria-pressed": selected })}
      {...(expanded === undefined ? {} : { "aria-expanded": expanded })}
      accessibilityState={{ disabled: !!disabled, selected, expanded }}
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
            (filled
              ? [neumorphic.coloredPressed, filledHover[variant]]
              : { backgroundColor: colors.surfaceInset }),
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
  dark = false,
  expanded,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  color?: string;
  testID?: string;
  dark?: boolean;
  expanded?: boolean;
}) {
  const { focusVisible: focused, onFocus, onBlur } = useFocusVisible();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ expanded }}
      aria-expanded={expanded}
      testID={testID}
      onPress={onPress}
      onFocus={onFocus}
      onBlur={onBlur}
      style={(state) => [
        styles.iconButton,
        dark && { backgroundColor: "transparent", borderColor: "transparent" },
        isHovered(state) &&
          (dark ? styles.drawerItemHover : styles.raisedHover),
        focused && (dark ? styles.focusRingDark : styles.focusRing),
        state.pressed && (dark ? styles.drawerItemHover : neumorphic.inset),
      ]}
    >
      <AppIcon name={icon} color={dark ? colors.onPrimary : color} />
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
/** A whole-card action with the same touch, pointer and keyboard feedback. */
export function ActionCard({
  children,
  onPress,
  accessibilityLabel,
  testID,
  style,
}: {
  children: ReactNode;
  onPress: () => void;
  accessibilityLabel: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { focusVisible, onFocus, onBlur } = useFocusVisible();
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
        style,
        isHovered(state) && !state.pressed && styles.actionCardHover,
        state.pressed && { backgroundColor: colors.surfaceInset },
        focusVisible && styles.focusRing,
      ]}
    >
      {children}
    </Pressable>
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
    muted: [colors.surfaceInset, colors.muted],
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
            style={{ fontWeight: "600" }}
          >
            {eyebrow}
          </AppText>
        )}
        <AppText variant="title">{title}</AppText>
        {description && (
          <AppText color={colors.muted} style={{ maxWidth: 680 }}>
            {description}
          </AppText>
        )}
      </View>
      {action && (
        <View style={{ flexShrink: 1, maxWidth: "100%" }}>{action}</View>
      )}
    </View>
  );
}

/* ----------------------------------------------------------------------- */
/* Material 3 navigation: bar, collapsed rail and expanded rail            */
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
  dark = true,
}: {
  item: Pick<NavigationItem, "label" | "icon" | "active">;
  onPress: () => void;
  dark?: boolean;
}) {
  const { focusVisible: focused, onFocus, onBlur } = useFocusVisible();
  const tint = dark
    ? item.active
      ? colors.primaryDark
      : colors.navigationMuted
    : item.active
      ? colors.primaryDark
      : colors.muted;
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
        isHovered(state) &&
          !item.active &&
          (dark ? styles.drawerItemHover : styles.raisedHover),
        (state.pressed || item.active) &&
          (dark ? styles.drawerItemActive : styles.indicatorActive),
        focused && (dark ? styles.focusRingDark : styles.focusRing),
      ]}
    >
      <AppIcon name={item.icon} color={tint} size={24} />
      <AppText
        color={tint}
        style={{
          fontSize: 16,
          lineHeight: 22,
          fontWeight: "600",
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
  dark = false,
}: {
  label: string;
  shortLabel?: string;
  icon: IconName;
  active?: boolean;
  onPress: () => void;
  testID?: string;
  stretch?: boolean;
  expanded?: boolean;
  dark?: boolean;
}) {
  const { focusVisible: focused, onFocus, onBlur } = useFocusVisible();
  const tint = dark
    ? active
      ? colors.onPrimary
      : colors.navigationMuted
    : active
      ? colors.primaryDark
      : colors.muted;
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
      style={[styles.stackedItem, stretch ? { flex: 1 } : { width: 80 }]}
    >
      {(state) => (
        <>
          <View
            style={[
              styles.indicator,
              isHovered(state) &&
                !active &&
                (dark ? styles.drawerItemHover : styles.indicatorHover),
              (active || state.pressed) &&
                (dark ? styles.indicatorActiveDark : styles.indicatorActive),
              focused && (dark ? styles.focusRingDark : styles.focusRing),
            ]}
          >
            <AppIcon
              name={icon}
              color={
                active
                  ? colors.primaryDark
                  : dark
                    ? colors.navigationMuted
                    : colors.muted
              }
              size={24}
            />
          </View>
          <AppText numberOfLines={2} color={tint} style={styles.navLabel}>
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
              dark={false}
              onPress={() => onNavigate(item)}
            />
          ))}
          <View style={styles.divider} />
          <DrawerItem
            item={{ label: "Changer de profil", icon: "users" }}
            dark={false}
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
/** The same leading rail stays mounted in both Material 3 configurations. */
function NavigationRail({
  role,
  items,
  expanded,
  onToggle,
  onNavigate,
  onSwitchProfile,
  subject,
  grade,
}: {
  role: "child" | "parent";
  items: NavigationItem[];
  expanded: boolean;
  onToggle: () => void;
  onNavigate: (item: NavigationItem) => void;
  onSwitchProfile: () => void;
  subject?: { title: string; color: string; icon: IconName };
  grade: string;
}) {
  return (
    <View
      role="navigation"
      aria-label="Navigation principale"
      style={[styles.rail, { width: expanded ? layout.drawer : layout.rail }]}
    >
      <View style={[styles.railHeader, !expanded && { alignItems: "center" }]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <IconButton
            icon="menu"
            dark
            expanded={expanded}
            label={expanded ? "Réduire le menu" : "Étendre le menu"}
            onPress={onToggle}
          />
          {expanded && (
            <AppText variant="heading" color={colors.onPrimary}>
              Révizo
            </AppText>
          )}
        </View>
        <AppText
          variant="small"
          color={role === "parent" ? "#FFD59E" : colors.navigationMuted}
          style={[styles.railRole, expanded && { paddingHorizontal: 14 }]}
        >
          {expanded
            ? role === "parent"
              ? "Espace parent"
              : "Mon espace de révision"
            : role === "parent"
              ? "Parent"
              : "Élève"}
        </AppText>
      </View>
      <ScrollView
        testID="navigation-scroll"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.railContent,
          !expanded && { alignItems: "center" },
        ]}
      >
        <View
          style={{
            gap: 4,
            alignSelf: "stretch",
            alignItems: expanded ? "stretch" : "center",
          }}
        >
          {items.map((item) =>
            expanded ? (
              <DrawerItem
                key={item.label}
                item={item}
                onPress={() => onNavigate(item)}
              />
            ) : (
              <StackedNavItem
                key={item.label}
                {...item}
                dark
                onPress={() => onNavigate(item)}
              />
            ),
          )}
        </View>
        {/* Context follows the destinations so it cannot shift their position. */}
        {expanded && subject && (
          <View style={[styles.subject, { backgroundColor: subject.color }]}>
            <AppIcon name={subject.icon} color={colors.onPrimary} size={28} />
            <AppText variant="label" color={colors.onPrimary}>
              {subject.title}
            </AppText>
            <AppText variant="small" color={colors.onPrimary}>
              {grade} · À ton rythme
            </AppText>
          </View>
        )}
      </ScrollView>
      <View style={[styles.railFooter, !expanded && { alignItems: "center" }]}>
        {expanded ? (
          <DrawerItem
            item={{ label: "Changer de profil", icon: "users" }}
            onPress={onSwitchProfile}
          />
        ) : (
          <StackedNavItem
            label="Changer de profil"
            shortLabel="Profils"
            icon="users"
            dark
            onPress={onSwitchProfile}
          />
        )}
      </View>
    </View>
  );
}

/** Route loading is confined to the page, leaving navigation usable. */
export function PageLoading() {
  return (
    <View
      role="status"
      accessibilityLiveRegion="polite"
      style={{
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        paddingVertical: 48,
      }}
    >
      <ActivityIndicator color={colors.primary} size="large" />
      <AppText color={colors.muted}>Chargement de la page…</AppText>
    </View>
  );
}
export function AppShell({
  children,
  role,
  navigation,
  subject,
  focus = false,
  footer,
  scrollRef,
  contentLoading = false,
  pageKey,
}: {
  children: ReactNode;
  role: "child" | "parent";
  navigation: NavigationItem[];
  subject?: { title: string; color: string; icon: IconName };
  /** Hides the phone navigation bar during a focused task (exercise). */
  focus?: boolean;
  /** Actions kept within thumb reach, under the page (bottom app bar). */
  footer?: ReactNode;
  /** Lets the page bring new content into view in the shell scroll. */
  scrollRef?: React.RefObject<ScrollViewInstance | null>;
  contentLoading?: boolean;
  pageKey: string;
}) {
  const { width } = useWindowDimensions();
  const windowClass = windowClassFor(width);
  const session = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [menuExpanded, setMenuExpanded] = useState<boolean | null>(null);
  const expanded = menuExpanded ?? windowClass === "expanded";
  const navigationWidth =
    windowClass === "compact" ? 0 : expanded ? layout.drawer : layout.rail;
  const layoutKey = `${width}:${navigationWidth}`;
  const [measured, setMeasured] = useState<{
    key: string;
    width: number;
  } | null>(null);
  const contentWidth =
    measured?.key === layoutKey
      ? measured.width
      : estimateContentWidth(width, navigationWidth);
  const ownScrollRef = useRef<ScrollViewInstance>(null);
  // Keep the host ref stable: RN Web does not reattach it when only its
  // forwarded ref changes. A page can acquire this existing viewport later.
  useLayoutEffect(() => {
    if (!scrollRef) return;
    scrollRef.current = ownScrollRef.current;
    return () => {
      scrollRef.current = null;
    };
  }, [scrollRef]);
  useLayoutEffect(() => {
    ownScrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [pageKey]);
  const gutter = layout.gutter[windowClass];
  const navigate = (item: NavigationItem) => {
    // A destination can be highlighted for a nested page (a subject's
    // courses): only skip the navigation when this exact page is shown.
    if (typeof item.href === "string" && item.href === pathname) return;
    router.push(item.href);
  };
  const switchProfile = () => router.replace("/");
  return (
    <View style={styles.shell}>
      {windowClass !== "compact" && (
        <NavigationRail
          role={role}
          items={navigation}
          expanded={expanded}
          onToggle={() => setMenuExpanded(!expanded)}
          onNavigate={navigate}
          onSwitchProfile={switchProfile}
          subject={subject}
          grade={session.childGrade}
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
        <View style={{ flex: 1, minHeight: 0 }}>
          <ScrollView
            ref={ownScrollRef}
            testID="page-scroll"
            aria-hidden={contentLoading}
            pointerEvents={contentLoading ? "none" : "auto"}
            style={{ flex: 1, opacity: contentLoading ? 0 : 1 }}
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
              aria-busy={contentLoading}
              onLayout={(event) => {
                const next = Math.floor(event.nativeEvent.layout.width);
                if (
                  next > 0 &&
                  (measured?.key !== layoutKey || next !== measured.width)
                )
                  setMeasured({ key: layoutKey, width: next });
              }}
              style={{
                width: "100%",
                maxWidth: layout.maxContent,
                alignSelf: "center",
                gap: layout.sectionGap[windowClass],
              }}
            >
              <ContentWidthContext.Provider value={contentWidth}>
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
          {contentLoading && (
            <View
              testID="app-loading"
              style={[
                StyleSheet.absoluteFill,
                { backgroundColor: colors.background },
              ]}
            >
              <PageLoading />
            </View>
          )}
        </View>
        {footer && !contentLoading && (
          <View style={styles.footerBar}>{footer}</View>
        )}
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
function BrandMark({
  size = 44,
  dark = false,
}: {
  size?: number;
  dark?: boolean;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: 14,
        backgroundColor: dark ? "rgba(255,255,255,0.12)" : colors.primaryLight,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <AppIcon
        name="book"
        color={dark ? "#FFFFFF" : colors.primary}
        size={Math.round(size * 0.62)}
      />
    </View>
  );
}
export function Brand({
  compact = false,
  dark = false,
}: {
  compact?: boolean;
  dark?: boolean;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <BrandMark dark={dark} size={compact ? 36 : 42} />
      <AppText
        variant={compact ? "heading" : "title"}
        color={dark ? "#FFFFFF" : colors.ink}
        style={compact ? { fontSize: 22, lineHeight: 28 } : undefined}
      >
        Révizo
      </AppText>
    </View>
  );
}
const textStyles = StyleSheet.create({
  hero: {
    fontSize: 44,
    lineHeight: 59,
    fontWeight: "800",
    letterSpacing: -1.5,
  },
  title: {
    fontSize: 32,
    lineHeight: 44,
    fontWeight: "800",
    letterSpacing: -0.8,
  },
  heading: {
    fontSize: 22,
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
  ghost: { backgroundColor: "transparent", borderColor: "transparent" },
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
    alignSelf: "flex-start",
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
    backgroundColor: colors.surfaceInset,
  },
  actionCardHover: {
    ...neumorphic.hover,
    borderColor: colors.primary,
  },
  focusRing: {
    outlineColor: colors.primary,
    outlineStyle: "solid",
    outlineWidth: 3,
    outlineOffset: 2,
  },
  focusRingDark: {
    outlineColor: colors.onPrimary,
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
  card: { ...neumorphic.raised, borderRadius: radius.lg, padding: 24 },
  cardCompact: {
    ...neumorphic.raisedCompact,
    borderRadius: 24,
    padding: 18,
  },
  cardMedium: { padding: 24 },
  emptyIcon: {
    backgroundColor: colors.primaryLight,
    width: 64,
    height: 64,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    backgroundColor: colors.primaryLight,
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  track: {
    backgroundColor: colors.primaryLight,
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
  subject: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    borderRadius: 26,
    padding: 22,
    gap: 12,
    marginTop: 10,
  },
  drawerItem: {
    minHeight: 56,
    borderRadius: 28,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: "transparent",
  },
  drawerItemHover: {
    backgroundColor: colors.navigationHover,
  },
  drawerItemActive: {
    backgroundColor: colors.primaryLight,
  },
  stackedItem: {
    minHeight: 64,
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
    backgroundColor: "rgba(96,69,217,0.10)",
  },
  indicatorActive: {
    backgroundColor: colors.primaryLight,
    borderColor: "rgba(96,69,217,0.10)",
  },
  indicatorActiveDark: {
    backgroundColor: colors.primaryLight,
  },
  navLabel: {
    fontSize: 14,
    lineHeight: 18,
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
    boxShadow: "0px -4px 16px rgba(32,42,108,0.07)",
    zIndex: 1,
  },
  footerBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
    backgroundColor: colors.surface,
    boxShadow: "0px -4px 16px rgba(32,42,108,0.07)",
    zIndex: 1,
  },
  rail: {
    backgroundColor: colors.navigation,
    zIndex: 1,
  },
  railHeader: {
    minHeight: 120,
    paddingTop: 20,
    paddingBottom: 12,
    paddingHorizontal: 12,
    gap: 12,
  },
  railContent: {
    flexGrow: 1,
    paddingHorizontal: 12,
    paddingBottom: 20,
    gap: 20,
  },
  railFooter: {
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.18)",
    paddingHorizontal: 12,
    paddingVertical: 16,
  },
  railRole: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
  },
  topBar: {
    minHeight: layout.topBar,
    paddingHorizontal: 16,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.surface,
    boxShadow: "0px 4px 12px rgba(32,42,108,0.06)",
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
