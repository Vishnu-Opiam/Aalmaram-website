"use client";

import { useActionState } from "react";
import { Notice, inputClass, labelClass } from "../ui";
import { createEvent, deleteEvent, updateEvent, type ActionState } from "./actions";

const INITIAL: ActionState = { error: "" };

export interface EventFormValues {
  id?: string;
  title: string;
  date: string;
  location: string;
  description: string;
  link: string;
  published: boolean;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className={labelClass}>{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11.5px] font-body font-light opacity-55">{hint}</span>}
    </label>
  );
}

export default function EventForm({ mode, values }: { mode: "create" | "edit"; values: EventFormValues }) {
  const [state, formAction, pending] = useActionState(mode === "create" ? createEvent : updateEvent, INITIAL);

  return (
    <form action={formAction} className="mt-10 space-y-8 max-w-[760px]">
      {values.id && <input type="hidden" name="id" value={values.id} />}
      <Notice error={state.error} ok={state.ok} />

      <div className="grid md:grid-cols-2 gap-6">
        <div className="md:col-span-2">
          <Field label="TITLE *">
            <input name="title" defaultValue={values.title} required maxLength={140} className={inputClass} />
          </Field>
        </div>
        <Field label="DATE *" hint="The day it happens. It leaves the homepage the day after.">
          <input name="date" type="date" defaultValue={values.date} required className={inputClass} />
        </Field>
        <Field label="LOCATION" hint="e.g. Kochi Biennale Pavilion, Fort Kochi">
          <input name="location" defaultValue={values.location} maxLength={200} className={inputClass} />
        </Field>
        <div className="md:col-span-2">
          <Field label="DESCRIPTION" hint="A sentence or two. Shown under the title.">
            <textarea
              name="description"
              defaultValue={values.description}
              rows={4}
              maxLength={1000}
              className={inputClass}
            />
          </Field>
        </div>
        <div className="md:col-span-2">
          <Field
            label="LINK"
            hint="Optional. With a link, the event opens it. Without one, visitors register on the site and n8n sends the confirmation and a reminder."
          >
            <input name="link" type="url" defaultValue={values.link} placeholder="https://" className={inputClass} />
          </Field>
        </div>
        <label className="flex items-center gap-3 text-[13.5px] font-body font-light md:col-span-2">
          <input
            type="checkbox"
            name="published"
            defaultChecked={values.published}
            style={{ accentColor: "var(--night)" }}
          />
          Published — untick to hide it from the site without deleting it
        </label>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="btn-night px-10 py-4 text-[12px] tracking-[.26em] font-body font-normal"
      >
        {pending ? "Saving…" : mode === "create" ? "Add event" : "Save changes"}
      </button>
    </form>
  );
}

export function DeleteEventButton({ id }: { id: string }) {
  const [state, formAction, pending] = useActionState(deleteEvent, INITIAL);
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!window.confirm("Delete this event for good?")) e.preventDefault();
      }}
      className="space-y-3"
    >
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={pending}
        className="qlink text-[11.5px] tracking-[.22em] font-body font-light"
        style={{ color: "var(--spice)" }}
      >
        DELETE
      </button>
      <Notice error={state.error} />
    </form>
  );
}
