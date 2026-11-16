import type { Metadata } from "next";
import { StocksOverview } from "@/components/screens/brokers";

export const metadata: Metadata = { title: "Stocks" };

export default function Page() {
  return <StocksOverview />;
}
