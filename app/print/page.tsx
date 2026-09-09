import { Suspense } from "react";

import { PrintBatch } from "@/components/print-batch";

export const metadata = { title: "Print tags · Khazanay" };

export default function Page() {
  return (
    <Suspense fallback={<p className="p-6 text-neutral-500">Loading…</p>}>
      <PrintBatch />
    </Suspense>
  );
}
