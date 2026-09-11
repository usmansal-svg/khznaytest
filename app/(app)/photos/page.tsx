import { Suspense } from "react";

import { PhotosPage } from "@/components/photos-page";

export const metadata = { title: "Photos · Khazanay" };

export default function Page() {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
      <PhotosPage />
    </Suspense>
  );
}
