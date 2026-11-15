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
import { colors, spacing } from "@/theme";

export default function ProfilesScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const landscape = width >= 600;
  const compact = width < 600;
  const session = useSession();
  const profiles = session.profiles.length
    ? session.profiles
    : [{ id: "new", name: "Enfant", grade: "CM1 ou 5e" }];
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
          paddingHorizontal: landscape ? spacing.xxl : spacing.lg,
          paddingVertical: landscape ? spacing.xxxl : spacing.xl,
          gap: compact ? spacing.xl : spacing.xxl,
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
            fontSize: landscape ? 38 : 30,
            lineHeight: landscape ? 48 : 40,
            textAlign: "center",
          }}
        >
          Bonjour ! Qui se connecte ?
        </AppText>
        <AppText
          color={colors.muted}
          style={{
            fontSize: compact ? 17 : 19,
            lineHeight: compact ? 25 : 29,
            textAlign: "center",
          }}
        >
          Notre espace familial privé.
        </AppText>
      </View>
      <View
        style={[
          styles.profiles,
          {
            flexDirection: landscape ? "row" : "column",
            gap: spacing.xl,
          },
        ]}
      >
        {profiles.map((profile, index) => (
          <NeumorphicProfileCard
            key={profile.id}
            title={profile.name}
            subtitle={
              profile.id === "new" ? "CM1 et 5e" : `Élève de ${profile.grade}`
            }
            description="Mes cours, mes fiches, mes exercices et mes progrès"
            icon="book"
            testID={index === 0 ? "profile-child" : `profile-${profile.id}`}
            accessibilityLabel={`Entrer dans l’espace enfant de ${profile.name}`}
            compact={compact}
            onPress={() => openChild(profile.id)}
            style={{
              flexGrow: 1,
              flexBasis: landscape ? 280 : "auto",
              minWidth: 0,
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
          compact={compact}
          onPress={() =>
            session.mode === "demo" || session.user?.role === "parent"
              ? router.push("/parent")
              : router.push({ pathname: "/auth", params: { target: "parent" } })
          }
          style={{
            flexGrow: 1,
            flexBasis: landscape ? 280 : "auto",
            minWidth: 0,
          }}
        />
      </View>
      {session.mode === "demo" ? (
        <Card
          inset
          style={{
            width: "100%",
            maxWidth: 960,
            padding: spacing.xl,
            gap: spacing.md,
            backgroundColor: colors.background,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: spacing.sm,
              alignItems: "center",
            }}
          >
            <AppIcon name="lightbulb" size={20} />
            <AppText variant="label">Explorer à son rythme</AppText>
            <Badge tone="muted">Démonstration</Badge>
          </View>
          <AppText
            variant="small"
            color={colors.muted}
            style={{ maxWidth: 680 }}
          >
            Alex est un profil de démonstration. Les cours et résultats restent
            sur cet appareil. Connectez votre espace familial pour importer vos
            cours et utiliser l’IA.
          </AppText>
          <Button
            variant="secondary"
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
              Gérer notre famille
            </Button>
          )}
          {!session.serverAvailable && session.ready && (
            <Card inset style={{ gap: 12 }}>
              <AppText color={colors.muted}>
                La connexion est momentanément indisponible.
              </AppText>
              <Button
                variant="secondary"
                icon="refresh"
                onPress={() => void session.refresh()}
              >
                Réessayer
              </Button>
            </Card>
          )}
          {session.health?.demoAvailable && (
            <Button variant="ghost" onPress={() => void session.enterDemo()}>
              Essayer la démonstration
            </Button>
          )}
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
