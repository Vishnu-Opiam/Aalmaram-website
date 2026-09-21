"use client";

import { useActionState } from "react";
import { formatDateTime } from "@/lib/format";
import { Notice, inputClass, labelClass } from "../ui";
import { setMarketing, updateCustomerNotes, type ActionState } from "./actions";

const INITIAL: ActionState = { error: "" };

export function MarketingToggle({
  id,
  accepts,
  consentAt,
}: {
  id: string;
  accepts: boolean;
  consentAt: string | null;
}) {
  const [state, formAction, pending] = useActionState(setMarketing, INITIAL);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="accepts_marketing" value={accepts ? "false" : "true"} />
      <p className="text-[13.5px]">
        {accepts ? (
          <>
            Opted in{consentAt ? ` on ${formatDateTime(consentAt)}` : ""}. They can receive the newsletter.
          </>
        ) : (
          <>Not opted in. They only receive emails about their orders.</>
        )}
      </p>
      {!accepts && (
        <label className="block">
          <span className={labelClass}>How did they agree?</span>
          <input
            name="source"
            placeholder="e.g. replied to the launch email asking to be added"
            className={inputClass}
          />
        </label>
      )}
      <Notice error={state.error} ok={state.ok} />
      <button type="submit" disabled={pending} className="qlink text-[12.5px]">
        {pending ? "Saving…" : accepts ? "Opt them out" : "Mark as opted in"}
      </button>
    </form>
  );
}

export function CustomerNotesForm({ id, notes }: { id: string; notes: string }) {
  const [state, formAction, pending] = useActionState(updateCustomerNotes, INITIAL);
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="id" value={id} />
      <textarea name="notes" defaultValue={notes} rows={4} placeholder="Only the team sees these." className={inputClass} />
      <Notice error={state.error} ok={state.ok} />
      <button type="submit" disabled={pending} className="qlink text-[12.5px]">
        {pending ? "Saving…" : "Save notes"}
      </button>
    </form>
  );
}
