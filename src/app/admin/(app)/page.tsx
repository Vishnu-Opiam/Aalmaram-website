import { redirect } from "next/navigation";

/** Products are the day-to-day job, so /admin lands there. */
export default function AdminIndexPage() {
  redirect("/admin/products");
}
