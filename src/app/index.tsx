import { useRouter } from "expo-router";
import {
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { AppIcon, AppText, Badge, Brand, Card } from "@/components/ui";
import { NeumorphicProfileCard } from "@/components/NeumorphicProfileCard";
import { colors } from "@/theme";

export default function ProfilesScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const landscape = width >= 800;
  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={[
        styles.content,
        {
          paddingHorizontal: landscape ? 48 : 24,
          paddingVertical: landscape ? 36 : 28,
        },
      ]}
    >
      <View style={styles.brand}>
        <Brand />
      </View>
      <View style={styles.heading}>
        <AppText
          variant="hero"
          style={{
            fontSize: landscape ? 44 : 34,
            lineHeight: landscape ? 56 : 44,
            textAlign: "center",
          }}
        >
          Bonjour ! Qui se connecte ?
        </AppText>
        <AppText
          color={colors.muted}
          style={{ fontSize: 19, lineHeight: 29, textAlign: "center" }}
        >
          Élève ou parent : chacun a son espace.
        </AppText>
      </View>
      <View
        style={[
          styles.profiles,
          { flexDirection: landscape ? "row" : "column" },
        ]}
      >
        <NeumorphicProfileCard
          title="Alex"
          subtitle="Élève de 5e"
          description="Mes cours, mes fiches, mes exercices et mes progrès"
          icon="book"
          testID="profile-child"
          accessibilityLabel="Entrer dans l’espace enfant"
          onPress={() => router.push("/student")}
          style={{ flex: landscape ? 1 : undefined }}
        />
        <NeumorphicProfileCard
          title="Parent"
          subtitle="Suivi et accompagnement"
          description="Ajouter les cours et préparer les prochaines révisions ensemble"
          icon="users"
          tone="orange"
          testID="profile-parent"
          accessibilityLabel="Entrer dans l’espace parent"
          onPress={() => router.push("/parent")}
          style={{ flex: landscape ? 1 : undefined }}
        />
      </View>
      <Card inset style={{ width: "100%", maxWidth: 960, padding: 20, gap: 8 }}>
        <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
          <AppIcon name="lightbulb" size={20} />
          <AppText variant="label">Une première version à explorer</AppText>
          <Badge tone="muted">Démonstration</Badge>
        </View>
        <AppText variant="small" color={colors.muted}>
          Alex est un profil de démonstration. Les cours et résultats restent
          sur cet appareil. La connexion familiale et l’IA seront ajoutées aux
          prochains lots.
        </AppText>
      </Card>
      <AppText
        variant="small"
        color={colors.muted}
        style={{ textAlign: "center" }}
      >
        Révizo · Apprendre avec confiance, réviser en famille.
      </AppText>
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  content: {
    flexGrow: 1,
    maxWidth: 1280,
    width: "100%",
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    gap: 30,
  },
  brand: { alignItems: "center", paddingVertical: 6 },
  heading: { gap: 12, alignItems: "center", paddingVertical: 8 },
  profiles: { width: "100%", maxWidth: 960, gap: 32, alignItems: "stretch" },
});
