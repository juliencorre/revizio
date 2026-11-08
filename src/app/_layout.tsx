import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { LearningProvider, useLearning } from "@/state/learning-store";
import { AppText, Brand } from "@/components/ui";
import { colors } from "@/theme";
export { ErrorBoundary } from "expo-router";
function AppNavigator() {
  const { isReady, storageError } = useLearning();
  if (!isReady)
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          gap: 22,
        }}
      >
        <Brand />
        <ActivityIndicator color={colors.primary} />
        <AppText color={colors.muted}>On prépare ton espace…</AppText>
      </View>
    );
  return (
    <View style={{ flex: 1 }}>
      {storageError && (
        <View
          accessibilityRole="alert"
          style={{ backgroundColor: colors.orangeLight, padding: 12 }}
        >
          <AppText variant="small" color={colors.orange}>
            {storageError}
          </AppText>
        </View>
      )}
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      />
    </View>
  );
}
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <LearningProvider>
          <StatusBar style="dark" />
          <AppNavigator />
        </LearningProvider>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
