import { useState } from "react";
import { Platform, StyleSheet, View, type TextInputProps } from "react-native";
import { AppIcon, AppText, Button, Card } from "@/components/ui";
import { Field, Notice } from "@/features/parent/shared";
import { colors } from "@/theme";
import {
  apiBase,
  apiFetch,
  configureApiBase,
  type ServerHealth,
} from "@/services/api";
import { useSession } from "@/state/session";
import type { ChildProfile } from "@/domain/model";

export type ProfileWithPin = ChildProfile & { needsPin?: boolean };
export const needsPin = (profile: ChildProfile | undefined) =>
  !!(profile as ProfileWithPin | undefined)?.needsPin;
export const emailIsValid = (value: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
export const pinIsValid = (value: string) => /^\d{4,8}$/.test(value);
export function errorMessage(
  error: unknown,
  fallback = "Cette action n’a pas pu aboutir. Réessayez.",
) {
  return error instanceof Error ? error.message : fallback;
}
export function PasswordField({
  label,
  testID,
  style,
  ...props
}: TextInputProps & { label: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <View style={{ position: "relative" }}>
      <Field
        {...props}
        label={label}
        testID={testID}
        secureTextEntry={!visible}
        style={[{ paddingRight: 64 }, style]}
      />
      <Button
        variant="ghost"
        icon={visible ? "eye-off" : "eye"}
        onPress={() => setVisible(!visible)}
        accessibilityLabel={
          (visible ? "Masquer " : "Afficher ") + label.toLocaleLowerCase("fr")
        }
        style={{
          position: "absolute",
          right: 6,
          bottom: 5,
          minHeight: 44,
          width: 44,
          paddingHorizontal: 10,
          paddingVertical: 10,
          borderRadius: 14,
        }}
      >
        {""}
      </Button>
    </View>
  );
}
function visibleApiAddress() {
  const address = apiBase();
  return address.startsWith("/") && Platform.OS === "web"
    ? window.location.origin + address
    : address;
}
function checkedAddress(value: string) {
  if (!value.trim()) return "";
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new Error(
      "Saisissez une adresse complète commençant par http:// ou https://.",
    );
  }
  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  )
    throw new Error(
      "Utilisez une adresse HTTP(S) sans identifiants, paramètres ni fragment.",
    );
  return value.trim();
}
export function ServerConnectionCard({
  initiallyExpanded = false,
  testPrefix = "auth",
}: {
  initiallyExpanded?: boolean;
  testPrefix?: string;
}) {
  const session = useSession();
  const [expanded, setExpanded] = useState(
    initiallyExpanded || !session.serverAvailable || Platform.OS !== "web",
  );
  const [address, setAddress] = useState(visibleApiAddress);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function connect(reset = false) {
    setError("");
    setMessage("");
    setBusy(true);
    try {
      const next = checkedAddress(reset ? "" : address);
      await configureApiBase(next);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);
      try {
        await apiFetch<ServerHealth>("/health", { signal: controller.signal });
      } finally {
        clearTimeout(timer);
      }
      await session.refresh();
      setAddress(visibleApiAddress());
      setMessage(
        "Le serveur répond. Vous pouvez vous connecter à votre espace familial.",
      );
    } catch (caught) {
      await session.refresh();
      setError(
        errorMessage(caught, "Le serveur ne répond pas à cette adresse."),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card inset style={{ gap: 16 }} testID={testPrefix + "-server"}>
      <View style={accountStyles.row}>
        <AppIcon name="wifi" />
        <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 200, gap: 4 }}>
          <AppText variant="heading">Le serveur de la famille</AppText>
          <AppText variant="small" color={colors.muted}>
            {session.serverAvailable && !session.offline
              ? "Connecté à votre espace Révizo"
              : "Vérifiez la connexion ou l’adresse du serveur."}
          </AppText>
        </View>
        <Button
          variant="ghost"
          onPress={() => setExpanded(!expanded)}
          testID={testPrefix + "-server-toggle"}
        >
          {expanded ? "Réduire" : "Configurer"}
        </Button>
      </View>
      {expanded && (
        <>
          <AppText variant="small" color={colors.muted}>
            Sur l’iPad, utilisez l’adresse du serveur accessible depuis votre
            réseau. Changer d’adresse demande une nouvelle connexion.
          </AppText>
          <Field
            label="Adresse du serveur Révizo"
            value={address}
            onChangeText={(value) => {
              setAddress(value);
              setError("");
              setMessage("");
            }}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            placeholder="http://192.168.1.20:4173"
            editable={!busy}
            testID={testPrefix + "-server-url"}
          />
          {error && (
            <View testID={testPrefix + "-server-error"}>
              <Notice error>{error}</Notice>
            </View>
          )}
          {message && <Notice success>{message}</Notice>}
          <View style={accountStyles.row}>
            <Button
              icon="check"
              onPress={() => void connect()}
              disabled={busy}
              testID={testPrefix + "-server-save"}
            >
              {busy ? "Vérification…" : "Enregistrer et tester"}
            </Button>
            <Button
              variant="ghost"
              onPress={() => void connect(true)}
              disabled={busy}
            >
              Adresse par défaut
            </Button>
          </View>
        </>
      )}
    </Card>
  );
}
export const accountStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    flexWrap: "wrap",
  },
  stack: { gap: 18 },
  formGrid: { flexDirection: "row", flexWrap: "wrap", gap: 22 },
  field: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 280,
    minWidth: 0,
    maxWidth: "100%",
  },
  columns: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 24,
    alignItems: "stretch",
  },
  column: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 340,
    minWidth: 280,
    minHeight: "auto",
    gap: 20,
  },
});
