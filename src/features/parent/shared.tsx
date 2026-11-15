import { documentKind } from "@/domain/document-kind";
import type { ReactNode } from "react";
import { useState } from "react";
import {
  Image,
  Pressable,
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
  type NavigationItem,
} from "@/components/ui";
import { createThemedStyles, useTheme, fontFamily, spacing } from "@/theme";
import { PageShell, PersistentAppShell } from "@/components/page-shell";
import type { CourseSource } from "@/domain/model";
import { useLearning } from "@/state/learning-store";
import { ParentChildSelector } from "./child-selector";
import { SourceThumbnail, SourceViewer } from "@/components/source-viewer";
import { SubjectSelector } from "./subject-selector";
import { subjectHref, type SubjectTab } from "./subject-navigation";

export function ParentLayout({
  active,
  children,
  scrollRef,
  subjectId,
}: {
  active:
    | "subjects"
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
  subjectId?: string;
  scrollRef?: React.RefObject<ScrollViewInstance | null>;
}) {
  const data = useLearning();
  const subject = data.subjects.find((item) => item.id === subjectId);
  return (
    <PageShell subject={subject} scrollRef={scrollRef}>
      {children}
    </PageShell>
  );
}

export function ParentWorkspace({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  const active = usePathname().split("/")[2] || "dashboard";
  const router = useRouter();
  const returnTab: SubjectTab =
    active === "exercises"
      ? "exercices"
      : active === "vocabulary"
        ? "vocabulaire"
        : active === "english"
          ? "conjugaison"
          : "cours";
  const data = useLearning();
  const navigation: NavigationItem[] = [
    {
      label: "Accueil",
      href: "/parent",
      icon: "home",
      active: active === "dashboard",
    },
    {
      label: "Matières",
      href: "/parent/subjects",
      icon: "book",
      active: [
        "subjects",
        "subject",
        "review",
        "library",
        "import",
        "exercises",
        "english",
        "vocabulary",
        "preparations",
      ].includes(active),
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
      header={({ subject }) => (
        <>
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
              gap: spacing.sm,
            }}
          >
            {subject ? (
              <SubjectSelector key={subject.id} subject={subject} />
            ) : (
              <AppText variant="small" color={colors.muted}>
                Enfant accompagné
              </AppText>
            )}
            <ParentChildSelector />
          </View>
          {subject && active !== "subject" && (
            <Button
              variant="ghost"
              icon="arrow-left"
              style={{ alignSelf: "flex-end" }}
              onPress={() =>
                router.navigate(subjectHref(subject.id, returnTab))
              }
            >
              Menu de la matière
            </Button>
          )}
        </>
      )}
    >
      {children}
    </PersistentAppShell>
  );
}
export function Field({
  label,
  optional,
  hideLabel = false,
  multiline,
  style,
  onFocus,
  onBlur,
  ...props
}: TextInputProps & {
  label: string;
  optional?: boolean;
  hideLabel?: boolean;
}) {
  const { colors, neumorphic } = useTheme();
  const styles = useStyles();
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: 8 }}>
      {!hideLabel && (
        <AppText variant="label">
          {label}
          {optional ? " · facultatif" : ""}
        </AppText>
      )}
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
  const { colors } = useTheme();
  const styles = useStyles();
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
  const { colors } = useTheme();
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
  const { colors } = useTheme();
  const styles = useStyles();
  const [failed, setFailed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const image = documentKind(source) === "image";
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
export const useParentStyles = createThemedStyles(({ colors, neumorphic }) => ({
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
}));
const useStyles = createThemedStyles(({ colors, neumorphic }) => ({
  input: {
    ...neumorphic.inset,
    borderColor: colors.controlBorder,
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
}));
