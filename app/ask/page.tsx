import type { Metadata } from "next";
import { AskScreen } from "@/components/screens/ask";

export const metadata: Metadata = { title: "Ask about your money" };

export default function Page() {
  return <AskScreen />;
}
