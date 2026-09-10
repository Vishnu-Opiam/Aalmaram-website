/** Money helpers. Safe on both sides of the client boundary. */

/** Paise in, rupees out. Storage and arithmetic stay in integer paise. */
export function formatPaise(paise: number): string {
  return "₹" + (paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 });
}
