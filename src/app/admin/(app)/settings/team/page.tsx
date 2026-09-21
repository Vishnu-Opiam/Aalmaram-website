import { redirect } from "next/navigation";

/** The team moved to its own Employees section. */
export default function TeamPage() {
  redirect("/admin/employees");
}
