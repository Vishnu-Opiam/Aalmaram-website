import fs from "fs";
import path from "path";
import crypto from "crypto";

/* ────────────────────────────────────────────────────────────
   Events — backed by a local JSON file (no Shopify dependency)
   ──────────────────────────────────────────────────────────── */

export interface EventRecord {
  id: string;
  title: string;
  date: string; // ISO date (YYYY-MM-DD)
  location: string;
  description: string;
  link: string;
}

export type EventInput = Omit<EventRecord, "id">;

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "events.json");

/** Ensure the data directory and file exist. */
function ensureFile(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, "[]", "utf-8");
  }
}

/** Read all events from disk. */
function readAll(): EventRecord[] {
  ensureFile();
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf-8");
    return JSON.parse(raw) as EventRecord[];
  } catch {
    return [];
  }
}

/** Write all events to disk. */
function writeAll(events: EventRecord[]): void {
  ensureFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(events, null, 2), "utf-8");
}

/** List all events. */
export async function listEvents(): Promise<EventRecord[]> {
  return readAll();
}

/** Create a new event. */
export async function createEvent(input: EventInput): Promise<EventRecord> {
  const events = readAll();
  const event: EventRecord = {
    id: crypto.randomUUID(),
    ...input,
  };
  events.push(event);
  writeAll(events);
  return event;
}

/** Update an existing event by ID. */
export async function updateEvent(id: string, input: EventInput): Promise<EventRecord> {
  const events = readAll();
  const idx = events.findIndex((e) => e.id === id);
  if (idx === -1) throw new Error(`Event not found: ${id}`);
  events[idx] = { id, ...input };
  writeAll(events);
  return events[idx];
}

/** Delete an event by ID. */
export async function deleteEvent(id: string): Promise<void> {
  const events = readAll();
  const filtered = events.filter((e) => e.id !== id);
  if (filtered.length === events.length) throw new Error(`Event not found: ${id}`);
  writeAll(filtered);
}
