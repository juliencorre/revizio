import type { ReactNode } from "react";
import { ChildShell } from "@/features/child/shared";
import { ParentLayout } from "@/features/parent/shared";

/** Plans and English share the same navigation as the rest of each space. */
export function StudyWorkspace({
  role,
  active,
  children,
}: {
  role: "parent" | "child";
  active: "plans" | "english";
  children: ReactNode;
}) {
  return role === "parent" ? (
    <ParentLayout active={active === "plans" ? "controls" : "english"}>
      {children}
    </ParentLayout>
  ) : (
    <ChildShell active={active}>{children}</ChildShell>
  );
}
