import { createContext, useContext, useState, type ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  useWindowDimensions,
  View,
} from "react-native";
import { Brand, Button } from "@/components/ui";
import {
  breakpoints,
  layout,
  spacing,
  useTheme,
  windowClassFor,
} from "@/theme";

const CompactPracticeContext = createContext(false);
export const useCompactPractice = () => useContext(CompactPracticeContext);

export function ConjugationPracticeFrame({
  children,
  backLabel,
  onBack,
}: {
  children: ReactNode;
  backLabel: string;
  onBack: () => void;
}) {
  const { colors, dark } = useTheme();
  const { width, height } = useWindowDimensions();
  // Keep the same density when checking an answer dismisses the keyboard.
  const [shortAtWidth, setShortAtWidth] = useState<number | null>(null);
  const compact = width < breakpoints.medium || shortAtWidth === width;
  const gutter = layout.gutter[windowClassFor(width)];
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{
        flex: 1,
        maxHeight: Platform.OS === "web" ? height : undefined,
        backgroundColor: colors.background,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingVertical: spacing.sm,
          paddingHorizontal: gutter,
          minHeight: compact ? 64 : 76,
          backgroundColor: dark ? colors.navigation : colors.surface,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
      >
        <Brand compact />
        <Button variant="ghost" icon="arrow-left" onPress={onBack}>
          {backLabel}
        </Button>
      </View>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        style={{ flex: 1 }}
        onLayout={(event) => {
          const available = event.nativeEvent.layout.height;
          if (available > 0 && available < 500) setShortAtWidth(width);
        }}
        contentContainerStyle={{
          paddingHorizontal: gutter,
          paddingTop: compact ? spacing.md : spacing.xxl * 2,
          paddingBottom: spacing.xl,
        }}
      >
        <View
          role="main"
          testID="student-conjugation"
          style={{
            alignSelf: "center",
            width: "100%",
            maxWidth: 740,
            gap: spacing.md,
          }}
        >
          <CompactPracticeContext.Provider value={compact}>
            {children}
          </CompactPracticeContext.Provider>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
