import type { Metadata } from "next";
import { BrokerScreen } from "@/components/screens/brokers";

export const metadata: Metadata = { title: "Zerodha stocks" };

export default function Page() {
  return <BrokerScreen id="zerodha" />;
}
