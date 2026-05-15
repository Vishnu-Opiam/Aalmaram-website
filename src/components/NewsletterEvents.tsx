import { listEvents, type EventRecord } from "@/lib/shopify";
import NewsletterForm from "./NewsletterForm";

export const dynamic = "force-dynamic";

function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d.getTime())) return iso;
  const month = d.toLocaleString("en-US", { month: "short" }).toUpperCase();
  return `${month} ${d.getDate()}`;
}

function formatYear(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return isNaN(d.getTime()) ? "" : String(d.getFullYear());
}

async function getUpcomingEvents(): Promise<EventRecord[]> {
  let events: EventRecord[] = [];
  try {
    events = await listEvents();
  } catch {
    events = [];
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return events
    .filter((e) => {
      const d = new Date(e.date + "T00:00:00");
      return !isNaN(d.getTime()) && d.getTime() >= today.getTime();
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

export default async function NewsletterEvents() {
  const events = await getUpcomingEvents();

  return (
    <section className="relative" style={{ backgroundColor: "#f8f5f0" }}>
      <div className="max-w-[1480px] mx-auto px-6 md:px-14 py-24 md:py-32">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-16 md:gap-24">
          <div className="reveal">
            <div className="text-[11px] tracking-[.34em] font-body font-light opacity-70 mb-6">
              06 · EVENTS
            </div>
            <h2
              className="font-display font-black text-[44px] md:text-[56px] leading-none mb-10"
              style={{ color: "var(--night)" }}
            >
              Meet us at the<br />
              <span className="italic font-medium" style={{ color: "var(--kathakali)" }}>
                market
              </span>
              .
            </h2>

            {events.length === 0 ? (
              <p
                className="font-body font-light text-[16px] leading-loose opacity-70 max-w-[40ch]"
                style={{ color: "var(--night)" }}
              >
                No events on the calendar just yet - join the newsletter and we&apos;ll tell you
                the moment we&apos;re out at a market or fair near you.
              </p>
            ) : (
              <div className="space-y-8">
                {events.map((ev) => {
                  const inner = (
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-display text-2xl font-bold" style={{ color: "var(--night)" }}>
                          {ev.title}
                        </h3>
                        {ev.location && (
                          <p
                            className="font-body font-light mt-2 opacity-80"
                            style={{ color: "var(--night)" }}
                          >
                            {ev.location}
                          </p>
                        )}
                        {ev.description && (
                          <p
                            className="font-body font-light text-sm mt-2 opacity-70 max-w-[42ch]"
                            style={{ color: "var(--night)" }}
                          >
                            {ev.description}
                          </p>
                        )}
                      </div>
                      <div className="text-right shrink-0 pl-6">
                        <p
                          className="font-body tracking-wider text-sm"
                          style={{ color: "var(--night)" }}
                        >
                          {formatDate(ev.date)}
                        </p>
                        <p
                          className="font-body font-light text-xs opacity-70 mt-1"
                          style={{ color: "var(--night)" }}
                        >
                          {formatYear(ev.date)}
                        </p>
                      </div>
                    </div>
                  );
                  return (
                    <div key={ev.id} className="border-t border-black/10 pt-6">
                      {ev.link ? (
                        <a
                          href={ev.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block hover:opacity-70 transition-opacity"
                        >
                          {inner}
                        </a>
                      ) : (
                        inner
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="reveal">
            <div className="text-[11px] tracking-[.34em] font-body font-light opacity-70 mb-6">
              NEWSLETTER
            </div>
            <h2
              className="font-display font-black text-[44px] md:text-[56px] leading-none mb-6"
              style={{ color: "var(--night)" }}
            >
              A letter from the<br />
              <span className="italic font-medium" style={{ color: "var(--kathakali)" }}>
                studio
              </span>
              .
            </h2>
            <p
              className="font-body font-light text-[17px] leading-loose mb-10 opacity-80 max-w-[40ch]"
              style={{ color: "var(--night)" }}
            >
              Join our mailing list to receive updates on new releases, original artwork drops, and
              studio news. We write once a month, never more.
            </p>
            <NewsletterForm />
          </div>
        </div>
      </div>
    </section>
  );
}
