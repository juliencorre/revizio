import { useEffect, useRef, useState, type ComponentRef } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  AppIcon,
  AppText,
  Badge,
  Brand,
  Button,
  Card,
  PageHeading,
} from "@/components/ui";
import { Field, Notice } from "@/features/parent/shared";
import { colors, neumorphic } from "@/theme";
import { useSession } from "@/state/session";
import {
  PasswordField,
  ServerConnectionCard,
  accountStyles as s,
  emailIsValid,
  errorMessage,
  needsPin,
  pinIsValid,
} from "./shared";

export function AuthScreen() {
  const params = useLocalSearchParams<{
    target?: string;
    profileId?: string;
  }>();
  const target = params.target === "child" ? "child" : "parent";
  const session = useSession();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const [parentName, setParentName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [childName, setChildName] = useState("");
  const [grade, setGrade] = useState("5e");
  const [pin, setPin] = useState("");
  const [profileId, setProfileId] = useState(
    typeof params.profileId === "string" ? params.profileId : "",
  );
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState("");
  const setup = !!session.health?.needsSetup && session.serverAvailable;
  const selected = session.profiles.find((profile) => profile.id === profileId);
  useEffect(() => {
    if (!session.profiles.some((profile) => profile.id === profileId))
      setProfileId(session.profiles[0]?.id ?? "");
  }, [session.profiles, profileId]);
  useEffect(() => {
    if (session.mode === "family" && session.user?.role === target && !setup)
      router.replace(target === "parent" ? "/parent" : "/student");
  }, [session.mode, session.user?.role, target, setup, router]);
  function fail(message: string) {
    setError(message);
    scroll.current?.scrollTo({ y: 0, animated: true });
  }
  async function submit() {
    if (busyRef.current) return;
    setError("");
    if (!session.serverAvailable || session.offline) {
      fail(
        "Connectez-vous au serveur de la famille pour ouvrir cet espace. Vous pouvez vérifier son adresse ci-dessous.",
      );
      return;
    }
    if (setup) {
      if (!parentName.trim() || !childName.trim()) {
        fail("Renseignez votre nom et le prénom de votre enfant.");
        return;
      }
      if (!emailIsValid(email)) {
        fail("Vérifiez votre adresse e-mail.");
        return;
      }
      if (password.length < 10 || password.length > 256) {
        fail("Choisissez un mot de passe de 10 à 256 caractères.");
        return;
      }
      if (password !== confirmation) {
        fail("Les deux mots de passe ne sont pas identiques.");
        return;
      }
      if (!grade.trim()) {
        fail("Indiquez la classe de votre enfant.");
        return;
      }
      if (!pinIsValid(pin)) {
        fail("Le code de votre enfant doit contenir de 4 à 8 chiffres.");
        return;
      }
    } else if (target === "parent") {
      if (!emailIsValid(email) || !password) {
        fail("Renseignez une adresse e-mail valide et votre mot de passe.");
        return;
      }
    } else {
      if (!selected) {
        fail("Choisis ton profil avant de saisir ton code.");
        return;
      }
      if (needsPin(selected)) {
        fail(
          "Un parent doit d’abord définir le code de ce profil dans les réglages.",
        );
        return;
      }
      if (!pinIsValid(pin)) {
        fail("Ton code contient de 4 à 8 chiffres.");
        return;
      }
    }
    busyRef.current = true;
    setBusy(true);
    try {
      if (setup) {
        await session.setup({
          parentName: parentName.trim(),
          email: email.trim().toLowerCase(),
          password,
          childName: childName.trim(),
          grade: grade.trim(),
          pin,
        });
        await session.refresh();
        router.replace("/parent");
      } else if (target === "parent") {
        await session.login(email.trim().toLowerCase(), password);
        router.replace("/parent");
      } else {
        await session.childLogin(profileId, pin);
        router.replace("/student");
      }
    } catch (caught) {
      fail(errorMessage(caught));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  const change = (setter: (value: string) => void) => (value: string) => {
    setter(value);
    setError("");
  };
  if (!session.ready)
    return (
      <View style={styles.loading}>
        <Brand />
        <ActivityIndicator color={colors.primary} />
        <AppText color={colors.muted}>On retrouve votre espace…</AppText>
      </View>
    );
  return (
    <ScrollView
      ref={scroll}
      style={styles.page}
      contentContainerStyle={[
        styles.content,
        { padding: width >= 900 ? 40 : 24 },
      ]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    >
      <View style={styles.top}>
        <Brand />
        <Button
          variant="ghost"
          icon="arrow-left"
          onPress={() => router.replace("/")}
          disabled={busy}
        >
          Choix des profils
        </Button>
      </View>
      <View style={styles.main} testID="auth-screen">
        <PageHeading
          eyebrow={
            setup
              ? "Bienvenue dans votre famille Révizo"
              : target === "parent"
                ? "Espace parent"
                : "Mon espace de révision"
          }
          title={
            setup
              ? "Créons votre espace familial"
              : target === "parent"
                ? "Connexion parent"
                : selected
                  ? "Bonjour " + selected.name
                  : "Bonjour !"
          }
          description={
            setup
              ? "Votre compte prépare les cours. Chaque enfant dispose de son profil et de son code."
              : target === "parent"
                ? "Retrouvez les cours, les exercices et les progrès de vos enfants."
                : "Choisis ton profil et saisis le code préparé avec un parent."
          }
        />
        {error && (
          <View testID="auth-error">
            <Notice error>{error}</Notice>
          </View>
        )}
        {!session.serverAvailable && (
          <Notice>
            Le serveur n’est pas disponible pour le moment. Vérifiez la
            connexion et son adresse ci-dessous, ou parcourez la démonstration.
          </Notice>
        )}
        <Card style={{ gap: 24 }} testID="auth-form">
          {setup ? (
            <>
              <View style={s.row}>
                <AppIcon name="users" />
                <AppText variant="heading">Votre compte parent</AppText>
              </View>
              <View style={s.formGrid}>
                <View style={s.field}>
                  <Field
                    label="Votre nom"
                    value={parentName}
                    onChangeText={change(setParentName)}
                    maxLength={80}
                    autoCapitalize="words"
                    editable={!busy}
                    testID="auth-parent-name"
                  />
                </View>
                <View style={s.field}>
                  <Field
                    label="Adresse e-mail"
                    value={email}
                    onChangeText={change(setEmail)}
                    maxLength={254}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    autoComplete="email"
                    editable={!busy}
                    testID="auth-email"
                  />
                </View>
              </View>
              <View style={s.formGrid}>
                <View style={s.field}>
                  <PasswordField
                    label="Mot de passe parent"
                    value={password}
                    onChangeText={change(setPassword)}
                    maxLength={256}
                    textContentType="newPassword"
                    editable={!busy}
                    testID="auth-password"
                  />
                </View>
                <View style={s.field}>
                  <PasswordField
                    label="Confirmer le mot de passe"
                    value={confirmation}
                    onChangeText={change(setConfirmation)}
                    maxLength={256}
                    textContentType="newPassword"
                    editable={!busy}
                    testID="auth-password-confirm"
                  />
                </View>
              </View>
              <AppText variant="small" color={colors.muted}>
                Au moins 10 caractères pour le mot de passe parent. Il vous sera
                demandé pour accéder aux préparations et aux réglages.
              </AppText>
              <View style={styles.divider} />
              <View style={s.row}>
                <AppIcon name="book" />
                <AppText variant="heading">Le premier profil enfant</AppText>
              </View>
              <View style={s.formGrid}>
                <View style={s.field}>
                  <Field
                    label="Prénom de votre enfant"
                    value={childName}
                    onChangeText={change(setChildName)}
                    maxLength={80}
                    autoCapitalize="words"
                    editable={!busy}
                    testID="auth-child-name"
                  />
                </View>
                <View style={s.field}>
                  <Field
                    label="Classe"
                    value={grade}
                    onChangeText={change(setGrade)}
                    maxLength={32}
                    editable={!busy}
                    testID="auth-grade"
                  />
                </View>
              </View>
              <View style={{ maxWidth: 360, width: "100%" }}>
                <PasswordField
                  label="Code enfant"
                  value={pin}
                  onChangeText={change((value) =>
                    setPin(value.replace(/\D/g, "")),
                  )}
                  maxLength={8}
                  keyboardType="number-pad"
                  editable={!busy}
                  testID="auth-pin"
                  onSubmitEditing={() => void submit()}
                />
              </View>
              <AppText variant="small" color={colors.muted}>
                Choisissez ensemble un code de 4 à 8 chiffres. Vous pourrez
                ajouter d’autres profils dans les réglages.
              </AppText>
            </>
          ) : target === "parent" ? (
            <>
              <Field
                label="Adresse e-mail"
                value={email}
                onChangeText={change(setEmail)}
                maxLength={254}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                autoComplete="email"
                editable={!busy}
                testID="auth-email"
              />
              <PasswordField
                label="Mot de passe parent"
                value={password}
                onChangeText={change(setPassword)}
                maxLength={256}
                textContentType="password"
                editable={!busy}
                testID="auth-password"
                onSubmitEditing={() => void submit()}
                returnKeyType="go"
              />
            </>
          ) : (
            <>
              <View style={{ gap: 14 }}>
                {session.profiles.map((profile) => (
                  <Pressable
                    key={profile.id}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: profile.id === profileId }}
                    accessibilityLabel={"Choisir le profil " + profile.name}
                    testID={"auth-profile-" + profile.id}
                    disabled={busy}
                    onPress={() => {
                      setProfileId(profile.id);
                      setPin("");
                      setError("");
                    }}
                    style={({ pressed }) => [
                      styles.profile,
                      (profile.id === profileId || pressed) && neumorphic.inset,
                      profile.id === profileId && {
                        borderColor: colors.primary,
                      },
                    ]}
                  >
                    <AppIcon
                      name={profile.id === profileId ? "check" : "book"}
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
                ))}
              </View>
              {!session.profiles.length && (
                <Notice>
                  Un parent doit créer le premier profil enfant pour commencer.
                </Notice>
              )}
              {selected && needsPin(selected) && (
                <Notice>
                  Un parent doit définir ton code dans les réglages avant ta
                  première connexion.
                </Notice>
              )}
              <PasswordField
                label="Ton code"
                value={pin}
                onChangeText={change((value) =>
                  setPin(value.replace(/\D/g, "")),
                )}
                maxLength={8}
                keyboardType="number-pad"
                editable={!busy}
                testID="auth-pin"
                onSubmitEditing={() => void submit()}
                returnKeyType="go"
              />
            </>
          )}
          <Button
            icon={setup ? "plus" : "lock"}
            onPress={() => void submit()}
            disabled={
              busy ||
              (!setup &&
                target === "child" &&
                (!selected || needsPin(selected)))
            }
            testID="auth-submit"
          >
            {busy
              ? "Connexion en cours…"
              : setup
                ? "Créer notre espace"
                : target === "parent"
                  ? "Me connecter"
                  : "Entrer dans mon espace"}
          </Button>
          {!setup && (
            <View style={s.row}>
              {target === "child" ? (
                <Button
                  variant="ghost"
                  icon="users"
                  onPress={() => router.replace("/auth?target=parent")}
                  disabled={busy}
                  testID="auth-switch-parent"
                >
                  Je suis un parent
                </Button>
              ) : (
                session.profiles.length > 0 && (
                  <Button
                    variant="ghost"
                    icon="book"
                    onPress={() => router.replace("/auth?target=child")}
                    disabled={busy}
                    testID="auth-switch-child"
                  >
                    Ouvrir un espace enfant
                  </Button>
                )
              )}
            </View>
          )}
        </Card>
        <ServerConnectionCard initiallyExpanded={!session.serverAvailable} />
        <View style={{ gap: 12, alignItems: "center" }}>
          <AppText
            variant="small"
            color={colors.muted}
            style={{ textAlign: "center" }}
          >
            Pour découvrir Révizo avec des cours d’exemple, vous pouvez aussi
            ouvrir la démonstration.
          </AppText>
          <Button
            variant="ghost"
            icon="play"
            onPress={() => {
              void session.enterDemo().then(() => router.replace("/"));
            }}
            disabled={busy}
            testID="auth-demo"
          >
            Essayer la démonstration
          </Button>
        </View>
      </View>
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  content: {
    flexGrow: 1,
    width: "100%",
    maxWidth: 1160,
    alignSelf: "center",
    gap: 32,
  },
  top: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 18,
    flexWrap: "wrap",
  },
  main: {
    width: "100%",
    maxWidth: 920,
    alignSelf: "center",
    gap: 26,
    paddingBottom: 28,
  },
  divider: { height: 1, backgroundColor: colors.border },
  profile: {
    ...neumorphic.small,
    minHeight: 70,
    borderRadius: 20,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: 24 },
});
