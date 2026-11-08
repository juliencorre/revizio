import type { ReactNode } from "react";
import { Redirect, usePathname } from "expo-router";
import { View, ActivityIndicator } from "react-native";
import { useSession } from "@/state/session";
import { colors } from "@/theme";
export function AccessGuard({
  role,
  children,
}: {
  role: "parent" | "child";
  children: ReactNode;
}) {
  const session = useSession();
  const path = usePathname();
  if (!session.ready)
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  if (session.mode === "choose" || (session.mode === "family" && !session.user))
    return (
      <Redirect
        href={{ pathname: "/auth", params: { target: role, returnTo: path } }}
      />
    );
  if (
    role === "parent" &&
    session.mode === "family" &&
    session.user?.role !== "parent"
  )
    return (
      <Redirect href={{ pathname: "/auth", params: { target: "parent" } }} />
    );
  return children;
}
