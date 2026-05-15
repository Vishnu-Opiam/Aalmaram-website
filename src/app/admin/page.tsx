import { isAuthed } from "@/lib/auth";
import AdminClient from "./AdminClient";

export const metadata = { title: "Admin - Aalmaram" };
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  let authed = false;
  try {
    authed = await isAuthed();
  } catch {
    authed = false;
  }
  return <AdminClient initialAuthed={authed} />;
}
