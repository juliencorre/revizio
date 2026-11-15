import type { ReactNode } from "react";
import { useState } from "react";
import {
  Image,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type TextInputProps,
  type ScrollViewInstance,
} from "react-native";
import { usePathname, useRouter } from "expo-router";
import {
  AppIcon,
  AppText,
  Button,
  Card,
  useWindowClass,
  type NavigationItem,
} from "@/components/ui";
import { colors, fontFamily, neumorphic } from "@/theme";
import { PageShell, PersistentAppShell } from "@/components/page-shell";
import type { CourseSource } from "@/domain/model";
import { useLearning } from "@/state/learning-store";
import { ParentChildSelector } from "./child-selector";
import { SourceThumbnail, SourceViewer } from "@/components/source-viewer";
export function ParentLayout({
  active,
  children,
  scrollRef,
}: {
  active:
    | "library"
    | "progress"
    | "dashboard"
    | "import"
    | "exercises"
    | "controls"
    | "english"
    | "vocabulary"
    | "settings"
    | "preparations";
  children: ReactNode;
  scrollRef?: React.RefObject<ScrollViewInstance | null>;
}) {
  return <PageShell scrollRef={scrollRef}>{children}</PageShell>;
}

/** The context bar, navigation and content viewport outlive individual pages. */
export function ParentWorkspace({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const section = pathname.split("/")[2];
  const active = section === "review" ? "library" : (section ?? "dashboard");
  const router = useRouter();
  const data = useLearning();
  const compact = useWindowClass() === "compact";
  const tabStyle = compact
    ? { minWidth: 44, paddingHorizontal: 10 }
    : undefined;
  const inLibrary = [
    "library",
    "import",
    "exercises",
    "english",
    "vocabulary",
    "preparations",
  ].includes(active);
  const navigation: NavigationItem[] = [
    {
      label: "Accueil",
      href: "/parent",
      icon: "home",
      active: active === "dashboard",
    },
    {
      label: "Cours et exercices",
      shortLabel: "Contenus",
      href: "/parent/library",
      icon: "book",
      active: inLibrary,
    },
    {
      label: "Contrôles",
      href: "/parent/controls",
      icon: "calendar",
      active: active === "controls",
    },
    {
      label: "Suivi",
      href: "/parent/progress",
      icon: "chart",
      active: active === "progress",
    },
    {
      label: "Famille",
      href: "/parent/settings",
      icon: "users",
      active: active === "settings",
    },
  ];
  return (
    <PersistentAppShell
      role="parent"
      navigation={navigation}
      loading={!data.isReady}
      header={
        <>
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            <AppText variant="small" color={colors.muted}>
              {compact ? "Pour" : "Enfant accompagné"}
            </AppText>
            <ParentChildSelector />
          </View>
          {inLibrary && (
            <View
              accessibilityLabel="Rubriques des cours et exercices"
              style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
            >
              <Button
                variant={active === "library" ? "secondary" : "ghost"}
                selected={active === "library"}
                accessibilityLabel="Bibliothèque"
                style={tabStyle}
                icon={compact ? undefined : "book"}
                onPress={() => router.push("/parent/library")}
              >
                {compact ? "Cours" : "Bibliothèque"}
              </Button>
              <Button
                variant={active === "vocabulary" ? "secondary" : "ghost"}
                selected={active === "vocabulary"}
                style={tabStyle}
                icon={compact ? undefined : "languages"}
                onPress={() => router.push("/parent/vocabulary")}
              >
                Vocabulaire
              </Button>
              <Button
                variant={active === "preparations" ? "secondary" : "ghost"}
                selected={active === "preparations"}
                accessibilityLabel="Préparations IA"
                style={tabStyle}
                icon={compact ? undefined : "refresh"}
                onPress={() => router.push("/parent/preparations")}
              >
                {compact ? "IA" : "Préparations IA"}
              </Button>
              <Button
                variant={active === "english" ? "secondary" : "ghost"}
                selected={active === "english"}
                style={tabStyle}
                icon={compact ? undefined : "languages"}
                onPress={() => router.push("/parent/english")}
              >
                Anglais
              </Button>
            </View>
          )}
        </>
      }
    >
      {children}
    </PersistentAppShell>
  );
}
export function Field({
  label,
  optional,
  multiline,
  style,
  onFocus,
  onBlur,
  ...props
}: TextInputProps & { label: string; optional?: boolean }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: 8 }}>
      <AppText variant="label">
        {label}
        {optional ? " · facultatif" : ""}
      </AppText>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        multiline={multiline}
        style={[
          styles.input,
          focused && neumorphic.focus,
          multiline && { minHeight: 112, textAlignVertical: "top" },
          style,
        ]}
        {...props}
      />
    </View>
  );
}
export function Notice({
  children,
  error = false,
  success = false,
}: {
  children: ReactNode;
  error?: boolean;
  success?: boolean;
}) {
  const color = error ? colors.danger : success ? colors.green : colors.orange;
  return (
    <View
      style={[
        styles.notice,
        {
          backgroundColor: error
            ? colors.dangerLight
            : success
              ? colors.greenLight
              : colors.orangeLight,
        },
      ]}
      accessibilityLiveRegion={error ? "assertive" : "polite"}
    >
      <AppIcon name={success ? "check" : "lightbulb"} color={color} size={20} />
      <AppText variant="small" color={color} style={{ flex: 1 }}>
        {children}
      </AppText>
    </View>
  );
}
export function LoadingParent({
  active = "dashboard",
}: {
  active?:
    | "dashboard"
    | "library"
    | "progress"
    | "preparations"
    | "import"
    | "exercises"
    | "controls"
    | "english"
    | "settings";
}) {
  return (
    <ParentLayout active={active}>
      <Card>
        <AppText>Chargement de votre espace…</AppText>
      </Card>
    </ParentLayout>
  );
}
export function ParentNotFound() {
  const router = useRouter();
  return (
    <ParentLayout active="dashboard">
      <Card style={{ gap: 18 }}>
        <AppText variant="heading">Ce cours est introuvable.</AppText>
        <AppText color={colors.muted}>
          Retrouvez vos cours dans la bibliothèque.
        </AppText>
        <Button
          icon="arrow-left"
          onPress={() => router.replace("/parent/library")}
        >
          Retour aux cours et exercices
        </Button>
      </Card>
    </ParentLayout>
  );
}
export function SourcePreview({
  source,
  index,
  controls,
}: {
  source: CourseSource;
  index: number;
  controls?: ReactNode;
}) {
  const [failed, setFailed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const image =
    !!source.uri &&
    (source.mimeType?.startsWith("image/") ||
      /\.(jpe?g|png|heic|webp)(?:\?|$)/i.test(source.uri));
  return (
    <View style={styles.source}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          image
            ? (expanded ? "Réduire" : "Agrandir") + " la page " + (index + 1)
            : "Document " + source.name
        }
        onPress={() => setExpanded(true)}
        disabled={!source.uri && !source.cachedUri}
        style={{ gap: 10 }}
      >
        {image && !failed ? (
          <SourceThumbnail source={source} />
        ) : (
          <View
            style={{
              height: 100,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: colors.surfaceInset,
              borderRadius: 12,
            }}
          >
            <AppIcon name="file" size={32} color={colors.muted} />
            <AppText variant="small" color={colors.muted}>
              {failed ? "Aperçu indisponible" : "Document joint"}
            </AppText>
          </View>
        )}
        <AppText variant="small" style={{ fontWeight: "700" }}>
          Page {index + 1}
        </AppText>
        <AppText variant="small" color={colors.muted} numberOfLines={2}>
          {source.name}
        </AppText>
      </Pressable>
      {controls}
      <SourceViewer
        source={expanded ? source : null}
        onClose={() => setExpanded(false)}
      />
    </View>
  );
}
export function localId(prefix: string) {
  return (
    prefix +
    "-" +
    Date.now().toString(36) +
    "-" +
    Math.random().toString(36).slice(2, 8)
  );
}
export const parentStyles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 20 },
  column: { flex: 1, minWidth: 280, minHeight: "auto", gap: 20 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  section: { gap: 18 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 3 },
  choice: {
    ...neumorphic.small,
    minHeight: 52,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  selected: {
    ...neumorphic.inset,
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  bubble: {
    ...neumorphic.small,
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primaryLight,
  },
});
const styles = StyleSheet.create({
  input: {
    ...neumorphic.inset,
    minHeight: 54,
    fontFamily,
    borderRadius: 18,
    color: colors.ink,
    fontSize: 17,
    lineHeight: 24,
    paddingHorizontal: 15,
    paddingVertical: 12,
  },
  notice: {
    ...neumorphic.small,
    borderRadius: 20,
    padding: 16,
    gap: 12,
    flexDirection: "row",
    alignItems: "flex-start",
  },
  source: {
    ...neumorphic.small,
    borderRadius: 20,
    padding: 12,
    width: 190,
    flexGrow: 1,
    maxWidth: 400,
    gap: 8,
  },
});
