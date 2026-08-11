import { fromZonedTime } from "date-fns-tz";
import { env } from "../env";
import { fmtDuration, fmtRating } from "../format";
import type { IsoDate } from "../dates";

export type EventInput = {
  uid: string;
  title: string;
  performedOn: IsoDate;
  startedAt: number | null;
  durationSec: number | null;
  rating: number | null;
  recovery: string[];
  topSet: string | null;
  sequence: number;
};

/**
 * Escaping per RFC 5545: backslash, semicolon, comma, and newline all carry meaning
 * in a property value. A workout note with a comma in it would otherwise split the
 * property and produce an event iCloud silently drops.
 */
function esc(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function stamp(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function dateOnly(iso: IsoDate): string {
  return iso.replace(/-/g, "");
}

/**
 * Lines longer than 75 octets must be folded, and iCloud is one of the servers that
 * actually enforces it. Folding is by octet, not character, so a multi-byte character
 * cannot be split across the boundary.
 */
function fold(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;

  const parts: string[] = [];
  let start = 0;

  while (start < bytes.length) {
    const limit = parts.length === 0 ? 75 : 74;
    let end = Math.min(start + limit, bytes.length);

    while (end > start && end < bytes.length && (bytes[end]! & 0xc0) === 0x80) end -= 1;

    parts.push(bytes.subarray(start, end).toString("utf8"));
    start = end;
  }

  return parts.join("\r\n ");
}

export function buildDescription(input: EventInput): string {
  const parts: string[] = [];
  if (input.durationSec) parts.push(fmtDuration(input.durationSec));
  if (input.rating !== null) parts.push(fmtRating(input.rating));
  if (input.topSet) parts.push(`Top set ${input.topSet}`);
  if (input.recovery.length > 0) parts.push(input.recovery.join(", "));
  return parts.join(" · ");
}

/**
 * A workout with a real start time from the Watch becomes a timed event at that
 * instant. One logged by hand with no time becomes an all-day event, rather than
 * inventing a start time that would put it at the wrong hour on the calendar.
 */
export function buildEvent(input: EventInput): string {
  const now = Math.floor(Date.now() / 1000);
  const description = buildDescription(input);

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//iron log//gym tracker//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${input.uid}`,
    `DTSTAMP:${stamp(now)}`,
    `SEQUENCE:${input.sequence}`,
    `SUMMARY:${esc(input.title)}`,
  ];

  if (input.startedAt !== null) {
    const end = input.startedAt + (input.durationSec ?? 3600);
    lines.push(`DTSTART:${stamp(input.startedAt)}`, `DTEND:${stamp(end)}`);
  } else {
    const startOfDay = Math.floor(
      fromZonedTime(`${input.performedOn}T00:00:00`, env.DISPLAY_TIMEZONE).getTime() / 1000
    );
    const nextDay = startOfDay + 86400;
    lines.push(
      `DTSTART;VALUE=DATE:${dateOnly(input.performedOn)}`,
      `DTEND;VALUE=DATE:${dateOnly(new Date(nextDay * 1000).toISOString().slice(0, 10))}`
    );
  }

  if (description) lines.push(`DESCRIPTION:${esc(description)}`);

  lines.push("END:VEVENT", "END:VCALENDAR");

  return `${lines.map(fold).join("\r\n")}\r\n`;
}

export function uidFor(workoutId: number): string {
  return `gym-workout-${workoutId}@iron-log`;
}
