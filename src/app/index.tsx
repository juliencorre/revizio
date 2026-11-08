import { useRouter } from "expo-router";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { AppIcon, AppText, Badge, Brand, Button, Card } from "@/components/ui";
import { colors } from "@/theme";

export default function ProfilesScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const landscape = width >= 900;
  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={[styles.content, { padding: landscape ? 48 : 24 }]}
    >
      <View style={styles.top}>
        <Brand />
        <Badge tone="muted">Pensé pour apprendre, à ton rythme</Badge>
      </View>
      <View
        style={[
          styles.main,
          {
            flexDirection: landscape ? "row" : "column",
            gap: landscape ? 64 : 30,
          },
        ]}
      >
        <View style={{ flex: 1, gap: 24 }}>
          <Badge>LE PLAISIR DE COMPRENDRE</Badge>
          <AppText
            variant="hero"
            style={{
              fontSize: landscape ? 52 : 39,
              lineHeight: landscape ? 62 : 48,
            }}
          >
            Un petit pas aujourd’hui,{"\n"}un grand progrès demain.
          </AppText>
          <AppText
            color={colors.muted}
            style={{ fontSize: 19, lineHeight: 30, maxWidth: 490 }}
          >
            Tes cours, des fiches claires et des exercices pour prendre
            confiance. On commence ?
          </AppText>
          <View style={styles.illustration}>
            <View style={styles.notebook}>
              <View
                style={{ flexDirection: "row", gap: 12, alignItems: "center" }}
              >
                <View style={styles.mathIcon}>
                  <AppIcon name="calculator" color="#FFFFFF" size={25} />
                </View>
                <View style={{ gap: 3 }}>
                  <AppText variant="heading">Chaque notion compte.</AppText>
                  <AppText variant="small" color={colors.muted}>
                    Lire · Comprendre · S’entraîner
                  </AppText>
                </View>
              </View>
              <View style={styles.rule} />
              <View style={[styles.rule, { width: "78%" }]} />
              <View style={[styles.rule, { width: "88%" }]} />
              <View style={styles.equation}>
                <AppText variant="heading" color={colors.primary}>
                  (−8) + (+5) = −3
                </AppText>
                <View style={styles.check}>
                  <AppIcon name="check" color={colors.green} size={22} />
                </View>
              </View>
            </View>
            <View style={styles.success}>
              <AppIcon name="sparkles" color={colors.orange} />
              <AppText
                variant="small"
                color={colors.orange}
                style={{ fontWeight: "700" }}
              >
                Un peu plus à l’aise, chaque jour
              </AppText>
            </View>
          </View>
        </View>
        <View
          style={{
            flex: 1,
            maxWidth: landscape ? 490 : undefined,
            gap: 20,
            justifyContent: "center",
          }}
        >
          <View style={{ gap: 8, marginBottom: 8 }}>
            <AppText variant="title">Qui se connecte ?</AppText>
            <AppText color={colors.muted}>
              À chacun son espace pour avancer ensemble.
            </AppText>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Entrer dans l’espace enfant"
            testID="profile-child"
            onPress={() => router.push("/student")}
            style={({ pressed }) => [
              styles.profile,
              pressed && { opacity: 0.82 },
            ]}
          >
            <View
              style={[styles.avatar, { backgroundColor: colors.primaryLight }]}
            >
              <AppIcon name="book" size={30} />
            </View>
            <View style={{ flex: 1, gap: 5 }}>
              <AppText variant="heading">Alex</AppText>
              <AppText color={colors.muted}>Mon espace · Élève de 5e</AppText>
            </View>
            <AppIcon name="arrow-right" />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Entrer dans l’espace parent"
            testID="profile-parent"
            onPress={() => router.push("/parent")}
            style={({ pressed }) => [
              styles.profile,
              pressed && { opacity: 0.82 },
            ]}
          >
            <View
              style={[styles.avatar, { backgroundColor: colors.orangeLight }]}
            >
              <AppIcon name="users" size={30} color={colors.orange} />
            </View>
            <View style={{ flex: 1, gap: 5 }}>
              <AppText variant="heading">Parent</AppText>
              <AppText color={colors.muted}>Préparer et accompagner</AppText>
            </View>
            <AppIcon name="arrow-right" color={colors.orange} />
          </Pressable>
          <Card
            style={{
              backgroundColor: "#ECECF8",
              borderWidth: 0,
              padding: 20,
              gap: 8,
            }}
          >
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
            >
              <AppIcon name="lightbulb" size={18} />
              <AppText variant="label">Une première version à explorer</AppText>
            </View>
            <AppText variant="small" color={colors.muted}>
              Alex est un profil de démonstration. Les cours et résultats
              restent sur cet appareil. La connexion familiale et l’IA seront
              ajoutées aux prochains lots.
            </AppText>
          </Card>
        </View>
      </View>
      <View style={styles.footer}>
        <AppText variant="small" color={colors.muted}>
          Révizo · Apprendre avec confiance, réviser en famille.
        </AppText>
      </View>
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, maxWidth: 1480, width: "100%", alignSelf: "center" },
  top: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    flexWrap: "wrap",
  },
  main: { flex: 1, paddingVertical: 52, alignItems: "stretch" },
  profile: {
    minHeight: 128,
    padding: 25,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 26,
    backgroundColor: colors.surface,
    flexDirection: "row",
    gap: 20,
    alignItems: "center",
  },
  avatar: {
    width: 68,
    height: 68,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
  },
  illustration: { maxWidth: 520, paddingTop: 16, paddingBottom: 22 },
  notebook: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: colors.border,
    padding: 28,
    borderRadius: 26,
    gap: 18,
    transform: [{ rotate: "-2deg" }],
  },
  mathIcon: {
    width: 52,
    height: 52,
    borderRadius: 17,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  rule: {
    height: 7,
    borderRadius: 4,
    backgroundColor: "#F0F1F7",
    width: "96%",
  },
  equation: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.primaryLight,
    padding: 16,
    borderRadius: 16,
  },
  check: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.greenLight,
    alignItems: "center",
    justifyContent: "center",
  },
  success: {
    alignSelf: "flex-end",
    marginTop: -8,
    marginRight: 8,
    backgroundColor: colors.orangeLight,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    transform: [{ rotate: "2deg" }],
  },
  footer: { alignItems: "center", paddingVertical: 12 },
});
