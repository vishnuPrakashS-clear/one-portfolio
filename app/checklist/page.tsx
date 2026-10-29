import type { Metadata } from "next";
import { ChecklistScreen } from "@/components/screens/checklist";

export const metadata: Metadata = { title: "Yearly checklist" };

export default function Page() {
  return <ChecklistScreen />;
}
