import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { LearningProvider, useLearning } from "@/state/learning-store";
import { AppText, Brand, Button } from "@/components/ui";
import { SessionProvider } from "@/state/session";
import { colors } from "@/theme";
export { ErrorBoundary } from "expo-router";
function AppNavigator() {
  const { isReady, storageError, syncStatus, syncNow, resolveSyncConflict } =
    useLearning();
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
          {syncStatus === "conflict" ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
              <Button
                variant="secondary"
                onPress={() => void resolveSyncConflict("server")}
              >
                Charger la version du serveur
              </Button>
              <Button onPress={() => void resolveSyncConflict("local")}>
                Conserver mes modifications
              </Button>
            </View>
          ) : syncStatus === "offline" ? (
            <Button
              variant="ghost"
              icon="refresh"
              onPress={() => void syncNow()}
            >
              Réessayer la synchronisation
            </Button>
          ) : null}
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
        <SessionProvider>
          <LearningProvider>
            <StatusBar style="dark" />
            <AppNavigator />
          </LearningProvider>
        </SessionProvider>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
