import type { Metadata } from "next";
import { TaxScreen } from "@/components/screens/tax";

export const metadata: Metadata = { title: "Sell & tax" };

export default function Page() {
  return <TaxScreen />;
}
