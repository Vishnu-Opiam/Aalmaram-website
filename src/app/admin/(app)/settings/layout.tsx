import { requireOwner } from "@/lib/admin-auth";
import { PageTitle } from "../ui";
import SettingsNav from "./SettingsNav";

/** Owners only. Each page checks again — a layout does not guard its pages' actions. */
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  await requireOwner();
  return (
    <div>
      <PageTitle>Settings</PageTitle>
      <SettingsNav />
      <div className="mt-10">{children}</div>
    </div>
  );
}
