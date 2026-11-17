import type { Metadata } from "next";
import { FutureScreen } from "@/components/screens/future";

export const metadata: Metadata = { title: "Future value" };

export default function Page() {
  return <FutureScreen />;
}
