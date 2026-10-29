import type { Metadata } from "next";
import { PlanScreen } from "@/components/screens/plan";

export const metadata: Metadata = { title: "Monthly plan" };

export default function Page() {
  return <PlanScreen />;
}
