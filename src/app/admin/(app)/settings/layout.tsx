import { requireAdmin } from "@/lib/admin-auth";
import { PageTitle } from "../ui";
import SettingsNav from "./SettingsNav";

/** Every admin (owners and store managers). Each page checks again — a layout does not guard its pages' actions. */
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div>
      <PageTitle>Settings</PageTitle>
      <SettingsNav />
      <div className="mt-6">{children}</div>
    </div>
  );
}
