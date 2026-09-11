import { PosShell } from "@/components/pos/pos-shell";

export const metadata = { title: "POS · Khazanay" };

export default function PosLayout({ children }: { children: React.ReactNode }) {
  return <PosShell>{children}</PosShell>;
}
