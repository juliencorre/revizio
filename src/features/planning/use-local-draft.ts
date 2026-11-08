import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

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
  useEffect(() => {
    let active = true;
    setReady(false);
    loadedKey.current = null;
    void AsyncStorage.getItem(key).then(
      (raw) => {
        if (!active) return;
        if (raw) {
          try {
            const parsed: unknown = JSON.parse(raw);
            if (acceptRef.current(parsed)) setValue(parsed);
            else throw new Error();
          } catch {
            setValue(fallbackRef.current);
            setError(
              "Le brouillon local est illisible. Le dernier contenu enregistré a été chargé.",
            );
          }
        } else {
          setValue(fallbackRef.current);
          setError(null);
        }
        loadedKey.current = key;
        setReady(true);
      },
      () => {
        if (active) {
          setValue(fallbackRef.current);
          setError("Le brouillon ne peut pas être chargé sur cet appareil.");
          loadedKey.current = key;
          setReady(true);
        }
      },
    );
    return () => {
      active = false;
      if (loadedKey.current === key)
        void AsyncStorage.setItem(key, JSON.stringify(valueRef.current)).catch(
          () => undefined,
        );
    };
  }, [key]);
  useEffect(() => {
    if (!ready || loadedKey.current !== key) return;
    const timeout = setTimeout(() => {
      void AsyncStorage.setItem(key, JSON.stringify(value)).then(
        () => setError(null),
        () =>
          setError(
            "Le brouillon n’a pas pu être sauvegardé. Gardez cette page ouverte.",
          ),
      );
    }, 250);
    return () => clearTimeout(timeout);
  }, [key, ready, value]);
  async function clear() {
    await AsyncStorage.removeItem(key);
  }
  return [value, setValue, { ready, error, clear }];
}
