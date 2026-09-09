import { connection } from "next/server";

import { GarmentPage } from "@/components/garment-page";

export const metadata = { title: "Garment · Khazanay" };
export const instant = false;

export default async function ItemPage({ params }: { params: Promise<{ sku: string }> }) {
  await connection();
  const { sku } = await params;
  return <GarmentPage sku={decodeURIComponent(sku)} />;
}
