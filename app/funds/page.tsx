import type { Metadata } from "next";
import { CategoryScreen } from "@/components/screens/category";

export const metadata: Metadata = { title: "Mutual funds" };

export default function Page() {
  return <CategoryScreen id="funds" />;
}
