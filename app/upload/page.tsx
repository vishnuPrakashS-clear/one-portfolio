import type { Metadata } from "next";
import { UploadScreen } from "@/components/screens/upload";

export const metadata: Metadata = { title: "Upload" };

export default function Page() {
  return <UploadScreen />;
}
