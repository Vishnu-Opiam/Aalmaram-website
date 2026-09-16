import { requireAdmin } from "@/lib/admin-auth";
import { BackLink, PageTitle } from "../../ui";
import EventForm from "../EventForm";

export const metadata = { title: "New event - Aalmaram admin" };

export default async function NewEventPage() {
  await requireAdmin();
  return (
    <div>
      <BackLink href="/admin/events">Events</BackLink>
      <div className="mt-6">
        <PageTitle>New event</PageTitle>
      </div>
      <EventForm
        mode="create"
        values={{ title: "", date: "", location: "", description: "", link: "", published: true }}
      />
    </div>
  );
}
