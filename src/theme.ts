import { Platform, type ViewStyle } from "react-native";

export const colors = {
  background: "#F6F7FC",
  surface: "#FFFFFF",
  surfaceRaised: "#FFFFFF",
  surfaceInset: "#EFF1F8",
  highlight: "#FFFFFF",
  shadow: "#D7DDF0",
  ink: "#161B45",
  muted: "#596381",
  primary: "#6045D9",
  primaryDark: "#4730B7",
  primaryLight: "#EDE8FF",
  orange: "#A34D11",
  orangeLight: "#FFF0D7",
  green: "#22765C",
  greenLight: "#E0F4EC",
  border: "#DEE3F0",
  navigation: "#192451",
  navigationMuted: "#CED5FF",
  navigationHover: "#2B3665",
  onPrimary: "#FFFFFF",
  welcome: "#EDF1FF",
  welcomeInk: "#455176",
  danger: "#B73754",
  dangerLight: "#FBE6EC",
};

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
  topBar: 64,
  navigationBar: 76,
  maxContent: 1320,
} as const;
export const fontFamily = Platform.select({
  ios: "Avenir Next",
  android: "sans-serif",
  default: "'Avenir Next', Inter, system-ui, sans-serif",
});
/** Keep the previous public interface for every component; use calm flat surfaces. */
export const neumorphic = {
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
    boxShadow: "0px 0px 0px 3px rgba(96,69,217,0.18)",
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
