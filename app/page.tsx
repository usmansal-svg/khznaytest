import { redirect } from "next/navigation";

/** The root is not a page: everything lives behind the PIN screen. */
export default function Home() {
  redirect("/login");
}
