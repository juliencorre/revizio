import { useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import {
  AppIcon,
  AppText,
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeading,
} from "@/components/ui";
import {
  Field,
  Notice,
  ParentLayout,
  parentStyles,
} from "@/features/parent/shared";
import { colors, neumorphic } from "@/theme";
import { apiFetch, type SessionResponse } from "@/services/api";
import { useSession } from "@/state/session";
import { useLearning } from "@/state/learning-store";
import {
  PasswordField,
  ServerConnectionCard,
  accountStyles as s,
  emailIsValid,
  errorMessage,
  needsPin,
  pinIsValid,
} from "./shared";
import {
  exportJsonBackup,
  pickJsonBackup,
  type BackupSelection,
} from "./backup";

type AiSettings = { baseUrl: string; model: string; available: boolean };
type Feedback = {
  section: string;
  error?: string;
  message?: string;
  warning?: boolean;
} | null;

export function ParentSettingsScreen() {
  const session = useSession();
  const learning = useLearning();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const busyRef = useRef<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [profileName, setProfileName] = useState("");
  const [grade, setGrade] = useState("5e");
  const [pin, setPin] = useState("");
  const [deleteProfileId, setDeleteProfileId] = useState<string | null>(null);
  const [deleteProfileConfirm, setDeleteProfileConfirm] = useState("");
  const [accountName, setAccountName] = useState(session.user?.name ?? "");
  const [accountEmail, setAccountEmail] = useState(session.user?.email ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [ai, setAi] = useState<AiSettings | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [model, setModel] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [restore, setRestore] = useState<BackupSelection | null>(null);
  const [restoreConfirm, setRestoreConfirm] = useState("");
  const [deleteFamily, setDeleteFamily] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [resetDemo, setResetDemo] = useState(false);
  const familyParent =
    session.mode === "family" && session.user?.role === "parent";
  const online = familyParent && session.serverAvailable && !session.offline;
  const disabled = !!busy;
  const editingProfile = session.profiles.find(
    (profile) => profile.id === editingId,
  );
  const editingNeedsPin = needsPin(editingProfile);
  const deletingProfile = session.profiles.find(
    (profile) => profile.id === deleteProfileId,
  );
  useEffect(() => {
    setAccountName(session.user?.name ?? "");
    setAccountEmail(session.user?.email ?? "");
  }, [session.user?.id, session.user?.name, session.user?.email]);
  useEffect(() => {
    if (!online) return;
    let active = true;
    const controller = new AbortController();
    setAiLoading(true);
    void apiFetch<AiSettings>("/settings", { signal: controller.signal })
      .then(
        (result) => {
          if (active) {
            setAi(result);
            setModel(result.model);
            setBaseUrl(result.baseUrl);
          }
        },
        (caught) => {
          if (active)
            setFeedback({ section: "ai", error: errorMessage(caught) });
        },
      )
      .finally(() => {
        if (active) setAiLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [online, session.user?.id]);
  async function run(section: string, action: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = section;
    setBusy(section);
    setFeedback(null);
    try {
      await action();
    } catch (caught) {
      setFeedback({ section, error: errorMessage(caught) });
    } finally {
      busyRef.current = null;
      setBusy(null);
    }
  }
  function response(section: string) {
    if (feedback?.section !== section) return null;
    return (
      <View testID={"settings-" + section + "-feedback"}>
        <Notice
          error={!!feedback.error}
          success={!!feedback.message && !feedback.warning}
        >
          {feedback.error ?? feedback.message}
        </Notice>
      </View>
    );
  }
  function resetProfileForm() {
    setEditingId(null);
    setProfileName("");
    setGrade("5e");
    setPin("");
  }
  async function saveProfile() {
    if (!profileName.trim())
      throw new Error("Renseignez le prénom de votre enfant.");
    if (!grade.trim()) throw new Error("Indiquez sa classe.");
    if ((!editingId || editingNeedsPin || pin) && !pinIsValid(pin))
      throw new Error("Le code enfant doit contenir de 4 à 8 chiffres.");
    const name = profileName.trim();
    await apiFetch(
      editingId ? "/profiles/" + encodeURIComponent(editingId) : "/profiles",
      {
        method: editingId ? "PATCH" : "POST",
        body: JSON.stringify({
          name,
          grade: grade.trim(),
          ...(!editingId || pin ? { pin } : {}),
        }),
      },
    );
    await session.refreshProfiles();
    await session.refresh();
    resetProfileForm();
    setFeedback({
      section: "profiles",
      message: "Le profil de " + name + " est enregistré.",
    });
  }
  async function removeProfile() {
    if (!deletingProfile || deleteProfileConfirm !== deletingProfile.name)
      throw new Error("Recopiez le prénom pour confirmer la suppression.");
    if (session.profiles.length <= 1)
      throw new Error("Conservez au moins un profil enfant dans votre espace.");
    const name = deletingProfile.name;
    await apiFetch("/profiles/" + encodeURIComponent(deletingProfile.id), {
      method: "DELETE",
    });
    setDeleteProfileId(null);
    setDeleteProfileConfirm("");
    if (editingId === deletingProfile.id) resetProfileForm();
    await session.refreshProfiles();
    await session.refresh();
    setFeedback({
      section: "profiles",
      message: "Le profil de " + name + " a été supprimé.",
    });
  }
  async function saveAccount() {
    if (!accountName.trim()) throw new Error("Renseignez votre nom.");
    if (!emailIsValid(accountEmail))
      throw new Error("Vérifiez votre adresse e-mail.");
    if (!currentPassword)
      throw new Error("Confirmez votre mot de passe actuel.");
    if (newPassword && (newPassword.length < 10 || newPassword.length > 256))
      throw new Error(
        "Le nouveau mot de passe doit contenir de 10 à 256 caractères.",
      );
    if (newPassword !== newPasswordConfirm)
      throw new Error(
        "Les deux nouveaux mots de passe ne sont pas identiques.",
      );
    await apiFetch<SessionResponse>("/account", {
      method: "PATCH",
      body: JSON.stringify({
        parentName: accountName.trim(),
        email: accountEmail.trim().toLowerCase(),
        currentPassword,
        ...(newPassword ? { newPassword } : {}),
      }),
    });
    setCurrentPassword("");
    setNewPassword("");
    setNewPasswordConfirm("");
    await session.refresh();
    setFeedback({
      section: "account",
      message: "Vos informations de connexion sont enregistrées.",
    });
  }
  async function saveAi() {
    let url: URL;
    try {
      url = new URL(baseUrl.trim());
    } catch {
      throw new Error("Vérifiez l’adresse du service IA.");
    }
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new Error(
        "Utilisez une adresse HTTP(S) sans identifiants ni paramètres.",
      );
    if (!model.trim()) throw new Error("Indiquez le nom du modèle à utiliser.");
    const result = await apiFetch<AiSettings>("/settings", {
      method: "PATCH",
      body: JSON.stringify({ baseUrl: baseUrl.trim(), model: model.trim() }),
    });
    setAi(result);
    setBaseUrl(result.baseUrl);
    setModel(result.model);
    await session.refresh();
    setFeedback({
      section: "ai",
      message: result.available
        ? "Le modèle répond. Les prochaines générations utiliseront ces réglages."
        : "Réglages enregistrés. Le modèle ne répond pas encore : vérifiez le service et son installation.",
      warning: !result.available,
    });
  }
  async function exportBackup() {
    const value = await apiFetch<unknown>("/backup");
    const name = await exportJsonBackup(value);
    setFeedback({
      section: "backup",
      message:
        "Sauvegarde préparée : " +
        name +
        ". Choisissez où la conserver sur votre appareil.",
    });
  }
  async function selectBackup() {
    setRestore(null);
    setRestoreConfirm("");
    const selection = await pickJsonBackup();
    if (selection) setRestore(selection);
  }
  async function restoreBackup() {
    if (!restore || restoreConfirm !== "RESTAURER")
      throw new Error("Confirmez la restauration avant de continuer.");
    await apiFetch("/backup/restore", {
      method: "POST",
      body: JSON.stringify({ backup: restore.value }),
    });
    await session.refreshProfiles();
    await session.refresh();
    await learning.reloadFromServer();
    setRestore(null);
    setRestoreConfirm("");
    resetProfileForm();
    setFeedback({
      section: "backup",
      message:
        "La sauvegarde est restaurée. Vérifiez les profils et définissez les codes indiqués « Code à définir ».",
    });
  }
  async function removeFamily() {
    if (deleteConfirm !== "SUPPRIMER" || !deletePassword)
      throw new Error("Confirmez le mot de passe et recopiez SUPPRIMER.");
    await apiFetch("/family", {
      method: "DELETE",
      body: JSON.stringify({ password: deletePassword }),
    });
    setDeletePassword("");
    setDeleteConfirm("");
    await session.logout();
    router.replace("/");
  }
  if (session.mode === "demo")
    return (
      <ParentLayout active="settings">
        <PageHeading
          title="Les réglages"
          description="Vous explorez Révizo avec un profil de démonstration."
        />
        <Notice>
          Les exemples et les résultats de cette démonstration sont enregistrés
          sur cet appareil. Un espace familial permet de protéger les accès et
          de conserver les documents sur le serveur.
        </Notice>
        <Card style={{ gap: 18 }}>
          <AppText variant="heading">
            Créer ou rejoindre votre espace familial
          </AppText>
          <AppText color={colors.muted}>
            Connectez-vous pour préparer les vrais cours et les partager avec
            vos enfants.
          </AppText>
          <Button
            icon="lock"
            onPress={() => router.push("/auth?target=parent")}
            testID="settings-connect"
          >
            Connexion familiale
          </Button>
        </Card>
        <Card style={{ gap: 18 }}>
          <AppText variant="heading">Repartir des exemples</AppText>
          <AppText color={colors.muted}>
            La réinitialisation supprime les cours, exercices et résultats
            ajoutés dans cette démonstration.
          </AppText>
          {resetDemo ? (
            <View style={{ gap: 16 }}>
              <Notice>
                Confirmez pour effacer les changements de la démonstration et
                retrouver les exemples de départ.
              </Notice>
              <View style={s.row}>
                <Button
                  variant="danger"
                  icon="refresh"
                  onPress={() => {
                    learning.resetDemo();
                    setResetDemo(false);
                  }}
                  testID="settings-demo-reset-confirm"
                >
                  Confirmer la réinitialisation
                </Button>
                <Button variant="ghost" onPress={() => setResetDemo(false)}>
                  Annuler
                </Button>
              </View>
            </View>
          ) : (
            <Button
              variant="danger"
              icon="refresh"
              onPress={() => setResetDemo(true)}
              testID="settings-demo-reset"
            >
              Réinitialiser la démonstration
            </Button>
          )}
        </Card>
        <ServerConnectionCard testPrefix="settings" />
        <Button
          variant="ghost"
          icon="logout"
          onPress={() => void session.logout().then(() => router.replace("/"))}
        >
          Quitter la démonstration
        </Button>
      </ParentLayout>
    );
  if (!familyParent)
    return (
      <ParentLayout active="settings">
        <EmptyState
          icon="lock"
          title="Les réglages sont réservés à un parent"
          description="Connectez-vous à votre compte parent pour gérer l’espace familial."
        >
          <Button
            icon="lock"
            onPress={() => router.replace("/auth?target=parent")}
          >
            Connexion parent
          </Button>
        </EmptyState>
      </ParentLayout>
    );
  return (
    <ParentLayout active="settings">
      <View testID="settings-screen" style={{ gap: 28 }}>
        <PageHeading
          eyebrow="Votre espace familial"
          title="Les réglages de la famille"
          description="Gérez les profils, les connexions et les sauvegardes de vos enfants."
          action={
            <Button
              variant="ghost"
              icon="logout"
              onPress={() =>
                void run("logout", async () => {
                  await session.logout();
                  router.replace("/");
                })
              }
              disabled={disabled || !online}
              testID="settings-logout"
            >
              Me déconnecter
            </Button>
          }
        />
        {response("logout")}
        {!online && (
          <Notice>
            La connexion au serveur est interrompue. Vous pourrez modifier les
            réglages et les sauvegardes dès le retour de la connexion.
          </Notice>
        )}
        <View style={s.columns}>
          <Card style={s.column}>
            <View style={s.row}>
              <AppIcon name="users" />
              <AppText variant="heading" style={{ flex: 1 }}>
                Les profils enfants
              </AppText>
              <Badge>{session.profiles.length} / 12</Badge>
            </View>
            <AppText color={colors.muted}>
              Choisissez le profil dont vous préparez les cours. Chaque enfant
              dispose de son propre code.
            </AppText>
            {session.profiles.map((profile) => (
              <View
                key={profile.id}
                style={{ gap: 13 }}
                testID={"settings-profile-" + profile.id}
              >
                <Pressable
                  accessibilityRole="radio"
                  accessibilityLabel={"Préparer les cours de " + profile.name}
                  accessibilityState={{
                    checked: session.activeProfileId === profile.id,
                  }}
                  disabled={disabled}
                  testID={"settings-active-profile-" + profile.id}
                  onPress={() => session.selectProfile(profile.id)}
                  style={({ pressed }) => [
                    parentStyles.choice,
                    (pressed || session.activeProfileId === profile.id) &&
                      neumorphic.inset,
                    session.activeProfileId === profile.id && {
                      borderColor: colors.primary,
                    },
                  ]}
                >
                  <AppIcon
                    name={
                      session.activeProfileId === profile.id ? "check" : "book"
                    }
                  />
                  <View style={{ flex: 1, gap: 3 }}>
                    <AppText variant="label">{profile.name}</AppText>
                    <AppText variant="small" color={colors.muted}>
                      {profile.grade}
                    </AppText>
                  </View>
                  {needsPin(profile) && (
                    <Badge tone="orange">Code à définir</Badge>
                  )}
                </Pressable>
                <View style={s.row}>
                  <Button
                    variant="ghost"
                    icon="pencil"
                    onPress={() => {
                      setEditingId(profile.id);
                      setProfileName(profile.name);
                      setGrade(profile.grade);
                      setPin("");
                      setFeedback(null);
                    }}
                    disabled={disabled || !online}
                    accessibilityLabel={"Modifier le profil de " + profile.name}
                    testID={"settings-edit-profile-" + profile.id}
                  >
                    Modifier
                  </Button>
                  <Button
                    variant="danger"
                    icon="trash"
                    onPress={() => {
                      setDeleteProfileId(profile.id);
                      setDeleteProfileConfirm("");
                      setFeedback(null);
                    }}
                    disabled={
                      disabled || !online || session.profiles.length <= 1
                    }
                    accessibilityLabel={
                      "Supprimer le profil de " + profile.name
                    }
                    testID={"settings-delete-profile-" + profile.id}
                  >
                    Supprimer
                  </Button>
                </View>
              </View>
            ))}
            {session.profiles.length <= 1 && (
              <AppText variant="small" color={colors.muted}>
                Conservez au moins un profil enfant. Vous pouvez modifier son
                prénom, sa classe et son code.
              </AppText>
            )}
            {response("profiles")}
          </Card>
          <Card style={s.column}>
            <AppText variant="heading">
              {editingId ? "Modifier un profil" : "Ajouter un profil enfant"}
            </AppText>
            <Field
              label="Prénom de l’enfant"
              value={profileName}
              onChangeText={setProfileName}
              maxLength={80}
              editable={!disabled && online}
              testID="settings-profile-name"
            />
            <Field
              label="Classe"
              value={grade}
              onChangeText={setGrade}
              maxLength={32}
              editable={!disabled && online}
              testID="settings-profile-grade"
            />
            <PasswordField
              label={
                editingId && !editingNeedsPin
                  ? "Nouveau code enfant (facultatif)"
                  : "Code enfant"
              }
              value={pin}
              onChangeText={(value) => setPin(value.replace(/\D/g, ""))}
              maxLength={8}
              keyboardType="number-pad"
              editable={!disabled && online}
              testID="settings-profile-pin"
            />
            <AppText variant="small" color={colors.muted}>
              {editingId && !editingNeedsPin
                ? "Laissez le code vide pour conserver le code actuel. Un nouveau code contient 4 à 8 chiffres."
                : "Choisissez un code de 4 à 8 chiffres avec votre enfant."}
            </AppText>
            <View style={s.row}>
              <Button
                icon={editingId ? "check" : "plus"}
                onPress={() => void run("profiles", saveProfile)}
                disabled={
                  disabled ||
                  !online ||
                  (!editingId && session.profiles.length >= 12)
                }
                testID="settings-profile-save"
              >
                {busy === "profiles"
                  ? "Enregistrement…"
                  : editingId
                    ? "Enregistrer le profil"
                    : "Ajouter le profil"}
              </Button>
              {editingId && (
                <Button
                  variant="ghost"
                  onPress={resetProfileForm}
                  disabled={disabled}
                >
                  Annuler la modification
                </Button>
              )}
            </View>
          </Card>
        </View>
        {deletingProfile && (
          <Card
            inset
            style={{ gap: 18, borderColor: colors.danger }}
            testID="settings-profile-delete-confirmation"
          >
            <AppText variant="heading" color={colors.danger}>
              Supprimer le profil de {deletingProfile.name} ?
            </AppText>
            <AppText>
              Ses cours, ses documents et ses résultats seront supprimés. Cette
              action est définitive.
            </AppText>
            <Field
              label={"Recopiez " + deletingProfile.name + " pour confirmer"}
              value={deleteProfileConfirm}
              onChangeText={setDeleteProfileConfirm}
              autoCorrect={false}
              editable={!disabled}
              testID="settings-profile-delete-name"
            />
            <View style={s.row}>
              <Button
                variant="danger"
                icon="trash"
                disabled={
                  disabled ||
                  !online ||
                  deleteProfileConfirm !== deletingProfile.name
                }
                onPress={() => void run("profiles", removeProfile)}
                testID="settings-profile-delete-confirm"
              >
                Supprimer définitivement ce profil
              </Button>
              <Button
                variant="ghost"
                disabled={disabled}
                onPress={() => {
                  setDeleteProfileId(null);
                  setDeleteProfileConfirm("");
                }}
              >
                Annuler
              </Button>
            </View>
          </Card>
        )}
        <Card style={{ gap: 20 }}>
          <View style={s.row}>
            <AppIcon name="lock" />
            <AppText variant="heading">Votre compte parent</AppText>
          </View>
          <View style={s.formGrid}>
            <View style={s.field}>
              <Field
                label="Votre nom"
                value={accountName}
                onChangeText={setAccountName}
                maxLength={80}
                editable={!disabled && online}
                testID="settings-account-name"
              />
            </View>
            <View style={s.field}>
              <Field
                label="Adresse e-mail parent"
                value={accountEmail}
                onChangeText={setAccountEmail}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                maxLength={254}
                editable={!disabled && online}
                testID="settings-account-email"
              />
            </View>
          </View>
          <PasswordField
            label="Mot de passe actuel"
            value={currentPassword}
            onChangeText={setCurrentPassword}
            maxLength={256}
            textContentType="password"
            editable={!disabled && online}
            testID="settings-account-current-password"
          />
          <View style={s.formGrid}>
            <View style={s.field}>
              <PasswordField
                label="Nouveau mot de passe (facultatif)"
                value={newPassword}
                onChangeText={setNewPassword}
                maxLength={256}
                textContentType="newPassword"
                editable={!disabled && online}
                testID="settings-account-new-password"
              />
            </View>
            <View style={s.field}>
              <PasswordField
                label="Confirmer le nouveau mot de passe"
                value={newPasswordConfirm}
                onChangeText={setNewPasswordConfirm}
                maxLength={256}
                textContentType="newPassword"
                editable={!disabled && online}
                testID="settings-account-password-confirm"
              />
            </View>
          </View>
          <AppText variant="small" color={colors.muted}>
            Confirmez le mot de passe actuel pour enregistrer vos informations.
            Un nouveau mot de passe contient au moins 10 caractères.
          </AppText>
          {response("account")}
          <Button
            icon="save"
            onPress={() => void run("account", saveAccount)}
            disabled={disabled || !online}
            testID="settings-account-save"
          >
            {busy === "account" ? "Enregistrement…" : "Enregistrer mon compte"}
          </Button>
        </Card>
        <Card style={{ gap: 20 }}>
          <View style={s.row}>
            <AppIcon name="sparkles" />
            <AppText variant="heading" style={{ flex: 1 }}>
              L’IA pour préparer les cours
            </AppText>
            <Badge tone={ai?.available ? "green" : "orange"}>
              {aiLoading
                ? "Vérification…"
                : ai?.available
                  ? "Modèle disponible"
                  : "Modèle à vérifier"}
            </Badge>
          </View>
          <AppText color={colors.muted}>
            Les prochaines générations utiliseront ce service et ce modèle.
            Votre relecture reste nécessaire avant de publier une fiche ou une
            série.
          </AppText>
          <View style={s.formGrid}>
            <View style={s.field}>
              <Field
                label="Adresse du service IA"
                value={baseUrl}
                onChangeText={setBaseUrl}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                placeholder="http://127.0.0.1:11434"
                maxLength={500}
                editable={!disabled && !aiLoading && online}
                testID="settings-ai-url"
              />
            </View>
            <View style={s.field}>
              <Field
                label="Modèle IA"
                value={model}
                onChangeText={setModel}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="ministral-3:8b"
                maxLength={120}
                editable={!disabled && !aiLoading && online}
                testID="settings-ai-model"
              />
            </View>
          </View>
          {response("ai")}
          <Button
            icon="check"
            onPress={() => void run("ai", saveAi)}
            disabled={disabled || !online || aiLoading}
            testID="settings-ai-save"
          >
            {busy === "ai"
              ? "Vérification du modèle…"
              : "Enregistrer et tester le modèle"}
          </Button>
        </Card>
        <Card style={{ gap: 20 }}>
          <View style={s.row}>
            <AppIcon name="download" />
            <AppText variant="heading">Vos sauvegardes</AppText>
          </View>
          <AppText color={colors.muted}>
            Une sauvegarde regroupe les profils, les cours, les documents et les
            résultats. Elle ne contient pas les mots de passe ni les codes
            enfants.
          </AppText>
          <View style={s.row}>
            <Button
              icon="download"
              onPress={() => void run("backup", exportBackup)}
              disabled={disabled || !online}
              testID="settings-backup-export"
            >
              {busy === "backup" ? "Préparation…" : "Exporter la sauvegarde"}
            </Button>
            <Button
              variant="secondary"
              icon="upload"
              onPress={() => void run("backup", selectBackup)}
              disabled={disabled || !online}
              testID="settings-backup-import"
            >
              Choisir une sauvegarde à restaurer
            </Button>
          </View>
          {restore && (
            <Card
              inset
              style={{ gap: 18, borderColor: colors.orange }}
              testID="settings-restore-review"
            >
              <AppText variant="heading">Vérifier la restauration</AppText>
              <AppText variant="label">{restore.name}</AppText>
              <AppText>
                {restore.profiles} profil{restore.profiles > 1 ? "s" : ""} ·{" "}
                {restore.courses} cours · {restore.documents} document
                {restore.documents > 1 ? "s" : ""}
              </AppText>
              <Notice>
                La restauration remplacera tous les profils, cours, documents et
                résultats de cet espace. Le compte parent est conservé. Les
                profils récupérés sans code connu devront recevoir un nouveau
                code enfant.
              </Notice>
              <Field
                label="Tapez RESTAURER pour confirmer"
                value={restoreConfirm}
                onChangeText={setRestoreConfirm}
                autoCapitalize="characters"
                autoCorrect={false}
                editable={!disabled}
                testID="settings-restore-confirm-text"
              />
              <View style={s.row}>
                <Button
                  variant="orange"
                  icon="refresh"
                  onPress={() => void run("backup", restoreBackup)}
                  disabled={
                    disabled || !online || restoreConfirm !== "RESTAURER"
                  }
                  testID="settings-restore-confirm"
                >
                  {busy === "backup"
                    ? "Restauration…"
                    : "Remplacer par cette sauvegarde"}
                </Button>
                <Button
                  variant="ghost"
                  onPress={() => {
                    setRestore(null);
                    setRestoreConfirm("");
                  }}
                  disabled={disabled}
                >
                  Annuler la restauration
                </Button>
              </View>
            </Card>
          )}
          {response("backup")}
        </Card>
        <ServerConnectionCard testPrefix="settings" />
        <Card style={{ gap: 20, backgroundColor: colors.dangerLight }}>
          <View style={s.row}>
            <AppIcon name="trash" color={colors.danger} />
            <AppText variant="heading" color={colors.danger}>
              Supprimer l’espace familial
            </AppText>
          </View>
          <AppText>
            Cette action efface les comptes, les profils, les cours, les
            documents et les résultats enregistrés sur le serveur. Elle est
            définitive.
          </AppText>
          {deleteFamily ? (
            <View
              style={{ gap: 18 }}
              testID="settings-family-delete-confirmation"
            >
              <PasswordField
                label="Mot de passe parent pour supprimer l’espace"
                value={deletePassword}
                onChangeText={setDeletePassword}
                maxLength={256}
                editable={!disabled}
                testID="settings-delete-password"
              />
              <Field
                label="Tapez SUPPRIMER pour confirmer"
                value={deleteConfirm}
                onChangeText={setDeleteConfirm}
                autoCapitalize="characters"
                autoCorrect={false}
                editable={!disabled}
                testID="settings-delete-confirm-text"
              />
              {response("delete")}
              <View style={s.row}>
                <Button
                  variant="danger"
                  icon="trash"
                  onPress={() => void run("delete", removeFamily)}
                  disabled={
                    disabled ||
                    !online ||
                    deleteConfirm !== "SUPPRIMER" ||
                    !deletePassword
                  }
                  testID="settings-delete-confirm"
                >
                  {busy === "delete"
                    ? "Suppression…"
                    : "Supprimer définitivement l’espace familial"}
                </Button>
                <Button
                  variant="ghost"
                  onPress={() => {
                    setDeleteFamily(false);
                    setDeletePassword("");
                    setDeleteConfirm("");
                  }}
                  disabled={disabled}
                >
                  Annuler
                </Button>
              </View>
            </View>
          ) : (
            <Button
              variant="danger"
              icon="trash"
              onPress={() => {
                setDeleteFamily(true);
                setFeedback(null);
              }}
              disabled={disabled || !online}
              testID="settings-delete-family"
            >
              Supprimer l’espace familial
            </Button>
          )}
        </Card>
      </View>
    </ParentLayout>
  );
}
