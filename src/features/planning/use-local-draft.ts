import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { AppState, Platform } from "react-native";

/** Local editor drafts are separate from the content explicitly published by a parent. */
export function useLocalDraft<T>(
  key: string,
  fallback: T,
  accept: (value: unknown) => value is T,
): [
  T,
  Dispatch<SetStateAction<T>>,
  { ready: boolean; error: string | null; clear: () => Promise<void> },
] {
  const fallbackRef = useRef(fallback);
  fallbackRef.current = fallback;
  const acceptRef = useRef(accept);
  acceptRef.current = accept;
  const [value, setValue] = useState(fallback);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valueRef = useRef(value);
  valueRef.current = value;
  const loadedKey = useRef<string | null>(null);
  const activeKey = useRef(key);
  activeKey.current = key;
  const writes = useRef<Promise<void>>(Promise.resolve());
  const persist = useCallback((storageKey: string, next: T) => {
    const content = JSON.stringify(next);
    const saved = () => {
      if (activeKey.current === storageKey) setError(null);
    };
    const failed = () => {
      if (activeKey.current === storageKey)
        setError(
          "Le brouillon n’a pas pu être sauvegardé. Gardez cette page ouverte.",
        );
    };
    // Web storage must finish before reload/pagehide can tear down this page.
    if (Platform.OS === "web" && typeof window !== "undefined") {
      try {
        window.localStorage.setItem(storageKey, content);
        saved();
      } catch {
        failed();
      }
      return;
    }
    // Native writes complete asynchronously. Keep their order when typing quickly.
    writes.current = writes.current
      .catch(() => undefined)
      .then(() => AsyncStorage.setItem(storageKey, content))
      .then(saved, failed);
  }, []);
  const changeValue = useCallback<Dispatch<SetStateAction<T>>>(
    (update) => {
      const next =
        typeof update === "function"
          ? (update as (current: T) => T)(valueRef.current)
          : update;
      valueRef.current = next;
      if (loadedKey.current === key) persist(key, next);
      setValue(() => next);
    },
    [key, persist],
  );
  useEffect(() => {
    let active = true;
    setReady(false);
    loadedKey.current = null;
    void writes.current
      .then(() => AsyncStorage.getItem(key))
      .then(
        (raw) => {
          if (!active) return;
          let loaded = fallbackRef.current;
          if (raw) {
            try {
              const parsed: unknown = JSON.parse(raw);
              if (acceptRef.current(parsed)) loaded = parsed;
              else throw new Error();
              setError(null);
            } catch {
              setError(
                "Le brouillon local est illisible. Le dernier contenu enregistré a été chargé.",
              );
            }
          } else {
            setError(null);
          }
          valueRef.current = loaded;
          setValue(() => loaded);
          loadedKey.current = key;
          setReady(true);
        },
        () => {
          if (active) {
            valueRef.current = fallbackRef.current;
            setValue(() => fallbackRef.current);
            setError("Le brouillon ne peut pas être chargé sur cet appareil.");
            loadedKey.current = key;
            setReady(true);
          }
        },
      );
    return () => {
      active = false;
      if (loadedKey.current === key) persist(key, valueRef.current);
    };
  }, [key, persist]);
  useEffect(() => {
    const flush = () => {
      if (loadedKey.current) persist(loadedKey.current, valueRef.current);
    };
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") flush();
    });
    const pageHidden = () => {
      if (document.visibilityState === "hidden") flush();
    };
    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.addEventListener("pagehide", flush);
      document.addEventListener("visibilitychange", pageHidden);
    }
    return () => {
      flush();
      subscription.remove();
      if (Platform.OS === "web" && typeof window !== "undefined") {
        window.removeEventListener("pagehide", flush);
        document.removeEventListener("visibilitychange", pageHidden);
      }
    };
  }, [persist]);
  async function clear() {
    await writes.current;
    await AsyncStorage.removeItem(key);
  }
  return [value, changeValue, { ready, error, clear }];
}
