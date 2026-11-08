/** Register the exported, versioned shell. Private data uses the family store. */
export async function registerOfflineShell(): Promise<boolean> {
  if (
    __DEV__ ||
    typeof window === "undefined" ||
    !window.isSecureContext ||
    !("serviceWorker" in navigator)
  )
    return false;
  try {
    const registration = await navigator.serviceWorker.register("/sw.js", {
      scope: "/",
      updateViaCache: "none",
    });
    if (navigator.onLine) void registration.update().catch(() => undefined);
    return true;
  } catch {
    return false;
  }
}
