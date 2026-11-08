import { useRouter } from "expo-router";
import {
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { AppIcon, AppText, Badge, Brand, Card, Button } from "@/components/ui";
import { useSession } from "@/state/session";
import { NeumorphicProfileCard } from "@/components/NeumorphicProfileCard";
import { colors } from "@/theme";

export default function ProfilesScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const landscape = width >= 800;
  const session = useSession();
  const profiles = session.profiles.length
    ? session.profiles
    : [{ id: "new", name: "Élève", grade: "Mes cours" }];
  function openChild(id: string) {
    if (
      session.mode === "demo" ||
      (session.user?.role === "child" && session.user.profileId === id)
    ) {
      router.push("/student");
      return;
    }
    router.push({
      pathname: "/auth",
      params: { target: "child", profileId: id },
    });
  }
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
        {profiles.map((profile, index) => (
          <NeumorphicProfileCard
            key={profile.id}
            title={profile.name}
            subtitle={
              profile.id === "new"
                ? "Apprendre et réviser"
                : `Élève de ${profile.grade}`
            }
            description="Mes cours, mes fiches, mes exercices et mes progrès"
            icon="book"
            testID={index === 0 ? "profile-child" : `profile-${profile.id}`}
            accessibilityLabel="Entrer dans l’espace enfant"
            onPress={() => openChild(profile.id)}
            style={{
              flex: landscape ? 1 : undefined,
              minWidth: landscape ? 300 : undefined,
            }}
          />
        ))}
        <NeumorphicProfileCard
          title="Parent"
          subtitle="Suivi et accompagnement"
          description="Ajouter les cours et préparer les prochaines révisions ensemble"
          icon="users"
          tone="orange"
          testID="profile-parent"
          accessibilityLabel="Entrer dans l’espace parent"
          onPress={() =>
            session.mode === "demo" || session.user?.role === "parent"
              ? router.push("/parent")
              : router.push({ pathname: "/auth", params: { target: "parent" } })
          }
          style={{ flex: landscape ? 1 : undefined }}
        />
      </View>
      {session.mode === "demo" ? (
        <Card
          inset
          style={{ width: "100%", maxWidth: 960, padding: 20, gap: 8 }}
        >
          <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
            <AppIcon name="lightbulb" size={20} />
            <AppText variant="label">Explorer à son rythme</AppText>
            <Badge tone="muted">Démonstration</Badge>
          </View>
          <AppText variant="small" color={colors.muted}>
            Alex est un profil de démonstration. Les cours et résultats restent
            sur cet appareil. Connectez votre espace familial pour importer vos
            cours et utiliser l’IA.
          </AppText>
          <Button
            variant="ghost"
            icon="users"
            onPress={() => void session.logout()}
          >
            Ouvrir mon espace familial
          </Button>
        </Card>
      ) : (
        <View
          style={{
            width: "100%",
            maxWidth: 960,
            gap: 18,
            alignItems: "center",
          }}
        >
          {session.user?.role === "parent" && (
            <Button
              icon="plus"
              variant="secondary"
              onPress={() => router.push("/parent/settings")}
            >
              Ajouter ou gérer les profils
            </Button>
          )}
          {session.serverAvailable ? (
            <Badge tone={session.health?.ai.available ? "green" : "muted"}>
              {session.health?.needsSetup
                ? "Votre premier espace familial"
                : session.health?.ai.available
                  ? "Espace familial · IA disponible"
                  : "Espace familial"}
            </Badge>
          ) : (
            <Card inset style={{ gap: 12 }}>
              <AppText color={colors.muted}>
                Connectez votre serveur Révizo pour retrouver vos cours sur tous
                vos appareils.
              </AppText>
              <Button
                variant="secondary"
                icon="settings"
                onPress={() => router.push("/auth")}
              >
                Configurer la connexion
              </Button>
            </Card>
          )}
          <Button variant="ghost" onPress={() => void session.enterDemo()}>
            Essayer la démonstration
          </Button>
        </View>
      )}
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
  profiles: {
    width: "100%",
    maxWidth: 960,
    gap: 32,
    alignItems: "stretch",
    flexWrap: "wrap",
  },
});
