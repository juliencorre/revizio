import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Platform } from "react-native";
import { registerOfflineShell } from "@/services/offline-shell";

type InstallPrompt = Event & {
  prompt(): Promise<{ outcome: "accepted" | "dismissed" }>;
};
type InstallStatus = "idle" | "prompting" | "accepted" | "dismissed" | "error";
type PwaState = {
  available: boolean;
  secure: boolean;
  installed: boolean;
  ios: boolean;
  canInstall: boolean;
  offline: "preparing" | "ready" | "unavailable";
  updateAvailable: boolean;
  installStatus: InstallStatus;
};
const initialState: PwaState = {
  available: false,
  secure: false,
  installed: false,
  ios: false,
  canInstall: false,
  offline: "preparing",
  updateAvailable: false,
  installStatus: "idle",
};
const PwaContext = createContext<
  (PwaState & { install(): Promise<void> }) | null
>(null);

/** Keep browser events alive across navigation, including the one-use install prompt. */
export function PwaProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(initialState);
  const prompt = useRef<InstallPrompt | null>(null);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    let disposed = false;
    const cleanups: (() => void)[] = [];
    const change = (patch: Partial<PwaState>) => {
      if (!disposed) setState((previous) => ({ ...previous, ...patch }));
    };
    const display = window.matchMedia("(display-mode: standalone)");
    const readDisplay = () => {
      const installed =
        display.matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true;
      change({ installed });
      if (installed) {
        prompt.current = null;
        change({ canInstall: false, installStatus: "idle" });
      }
    };
    change({
      available: true,
      secure: window.isSecureContext,
      // iPadOS can report a desktop Mac user agent.
      ios:
        /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1),
    });
    readDisplay();
    const onPrompt = (event: Event) => {
      event.preventDefault();
      prompt.current = event as InstallPrompt;
      change({ canInstall: true, installStatus: "idle" });
    };
    const onInstalled = () => {
      prompt.current = null;
      change({ installed: true, canInstall: false, installStatus: "idle" });
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    display.addEventListener("change", readDisplay);
    window.addEventListener("pageshow", readDisplay);
    cleanups.push(() => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      display.removeEventListener("change", readDisplay);
      window.removeEventListener("pageshow", readDisplay);
    });

    void registerOfflineShell()
      .then(async (registered) => {
        if (disposed) return;
        if (!registered) {
          change({ offline: "unavailable" });
          return;
        }
        const registration = await navigator.serviceWorker.getRegistration();
        if (disposed) return;
        if (!registration) {
          change({ offline: "unavailable" });
          return;
        }
        const readWorker = () =>
          change({
            offline: registration.active ? "ready" : "preparing",
            updateAvailable: !!registration.waiting,
          });
        const watchWorker = () => {
          readWorker();
          const worker = registration.installing;
          if (!worker) return;
          const onChange = () => {
            readWorker();
            if (worker.state === "redundant" && !registration.active)
              change({ offline: "unavailable" });
          };
          worker.addEventListener("statechange", onChange);
          cleanups.push(() =>
            worker.removeEventListener("statechange", onChange),
          );
        };
        const checkUpdate = () => {
          if (document.visibilityState === "visible" && navigator.onLine)
            void registration.update().catch(() => undefined);
        };
        watchWorker();
        registration.addEventListener("updatefound", watchWorker);
        navigator.serviceWorker.addEventListener(
          "controllerchange",
          readWorker,
        );
        document.addEventListener("visibilitychange", checkUpdate);
        window.addEventListener("online", checkUpdate);
        cleanups.push(() => {
          registration.removeEventListener("updatefound", watchWorker);
          navigator.serviceWorker.removeEventListener(
            "controllerchange",
            readWorker,
          );
          document.removeEventListener("visibilitychange", checkUpdate);
          window.removeEventListener("online", checkUpdate);
        });
        void navigator.serviceWorker.ready.then(readWorker);
      })
      .catch(() => change({ offline: "unavailable" }));

    return () => {
      disposed = true;
      cleanups.forEach((cleanup) => cleanup());
      prompt.current = null;
    };
  }, []);

  async function install() {
    const event = prompt.current;
    if (!event) return;
    // prompt() must be called in the button's user gesture, before any await.
    prompt.current = null;
    setState((previous) => ({
      ...previous,
      canInstall: false,
      installStatus: "prompting",
    }));
    try {
      const choice = await event.prompt();
      setState((previous) => ({ ...previous, installStatus: choice.outcome }));
    } catch {
      setState((previous) => ({ ...previous, installStatus: "error" }));
    }
  }

  return (
    <PwaContext.Provider value={{ ...state, install }}>
      {children}
    </PwaContext.Provider>
  );
}

export function usePwa() {
  const value = useContext(PwaContext);
  if (!value) throw new Error("Le contexte PWA est indisponible.");
  return value;
}
