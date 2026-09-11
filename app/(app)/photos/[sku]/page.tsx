import { PhotoStation } from "@/components/photo-station";

export const instant = false;
export const metadata = { title: "Photos · Khazanay" };

export default async function Page({ params }: { params: Promise<{ sku: string }> }) {
  const { sku } = await params;
  return <PhotoStation sku={decodeURIComponent(sku).toUpperCase()} />;
}
