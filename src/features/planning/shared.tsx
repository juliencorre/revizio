import type { ReactNode } from "react";
import { AppShell, type NavigationItem } from "@/components/ui";

export function StudyWorkspace({
  role,
  active,
  children,
}: {
  role: "parent" | "child";
  active: "plans" | "english";
  children: ReactNode;
}) {
  const parent: NavigationItem[] = [
    { label: "Tableau de bord", href: "/parent", icon: "home" },
    { label: "Ajouter un cours", href: "/parent/import", icon: "camera" },
    {
      label: "Préparer des exercices",
      href: "/parent/exercises",
      icon: "pencil",
    },
    {
      label: "Contrôles et plans",
      href: "/parent/controls",
      icon: "calendar",
      active: active === "plans",
    },
    {
      label: "Anglais",
      href: "/parent/english",
      icon: "languages",
      active: active === "english",
    },
    { label: "Réglages", href: "/parent/settings", icon: "users" },
  ];
  const child: NavigationItem[] = [
    { label: "Mes matières", href: "/student", icon: "home" },
    { label: "Mes exercices", href: "/student/exercises", icon: "pencil" },
    {
      label: "Mes plans",
      href: "/student/plans",
      icon: "calendar",
      active: active === "plans",
    },
    {
      label: "Mon anglais",
      href: "/student/english",
      icon: "languages",
      active: active === "english",
    },
    { label: "Mes progrès", href: "/student/progress", icon: "chart" },
  ];
  return (
    <AppShell role={role} navigation={role === "parent" ? parent : child}>
      {children}
    </AppShell>
  );
}
