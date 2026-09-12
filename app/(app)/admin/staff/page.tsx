import { redirect } from "next/navigation";

/** Staff moved under Settings (12 Sep). */
export default function StaffPage() {
  redirect("/admin/settings?tab=staff");
}
