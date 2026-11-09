import type { ReactNode } from "react";
import { useState } from "react";
import {
  Image,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { useRouter } from "expo-router";
import {
  AppIcon,
  AppShell,
  AppText,
  Button,
  Card,
  type NavigationItem,
} from "@/components/ui";
import { colors, fontFamily, neumorphic } from "@/theme";
import type { CourseSource } from "@/domain/model";
import { SourceThumbnail, SourceViewer } from "@/components/source-viewer";
export function ParentLayout({
  active,
  children,
}: {
  active:
    | "dashboard"
    | "import"
    | "exercises"
    | "controls"
    | "english"
    | "settings"
    | "preparations";
  children: ReactNode;
}) {
  const navigation: NavigationItem[] = [
    {
      label: "Tableau de bord",
      shortLabel: "Accueil",
      href: "/parent",
      icon: "home",
      active: active === "dashboard",
    },
    {
      label: "Ajouter un cours",
      shortLabel: "Ajouter",
      href: "/parent/import",
      icon: "camera",
      active: active === "import",
    },
    {
      label: "Préparer des exercices",
      shortLabel: "Exercices",
      href: "/parent/exercises",
      icon: "pencil",
      active: active === "exercises",
    },
    {
      label: "Contrôles et plans",
      shortLabel: "Contrôles",
      href: "/parent/controls",
      icon: "calendar",
      active: active === "controls",
    },
    {
      label: "Anglais",
      href: "/parent/english",
      icon: "languages",
      active: active === "english",
    },
    {
      label: "Mes préparations",
      shortLabel: "Préparations",
      href: "/parent/preparations",
      icon: "refresh",
      active: active === "preparations",
    },
    {
      label: "Réglages",
      href: "/parent/settings",
      icon: "settings",
      active: active === "settings",
    },
  ];
  return (
    <AppShell role="parent" navigation={navigation}>
      {children}
    </AppShell>
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
        placeholderTextColor="#718099"
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
    "dashboard" | "import" | "exercises" | "controls" | "english" | "settings";
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
          Retrouvez vos cours depuis le tableau de bord.
        </AppText>
        <Button icon="arrow-left" onPress={() => router.replace("/parent")}>
          Retour au tableau de bord
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
