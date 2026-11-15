import { Slot } from "expo-router";
import { AccessGuard } from "@/components/AccessGuard";
import { ParentWorkspace } from "@/features/parent/shared";
export default function ParentRoutes() {
  return (
    <AccessGuard role="parent">
      <ParentWorkspace>
        <Slot />
      </ParentWorkspace>
    </AccessGuard>
  );
}
