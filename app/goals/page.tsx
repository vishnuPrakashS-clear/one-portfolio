import type { Metadata } from "next";
import { FutureScreen } from "@/components/screens/future";

// Goals now live on the Future page; this address keeps working and lands on the goal section
export const metadata: Metadata = { title: "Future & goals" };

export default function Page() {
  return <FutureScreen focus="goal" />;
}
