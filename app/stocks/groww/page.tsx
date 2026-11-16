import type { Metadata } from "next";
import { BrokerScreen } from "@/components/screens/brokers";

export const metadata: Metadata = { title: "Groww stocks" };

export default function Page() {
  return <BrokerScreen id="groww" />;
}
