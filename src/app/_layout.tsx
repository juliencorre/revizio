import { Slot } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { LearningProvider, useLearning } from "@/state/learning-store";
import { AppText, Brand, Button, ResponsiveProvider } from "@/components/ui";
import { SessionProvider } from "@/state/session";
import { useTheme, ThemeContext, useSystemTheme } from "@/theme";
import { useRef } from "react";
import { PwaProvider } from "@/features/pwa/pwa-provider";
export { ErrorBoundary } from "expo-router";
function AppNavigator() {
  const { colors } = useTheme();
  const {
    isReady,
    storageError,
    syncStatus,
    syncNow,
    syncConflicts,
    resolveSyncConflict,
  } = useLearning();
  const field = syncConflicts[0];
  const navigationStarted = useRef(false);
  if (isReady) navigationStarted.current = true;
  if (!isReady && !navigationStarted.current)
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
      <View style={{ flex: 1 }}>
        {storageError && (
          <View
            accessibilityRole="alert"
            style={{ backgroundColor: colors.orangeLight, padding: 12 }}
          >
            <AppText variant="small" color={colors.orange}>
              {storageError}
            </AppText>
            {syncStatus === "conflict" && field ? (
              <View style={{ gap: 8 }}>
                <AppText variant="label">
                  {field.title} · {field.field}
                </AppText>
                <AppText variant="small">
                  {syncConflicts.length} choix restant
                  {syncConflicts.length > 1 ? "s" : ""}
                </AppText>
                <ScrollView style={{ maxHeight: 128 }}>
                  <AppText>Cet appareil · {field.local}</AppText>
                </ScrollView>
                <ScrollView style={{ maxHeight: 128 }}>
                  <AppText>Serveur · {field.remote}</AppText>
                </ScrollView>
                <View
                  style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}
                >
                  <Button
                    variant="secondary"
                    onPress={() =>
                      void resolveSyncConflict("server", field.path)
                    }
                  >
                    Choisir la version du serveur
                  </Button>
                  <Button
                    onPress={() =>
                      void resolveSyncConflict("local", field.path)
                    }
                  >
                    Choisir ma version
                  </Button>
                </View>
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
        <Slot />
      </View>
    </View>
  );
}
export default function RootLayout() {
  const theme = useSystemTheme();
  return (
    <ThemeContext.Provider value={theme}>
      <SafeAreaProvider>
        <SafeAreaView
          style={{ flex: 1, backgroundColor: theme.colors.background }}
        >
          <ResponsiveProvider>
            <PwaProvider>
              <SessionProvider>
                <LearningProvider>
                  <StatusBar style={theme.dark ? "light" : "dark"} />
                  <AppNavigator />
                </LearningProvider>
              </SessionProvider>
            </PwaProvider>
          </ResponsiveProvider>
        </SafeAreaView>
      </SafeAreaProvider>
    </ThemeContext.Provider>
  );
}
