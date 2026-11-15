import { Slot } from "expo-router";
import { AccessGuard } from "@/components/AccessGuard";
import { StudentWorkspace } from "@/features/child/shared";
export default function StudentRoutes() {
  return (
    <AccessGuard role="child">
      <StudentWorkspace>
        <Slot />
      </StudentWorkspace>
    </AccessGuard>
  );
}
