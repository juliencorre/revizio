import { useState } from "react";
import { View } from "react-native";
import { AppIcon, AppText, Badge, Button, Card } from "@/components/ui";
import { useTheme, radius, spacing } from "@/theme";
import { usePwa } from "./pwa-provider";

export function InstallAppCard({ compact = false }: { compact?: boolean }) {
  const { colors } = useTheme();
  const pwa = usePwa();
  const [showGuide, setShowGuide] = useState(false);
  if (!pwa.available || (compact && pwa.installed && !pwa.updateAvailable))
    return null;
  const steps = pwa.ios
    ? [
        "Ouvrez Révizo dans Safari, puis touchez le bouton Partager.",
        "Choisissez « Sur l’écran d’accueil ». Si nécessaire, touchez « Plus » pour trouver cette option.",
        "Gardez « Ouvrir comme app web » activé si cette option apparaît, puis touchez « Ajouter ».",
        "Ouvrez ensuite Révizo depuis son icône sur l’écran d’accueil.",
      ]
    : [
        "Ouvrez le menu de votre navigateur ou l’icône d’installation à droite de la barre d’adresse.",
        "Choisissez « Installer Révizo » ou « Ajouter à l’écran d’accueil », puis confirmez. Sur Mac avec Safari : Fichier → Ajouter au Dock.",
        "Retrouvez Révizo parmi vos applications. Si l’option manque, essayez avec Chrome, Edge ou Safari.",
      ];
  return (
    <Card
      testID="pwa-install-card"
      style={{
        width: "100%",
        maxWidth: compact ? 960 : undefined,
        gap: spacing.lg,
      }}
    >
      <View
        style={{ flexDirection: "row", alignItems: "center", gap: spacing.lg }}
      >
        <View
          style={{
            padding: spacing.md,
            borderRadius: radius.md,
            backgroundColor: colors.primaryLight,
          }}
        >
          <AppIcon name={pwa.installed ? "check" : "download"} size={26} />
        </View>
        <View style={{ flex: 1, gap: spacing.xs }}>
          <AppText variant={compact ? "label" : "heading"}>
            {pwa.installed
              ? "Révizo est ouverte comme une app"
              : "Révizo sur votre écran d’accueil"}
          </AppText>
          <AppText variant="small" color={colors.muted}>
            {pwa.installed
              ? "Votre espace familial, à portée de main."
              : "Une icône pour retrouver vos révisions, dans une fenêtre dédiée."}
          </AppText>
        </View>
      </View>
      {!pwa.secure ? (
        <AppText variant="small" color={colors.orange}>
          Ouvrez l’adresse HTTPS de Révizo pour installer l’application et
          préparer l’accès hors connexion.
        </AppText>
      ) : (
        !pwa.installed && (
          <View
            style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.md }}
          >
            {pwa.canInstall && (
              <Button
                icon="download"
                onPress={() => void pwa.install()}
                testID="pwa-install"
              >
                Installer Révizo
              </Button>
            )}
            <Button
              variant={pwa.canInstall ? "ghost" : "secondary"}
              icon="plus"
              onPress={() => setShowGuide(!showGuide)}
              testID="pwa-guide"
            >
              {showGuide
                ? "Masquer les étapes"
                : pwa.ios
                  ? "Installer sur mon iPad ou iPhone"
                  : "Comment installer Révizo"}
            </Button>
          </View>
        )
      )}
      {showGuide && pwa.secure && !pwa.installed && (
        <View
          testID="pwa-instructions"
          style={{
            gap: spacing.md,
            padding: spacing.lg,
            borderRadius: radius.md,
            backgroundColor: colors.surfaceInset,
          }}
        >
          {steps.map((step, index) => (
            <View key={step} style={{ flexDirection: "row", gap: spacing.md }}>
              <AppText variant="label" color={colors.primary}>
                {index + 1}.
              </AppText>
              <AppText variant="small" style={{ flex: 1 }}>
                {step}
              </AppText>
            </View>
          ))}
          <AppText variant="small" color={colors.muted}>
            Après l’installation, une connexion à votre espace familial peut
            être nécessaire dans l’application.
          </AppText>
        </View>
      )}
      {!pwa.installed && pwa.installStatus !== "idle" && (
        <View accessibilityLiveRegion="polite" testID="pwa-install-feedback">
          <AppText variant="small" color={colors.muted}>
            {pwa.installStatus === "accepted"
              ? "Installation demandée. Retrouvez Révizo parmi vos applications une fois l’installation terminée."
              : pwa.installStatus === "dismissed"
                ? "Vous pourrez installer Révizo plus tard depuis le menu de votre navigateur."
                : pwa.installStatus === "error"
                  ? "L’installation n’a pas abouti. Suivez les étapes ci-dessus ou utilisez le menu de votre navigateur."
                  : "Confirmez l’installation dans la fenêtre de votre navigateur."}
          </AppText>
        </View>
      )}
      {pwa.secure && (
        <View style={{ gap: spacing.sm }}>
          <View
            style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}
          >
            <Badge tone={pwa.offline === "ready" ? "green" : "muted"}>
              {pwa.offline === "ready"
                ? "Interface disponible hors ligne"
                : pwa.offline === "preparing"
                  ? "Préparation de l’accès hors ligne…"
                  : "Accès hors ligne non préparé"}
            </Badge>
          </View>
          <AppText variant="small" color={colors.muted}>
            Les révisions déjà enregistrées sur cet appareil restent accessibles
            selon votre session. L’import, l’IA et la synchronisation
            nécessitent une connexion.
          </AppText>
        </View>
      )}
      {pwa.updateAvailable && (
        <View
          testID="pwa-update"
          accessibilityLiveRegion="polite"
          style={{
            gap: spacing.sm,
            padding: spacing.lg,
            borderRadius: radius.md,
            backgroundColor: colors.primaryLight,
          }}
        >
          <AppText variant="label" color={colors.primary}>
            Une mise à jour est prête
          </AppText>
          <AppText variant="small">
            Quand vous avez terminé, fermez toutes les fenêtres et tous les
            onglets Révizo, puis rouvrez l’application pour en profiter.
          </AppText>
        </View>
      )}
    </Card>
  );
}
