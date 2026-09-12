import { redirect } from "next/navigation";

/** The tagger scorecard became the scorecard for everyone (12 Sep). */
export default function TaggersPage() {
  redirect("/admin/scorecard");
}
