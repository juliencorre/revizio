import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { AppIcon, AppText, Badge, Button, Card } from "@/components/ui";
import { Field, Notice } from "@/features/parent/shared";
import { FAMILY_LIMITS } from "@/domain/family";
import { apiFetch } from "@/services/api";
import { useSession } from "@/state/session";
import { useTheme } from "@/theme";
import {
  PasswordField,
  accountStyles as s,
  emailIsValid,
  errorMessage,
} from "./shared";

type Parent = { id: string; name: string; email: string };

export function ParentAccountsCard({ online }: { online: boolean }) {
  const { colors } = useTheme();
  const { user } = useSession();
  const [parents, setParents] = useState<Parent[] | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!online) return;
    const controller = new AbortController();
    void apiFetch<{ parents: Parent[] }>("/parents", {
      signal: controller.signal,
    })
      .then((result) => {
        if (!controller.signal.aborted) setParents(result.parents);
      })
      .catch((caught) => {
        if (!controller.signal.aborted) setError(errorMessage(caught));
      });
    return () => controller.abort();
  }, [online, user?.id, user?.name, user?.email]);
  async function save() {
    if (submitting.current) return;
    setError("");
    setMessage("");
    if (!name.trim() || !emailIsValid(email)) {
      setError(
        "Renseignez le nom et une adresse e-mail valide pour votre conjoint.",
      );
      return;
    }
    if (
      password.length < 10 ||
      password.length > 256 ||
      password !== confirmation
    ) {
      setError(
        "Choisissez un mot de passe de 10 à 256 caractères et confirmez-le à l’identique.",
      );
      return;
    }
    if (!currentPassword) {
      setError(
        "Confirmez votre mot de passe actuel pour ajouter votre conjoint.",
      );
      return;
    }
    submitting.current = true;
    setBusy(true);
    try {
      const result = await apiFetch<{ parent: Parent }>("/parents", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          password,
          currentPassword,
        }),
      });
      setParents((previous) => [...(previous ?? []), result.parent]);
      setName("");
      setEmail("");
      setPassword("");
      setConfirmation("");
      setCurrentPassword("");
      setMessage(
        "Le compte de votre conjoint est prêt. Chacun se connecte avec ses propres identifiants.",
      );
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  return (
    <Card style={{ gap: 20 }} testID="settings-parents">
      <View style={s.row}>
        <AppIcon name="users" />
        <AppText variant="heading" style={{ flex: 1 }}>
          Les deux parents
        </AppText>
        {parents && (
          <Badge>
            {parents.length} / {FAMILY_LIMITS.parents}
          </Badge>
        )}
      </View>
      <AppText color={colors.muted}>
        Seuls vous et votre conjoint pouvez accompagner les deux enfants.
        L’ajout du conjoint se fait depuis cet espace privé.
      </AppText>
      {parents?.map((parent) => (
        <View key={parent.id} style={{ gap: 4 }}>
          <AppText variant="label">
            {parent.name}
            {parent.id === user?.id ? " · Vous" : ""}
          </AppText>
          <AppText variant="small" color={colors.muted}>
            {parent.email}
          </AppText>
        </View>
      ))}
      {error && (
        <View testID="settings-parents-error">
          <Notice error>{error}</Notice>
        </View>
      )}
      {message && (
        <View testID="settings-parents-feedback">
          <Notice success>{message}</Notice>
        </View>
      )}
      {parents && parents.length < FAMILY_LIMITS.parents && (
        <>
          <AppText variant="heading">Ajouter mon conjoint</AppText>
          <View style={s.formGrid}>
            <View style={s.field}>
              <Field
                label="Nom du conjoint"
                value={name}
                onChangeText={setName}
                maxLength={80}
                editable={online && !busy}
                testID="settings-spouse-name"
              />
            </View>
            <View style={s.field}>
              <Field
                label="E-mail du conjoint"
                value={email}
                onChangeText={setEmail}
                maxLength={254}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                editable={online && !busy}
                testID="settings-spouse-email"
              />
            </View>
          </View>
          <View style={s.formGrid}>
            <View style={s.field}>
              <PasswordField
                label="Mot de passe du conjoint"
                value={password}
                onChangeText={setPassword}
                maxLength={256}
                textContentType="newPassword"
                editable={online && !busy}
                testID="settings-spouse-password"
              />
            </View>
            <View style={s.field}>
              <PasswordField
                label="Confirmer son mot de passe"
                value={confirmation}
                onChangeText={setConfirmation}
                maxLength={256}
                textContentType="newPassword"
                editable={online && !busy}
                testID="settings-spouse-confirm"
              />
            </View>
          </View>
          <PasswordField
            label="Votre mot de passe actuel"
            value={currentPassword}
            onChangeText={setCurrentPassword}
            maxLength={256}
            textContentType="password"
            editable={online && !busy}
            testID="settings-spouse-current-password"
          />
          <Button
            icon="plus"
            disabled={!online || busy}
            onPress={() => void save()}
            testID="settings-spouse-save"
          >
            {busy ? "Création…" : "Créer le compte de mon conjoint"}
          </Button>
        </>
      )}
    </Card>
  );
}
