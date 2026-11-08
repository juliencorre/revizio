import { Platform, type ViewStyle } from "react-native";

export const colors = {
  background: "#E4E9F2",
  surface: "#E4E9F2",
  surfaceRaised: "#E8EDF5",
  surfaceInset: "#DEE4EE",
  highlight: "#FFFFFF",
  shadow: "#BEC8D8",
  ink: "#252D3D",
  muted: "#57647B",
  primary: "#514CCF",
  primaryDark: "#3E39AD",
  primaryLight: "#DFE1F7",
  orange: "#A9460C",
  orangeLight: "#F5E5DA",
  green: "#246A45",
  greenLight: "#DDECE4",
  border: "#D2DAE7",
  danger: "#A93246",
  dangerLight: "#F3DEE3",
};

export const radius = { sm: 14, md: 22, lg: 30, xl: 38 };
export const fontFamily = Platform.select({
  ios: "Avenir Next",
  android: "sans-serif",
  default: "'Avenir Next', 'Trebuchet MS', system-ui, sans-serif",
});

/** The same two light sources are shared by native Fabric and the web. */
export const neumorphic = {
  raised: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.42)",
    boxShadow:
      "9px 9px 20px rgba(174,186,205,0.65), -9px -9px 20px rgba(255,255,255,0.88)",
  },
  small: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.34)",
    boxShadow:
      "4px 4px 9px rgba(174,186,205,0.68), -4px -4px 9px rgba(255,255,255,0.88)",
  },
  inset: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    boxShadow:
      "inset 4px 4px 9px rgba(169,181,201,0.64), inset -4px -4px 9px rgba(255,255,255,0.88)",
  },
  focus: {
    borderColor: colors.primary,
    boxShadow:
      "4px 4px 9px rgba(174,186,205,0.65), -4px -4px 9px rgba(255,255,255,0.9), 0px 0px 0px 3px rgba(81,76,207,0.20)",
  },
  colored: {
    boxShadow:
      "5px 5px 11px rgba(154,166,190,0.76), -5px -5px 11px rgba(255,255,255,0.85)",
  },
  coloredPressed: {
    boxShadow:
      "inset 3px 3px 7px rgba(24,27,73,0.35), inset -3px -3px 7px rgba(255,255,255,0.19)",
  },
} satisfies Record<string, ViewStyle>;
