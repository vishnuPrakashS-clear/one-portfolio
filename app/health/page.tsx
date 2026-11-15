import type { Metadata } from "next";
import { HealthScreen } from "@/components/screens/health";

export const metadata: Metadata = { title: "Portfolio health" };

export default function Page() {
  return <HealthScreen />;
}
