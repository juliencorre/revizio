import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { AppState, Platform } from "react-native";
import type { ChildProfile, SessionUser } from "@/domain/model";
import {
  apiFetch,
  ApiError,
  initializeApi,
  rememberToken,
  type ServerHealth,
  type SessionResponse,
} from "@/services/api";

type Mode = "choose" | "demo" | "family";
interface SessionContextValue {
  ready: boolean;
  mode: Mode;
  user: SessionUser | null;
  profiles: ChildProfile[];
  activeProfileId: string;
  childName: string;
  childGrade: string;
  serverAvailable: boolean;
  health: ServerHealth | null;
  offline: boolean;
  enterDemo(): Promise<void>;
  login(email: string, password: string): Promise<void>;
  childLogin(profileId: string, pin: string): Promise<void>;
  setup(input: {
    parentName: string;
    email: string;
    password: string;
    childName: string;
    grade: string;
    pin: string;
  }): Promise<void>;
  logout(): Promise<void>;
  selectProfile(id: string): void;
  refresh(): Promise<void>;
  refreshProfiles(): Promise<void>;
}
const SessionContext = createContext<SessionContextValue | null>(null);
const CACHE_KEY = "revizo.family-session";
const MODE_KEY = "revizo.mode";
const DEMO_PROFILE = { id: "alex", name: "Alex", grade: "5e" };
export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<Mode>("choose");
  const [user, setUser] = useState<SessionUser | null>(null);
  const [profiles, setProfiles] = useState<ChildProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState("alex");
  const [health, setHealth] = useState<ServerHealth | null>(null);
  const [serverAvailable, setServerAvailable] = useState(false);
  const [offline, setOffline] = useState(false);
  const accept = useCallback(async (response: SessionResponse) => {
    await rememberToken(response.token);
    setUser(response.user);
    setProfiles(response.profiles);
    const selected = response.user.profileId ?? response.profiles[0]?.id ?? "";
    setActiveProfileId(selected);
    setMode("family");
    setOffline(false);
    setServerAvailable(true);
    await AsyncStorage.multiSet([
      [MODE_KEY, "family"],
      [
        CACHE_KEY,
        JSON.stringify({
          user: response.user,
          profiles: response.profiles,
          activeProfileId: selected,
          savedAt: Date.now(),
        }),
      ],
    ]);
  }, []);
  const refreshProfiles = useCallback(async () => {
    const response = await apiFetch<{ profiles: ChildProfile[] }>("/profiles");
    setProfiles(response.profiles);
  }, []);
  const refresh = useCallback(async () => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);
      let server: ServerHealth;
      try {
        server = await apiFetch<ServerHealth>("/health", {
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }
      setHealth(server);
      setServerAvailable(true);
      setOffline(false);
      const savedMode = await AsyncStorage.getItem(MODE_KEY);
      if (savedMode === "demo") {
        setMode("demo");
        setUser(null);
        setProfiles([DEMO_PROFILE]);
        setActiveProfileId("alex");
        return;
      }
      const profileResponse = await apiFetch<{ profiles: ChildProfile[] }>(
        "/profiles",
      );
      setProfiles(profileResponse.profiles);
      try {
        const response = await apiFetch<SessionResponse>("/session");
        setUser(response.user);
        setProfiles(response.profiles);
        setMode("family");
        const previous = JSON.parse(
          (await AsyncStorage.getItem(CACHE_KEY)) || "null",
        );
        const selected =
          response.user.profileId ??
          (response.profiles.some(
            (item) => item.id === previous?.activeProfileId,
          )
            ? previous.activeProfileId
            : (response.profiles[0]?.id ?? ""));
        setActiveProfileId(selected);
        await AsyncStorage.multiSet([
          [MODE_KEY, "family"],
          [
            CACHE_KEY,
            JSON.stringify({
              user: response.user,
              profiles: response.profiles,
              activeProfileId: selected,
              savedAt: Date.now(),
            }),
          ],
        ]);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          setUser(null);
          setMode("choose");
          await AsyncStorage.removeItem(CACHE_KEY);
        } else throw error;
      }
    } catch {
      setServerAvailable(false);
      setOffline(true);
      const savedMode = await AsyncStorage.getItem(MODE_KEY).catch(() => null);
      if (savedMode === "demo") {
        setMode("demo");
        setUser(null);
        setProfiles([DEMO_PROFILE]);
        setActiveProfileId("alex");
      } else {
        try {
          const cached = JSON.parse(
            (await AsyncStorage.getItem(CACHE_KEY)) || "null",
          );
          if (
            cached?.user &&
            Array.isArray(cached.profiles) &&
            Date.now() - cached.savedAt <
              (cached.user.role === "child" ? 1 : 7) * 86400000
          ) {
            setMode("family");
            setUser(cached.user);
            setProfiles(cached.profiles);
            setActiveProfileId(cached.activeProfileId);
          } else {
            setMode("choose");
            setUser(null);
          }
        } catch {
          setMode("choose");
          setUser(null);
        }
      }
    } finally {
      setReady(true);
    }
  }, []);
  useEffect(() => {
    void initializeApi().then(refresh);
  }, [refresh]);
  useEffect(() => {
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh();
    });
    const online = () => {
      void refresh();
    };
    const lost = () => setOffline(true);
    if (Platform.OS === "web") {
      window.addEventListener("online", online);
      window.addEventListener("offline", lost);
    }
    return () => {
      listener.remove();
      if (Platform.OS === "web") {
        window.removeEventListener("online", online);
        window.removeEventListener("offline", lost);
      }
    };
  }, [refresh]);
  const enterDemo = useCallback(async () => {
    await AsyncStorage.setItem(MODE_KEY, "demo");
    setMode("demo");
    setUser(null);
    setProfiles([DEMO_PROFILE]);
    setActiveProfileId("alex");
  }, []);
  const login = useCallback(
    async (email: string, password: string) => {
      await accept(
        await apiFetch<SessionResponse>("/login", {
          method: "POST",
          body: JSON.stringify({ email, password }),
        }),
      );
    },
    [accept],
  );
  const childLogin = useCallback(
    async (profileId: string, pin: string) => {
      await accept(
        await apiFetch<SessionResponse>("/child-login", {
          method: "POST",
          body: JSON.stringify({ profileId, pin }),
        }),
      );
    },
    [accept],
  );
  const setup = useCallback(
    async (input: Parameters<SessionContextValue["setup"]>[0]) => {
      await accept(
        await apiFetch<SessionResponse>("/setup", {
          method: "POST",
          body: JSON.stringify(input),
        }),
      );
    },
    [accept],
  );
  const logout = useCallback(async () => {
    try {
      if (mode === "family") await apiFetch("/logout", { method: "POST" });
    } catch {}
    await rememberToken();
    await AsyncStorage.multiRemove([MODE_KEY, CACHE_KEY]);
    if (user) {
      const keys = await AsyncStorage.getAllKeys();
      await AsyncStorage.multiRemove(
        keys.filter((key) =>
          key.startsWith("revizo.family." + user.familyId + "."),
        ),
      );
    }
    setUser(null);
    setMode("choose");
    setActiveProfileId("");
    await refresh();
  }, [mode, user, refresh]);
  const selectProfile = useCallback(
    (id: string) => {
      if (
        !profiles.some((profile) => profile.id === id) ||
        (user?.role === "child" && user.profileId !== id)
      )
        return;
      setActiveProfileId(id);
      void AsyncStorage.getItem(CACHE_KEY)
        .then((raw) => {
          if (raw) {
            const cached = JSON.parse(raw);
            return AsyncStorage.setItem(
              CACHE_KEY,
              JSON.stringify({ ...cached, activeProfileId: id }),
            );
          }
        })
        .catch(() => undefined);
    },
    [profiles, user],
  );
  const active = profiles.find((profile) => profile.id === activeProfileId);
  const value = useMemo(
    () => ({
      ready,
      mode,
      user,
      profiles,
      activeProfileId,
      childName: active?.name ?? "Votre enfant",
      childGrade: active?.grade ?? "5e",
      serverAvailable,
      health,
      offline,
      enterDemo,
      login,
      childLogin,
      setup,
      logout,
      selectProfile,
      refresh,
      refreshProfiles,
    }),
    [
      ready,
      mode,
      user,
      profiles,
      activeProfileId,
      active,
      serverAvailable,
      health,
      offline,
      enterDemo,
      login,
      childLogin,
      setup,
      logout,
      selectProfile,
      refresh,
      refreshProfiles,
    ],
  );
  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}
export function useSession() {
  const session = useContext(SessionContext);
  if (!session) throw new Error("SessionProvider manquant.");
  return session;
}
