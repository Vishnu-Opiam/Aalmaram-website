import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { BackLink, Notice, PageTitle } from "../../ui";
import EventForm, { DeleteEventButton } from "../EventForm";

export const metadata = { title: "Event - Aalmaram admin" };

export default async function EditEventPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const { saved } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const db = createAdminClient();
  const { data: event } = await db.from("events").select("*").eq("id", id).maybeSingle();
  if (!event) notFound();

  return (
    <div>
      <BackLink href="/admin/events">Events</BackLink>
      <div className="mt-6">
        <PageTitle aside={<DeleteEventButton id={event.id} />}>{event.title}</PageTitle>
      </div>
      {saved && (
        <div className="mt-6 max-w-[760px]">
          <Notice ok="Event added." />
        </div>
      )}
      <EventForm
        mode="edit"
        values={{
          id: event.id,
          title: event.title,
          date: event.date,
          location: event.location,
          description: event.description,
          link: event.link,
          published: event.published,
        }}
      />
    </div>
  );
}
