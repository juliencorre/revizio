import { useRouter } from "expo-router";
import { View } from "react-native";
import { Brand, Button, EmptyState } from "@/components/ui";
import { colors } from "@/theme";
export default function NotFoundScreen() {
  const router = useRouter();
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.background,
        padding: 28,
        justifyContent: "center",
        gap: 24,
        maxWidth: 680,
        width: "100%",
        alignSelf: "center",
      }}
    >
      <Brand />
      <EmptyState
        icon="file"
        title="Cette page n’existe pas"
        description="Retrouvons ton espace pour continuer."
      >
        <Button icon="home" onPress={() => router.replace("/")}>
          Revenir aux profils
        </Button>
      </EmptyState>
    </View>
  );
}
