import type { Metadata } from "next";
import { CategoryScreen } from "@/components/screens/category";

export const metadata: Metadata = { title: "Stocks" };

export default function Page() {
  return <CategoryScreen id="stocks" />;
}
