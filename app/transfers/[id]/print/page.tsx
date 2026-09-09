import { connection } from "next/server";

import { TransferSheet } from "@/components/transfer-sheet";

export const metadata = { title: "Transfer sheet · Khazanay" };
export const instant = false;

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  return <TransferSheet id={Number(id)} />;
}
