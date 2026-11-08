import { Slot } from "expo-router";
import { AccessGuard } from "@/components/AccessGuard";
export default function ParentRoutes() {
  return (
    <AccessGuard role="parent">
      <Slot />
    </AccessGuard>
  );
}
