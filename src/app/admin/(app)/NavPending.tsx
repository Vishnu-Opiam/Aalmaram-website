"use client";

import { useLinkStatus } from "next/link";

/** Rendered inside each nav <Link>: a progress bar while that link's page loads. */
export default function NavPending() {
  const { pending } = useLinkStatus();
  return pending ? <span className="admin-nav-pending" aria-hidden /> : null;
}
