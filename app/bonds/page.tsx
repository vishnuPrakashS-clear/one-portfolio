import type { Metadata } from "next";
import { CategoryScreen } from "@/components/screens/category";

export const metadata: Metadata = { title: "Bonds" };

export default function Page() {
  return <CategoryScreen id="bonds" />;
}
