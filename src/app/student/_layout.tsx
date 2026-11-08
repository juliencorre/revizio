import { Slot } from "expo-router";
import { AccessGuard } from "@/components/AccessGuard";
export default function StudentRoutes() {
  return (
    <AccessGuard role="child">
      <Slot />
    </AccessGuard>
  );
}
