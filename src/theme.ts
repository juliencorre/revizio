import { createContext, useContext } from "react";
import {
  Platform,
  StyleSheet,
  useColorScheme,
  type ViewStyle,
} from "react-native";
import palettes from "./theme/palettes.json";

export const radius = { sm: 12, md: 18, lg: 24, xl: 30 };
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 40,
};
export type WindowClass = "compact" | "medium" | "expanded";
export const breakpoints = { medium: 600, expanded: 1000 };
export function windowClassFor(width: number): WindowClass {
  return width < breakpoints.medium
    ? "compact"
    : width < breakpoints.expanded
      ? "medium"
      : "expanded";
}
export const layout = {
  gutter: { compact: 16, medium: 26, expanded: 34 },
  sectionGap: { compact: 20, medium: 23, expanded: 25 },
  rail: 96,
  drawer: 280,
  parentDrawer: 224,
  topBar: 64,
  navigationBar: 76,
  maxContent: 1320,
} as const;
export const fontFamily = Platform.select({
  ios: "Avenir Next",
  android: "sans-serif",
  default: "'Avenir Next', Inter, system-ui, sans-serif",
});
function createTheme(colors: typeof palettes.light, dark: boolean) {
  const neumorphic = {
    raised: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      boxShadow: "0px 4px 16px rgba(32,42,108,0.035)",
    },
    small: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      boxShadow: "none",
    },
    inset: {
      backgroundColor: colors.surfaceInset,
      borderWidth: 1,
      borderColor: colors.border,
      boxShadow: "none",
    },
    focus: {
      borderColor: colors.primary,
      boxShadow: `0px 0px 0px 3px ${colors.primary}30`,
    },
    colored: {
      boxShadow: "0px 4px 10px rgba(85,62,196,0.12)",
    },
    raisedCompact: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      boxShadow: "0px 3px 12px rgba(32,42,108,0.035)",
    },
    hover: {
      boxShadow: "0px 6px 20px rgba(32,42,108,0.08)",
    },
    coloredPressed: {
      boxShadow: "0px 2px 6px rgba(42,28,123,0.15)",
    },
  } satisfies Record<string, ViewStyle>;

  // Subject colours are stored with the learning data. Adapt their display only.
  function subjectAccent(value?: string) {
    if (!value || !/^#[0-9a-f]{6}$/i.test(value)) return colors.primary;
    if (!dark) return value;
    return value.replace(/[0-9a-f]{2}/gi, (channel) => {
      const n = parseInt(channel, 16);
      return Math.round(n + (255 - n) * 0.45)
        .toString(16)
        .padStart(2, "0");
    });
  }
  return { colors, neumorphic, subjectAccent, dark };
}
const lightTheme = createTheme(palettes.light, false);
const darkTheme = createTheme(palettes.dark, true);
export const ThemeContext = createContext(lightTheme);
export const useTheme = () => useContext(ThemeContext);
export function useSystemTheme() {
  return useColorScheme() === "dark" ? darkTheme : lightTheme;
}

type StyleRules = Parameters<typeof StyleSheet.create>[0];

/** Register each stylesheet once. Switching appearance keeps mounted screens and drafts intact. */
export function createThemedStyles<T extends StyleRules>(
  styles: (theme: typeof lightTheme) => T & StyleRules,
) {
  const light = StyleSheet.create(styles(lightTheme));
  const dark = StyleSheet.create(styles(darkTheme));
  return function useThemedStyles() {
    return useTheme().dark ? dark : light;
  };
}
