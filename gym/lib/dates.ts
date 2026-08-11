import { formatInTimeZone } from "date-fns-tz";
import { env } from "./env";

const DAY_MS = 86_400_000;

export type IsoDate = string;

export function todayIso(now: Date = new Date()): IsoDate {
  return formatInTimeZone(now, env.DISPLAY_TIMEZONE, "yyyy-MM-dd");
}

export function isoFromInstant(unixSeconds: number): IsoDate {
  return formatInTimeZone(new Date(unixSeconds * 1000), env.DISPLAY_TIMEZONE, "yyyy-MM-dd");
}

export function dateFromIso(iso: IsoDate): Date {
  return new Date(`${iso}T12:00:00.000Z`);
}

export function isValidIso(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = dateFromIso(value);
  return !Number.isNaN(d.getTime()) && formatInTimeZone(d, "UTC", "yyyy-MM-dd") === value;
}

export function addDaysIso(iso: IsoDate, days: number): IsoDate {
  const next = new Date(dateFromIso(iso).getTime() + days * DAY_MS);
  return formatInTimeZone(next, "UTC", "yyyy-MM-dd");
}

export function diffDaysIso(from: IsoDate, to: IsoDate): number {
  return Math.round((dateFromIso(to).getTime() - dateFromIso(from).getTime()) / DAY_MS);
}

export function weekStartIso(iso: IsoDate): IsoDate {
  const day = dateFromIso(iso).getUTCDay();
  return addDaysIso(iso, -((day + 6) % 7));
}

export function weekDaysIso(anyDayInWeek: IsoDate): IsoDate[] {
  const start = weekStartIso(anyDayInWeek);
  return Array.from({ length: 7 }, (_, i) => addDaysIso(start, i));
}

export function isoRange(startIso: IsoDate, endIso: IsoDate): IsoDate[] {
  const span = diffDaysIso(startIso, endIso);
  if (span < 0) return [];
  return Array.from({ length: span + 1 }, (_, i) => addDaysIso(startIso, i));
}

export function monthDaysIso(iso: IsoDate): IsoDate[] {
  const first = `${iso.slice(0, 7)}-01`;
  const d = dateFromIso(first);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 12));
  return isoRange(first, formatInTimeZone(last, "UTC", "yyyy-MM-dd"));
}

export function fmtIsoDay(iso: IsoDate): string {
  return formatInTimeZone(dateFromIso(iso), "UTC", "EEE, MMM d");
}

export function fmtIsoDayName(iso: IsoDate): string {
  return formatInTimeZone(dateFromIso(iso), "UTC", "EEE");
}

export function fmtIsoDayNumber(iso: IsoDate): string {
  return formatInTimeZone(dateFromIso(iso), "UTC", "d");
}

export function fmtIsoMonth(iso: IsoDate): string {
  return formatInTimeZone(dateFromIso(iso), "UTC", "MMMM yyyy");
}

export function fmtIsoRelative(iso: IsoDate, today: IsoDate = todayIso()): string {
  const delta = diffDaysIso(today, iso);
  if (delta === 0) return "Today";
  if (delta === -1) return "Yesterday";
  if (delta === 1) return "Tomorrow";
  return fmtIsoDay(iso);
}
