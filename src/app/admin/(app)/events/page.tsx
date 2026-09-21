import Link from "next/link";
import { requireAdmin } from "@/lib/admin-auth";
import { todayInIndia } from "@/lib/events";
import { formatDate } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";
import { Notice, PageTitle, Pill, SectionTitle } from "../ui";
import { setEventPublished } from "./actions";

export const metadata = { title: "Events - Aalmaram admin" };

type EventRow = { id: string; title: string; date: string; location: string; link: string; published: boolean };

function EventTable({ rows, isPast }: { rows: EventRow[]; isPast: boolean }) {
  return (
    <div className="mt-5 admin-card overflow-x-auto">
      <table className="w-full text-left text-[13.5px]">
        <thead>
          <tr>
            <th className="py-3 pr-4 font-normal">Date</th>
            <th className="py-3 pr-4 font-normal">Event</th>
            <th className="py-3 pr-4 font-normal">Where</th>
            <th className="py-3 pr-4 font-normal">Sign-up</th>
            <th className="py-3 pr-4 font-normal">Status</th>
            <th className="py-3 font-normal" />
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => (
            <tr key={e.id} className="border-t border-black/10 align-top">
              <td className="py-3 pr-4 whitespace-nowrap">{formatDate(`${e.date}T12:00:00+05:30`)}</td>
              <td className="py-3 pr-4">
                <Link href={`/admin/events/${e.id}`} className="qlink">
                  {e.title}
                </Link>
              </td>
              <td className="py-3 pr-4 opacity-80">{e.location || "—"}</td>
              <td className="py-3 pr-4 opacity-80">{e.link ? "External link" : "On the site"}</td>
              <td className="py-3 pr-4">
                {isPast ? (
                  <Pill tone="quiet">Past</Pill>
                ) : e.published ? (
                  <Pill tone="good">Live</Pill>
                ) : (
                  <Pill tone="warn">Hidden</Pill>
                )}
              </td>
              <td className="py-3 text-right">
                {!isPast && (
                  <form action={setEventPublished}>
                    <input type="hidden" name="id" value={e.id} />
                    <input type="hidden" name="published" value={String(!e.published)} />
                    <button type="submit" className="qlink text-[12px]">
                      {e.published ? "Hide" : "Publish"}
                    </button>
                  </form>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function AdminEventsPage() {
  await requireAdmin();

  const db = createAdminClient();
  const { data: events, error } = await db
    .from("events")
    .select("id, title, date, location, link, published")
    .order("date", { ascending: false });

  const today = todayInIndia();
  const upcoming = (events ?? []).filter((e) => e.date >= today).reverse();
  const past = (events ?? []).filter((e) => e.date < today);

  return (
    <div>
      <PageTitle
        aside={
          <Link
            href="/admin/events/new"
            className="btn-night px-4 py-2.5 text-[13px]"
          >
            New event
          </Link>
        }
      >
        Events
      </PageTitle>
      <p className="mt-3 text-[13px] opacity-60 max-w-[62ch]">
        Upcoming published events appear in the Events section of the homepage.
      </p>

      {error && (
        <div className="mt-8">
          <Notice error={error.message} />
        </div>
      )}

      {!events?.length ? (
        <p className="mt-6 admin-card px-6 py-10 text-center text-[14px] opacity-70">No events yet.</p>
      ) : (
        <>
          <section className="admin-card p-5 sm:p-6 mt-4">
            <SectionTitle>Coming up</SectionTitle>
            {upcoming.length ? (
              <EventTable rows={upcoming} isPast={false} />
            ) : (
              <p className="mt-4 text-[13.5px] opacity-60">Nothing on the calendar.</p>
            )}
          </section>
          {past.length > 0 && (
            <section className="admin-card p-5 sm:p-6 mt-4">
              <SectionTitle>Past</SectionTitle>
              <EventTable rows={past} isPast />
            </section>
          )}
        </>
      )}
    </div>
  );
}
