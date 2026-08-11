import { formatInTimeZone } from "date-fns-tz";
import { env } from "./env";

export function fmtTime(unix: number): string {
  return formatInTimeZone(new Date(unix * 1000), env.DISPLAY_TIMEZONE, "h:mm a");
}

export function fmtDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return "—";
  const total = Math.round(seconds / 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} hr`;
  return `${h} hr ${m} min`;
}

export function fmtDurationShort(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return "—";
  return `${Math.round(seconds / 60)}m`;
}

export function fmtWeight(lb: number | null | undefined): string {
  if (lb === null || lb === undefined) return "—";
  return `${lb.toFixed(1)} lb`;
}

export function fmtPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `${value.toFixed(1)}%`;
}

export function fmtGrams(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `${Math.round(value)}g`;
}

export function fmtCalories(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return Math.round(value).toLocaleString("en-US");
}

export function fmtRating(rating: number | null | undefined): string {
  if (!rating) return "Unrated";
  return `${rating}/5`;
}

export function fmtAverage(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined) return "—";
  return value.toFixed(digits);
}

export function pluralize(count: number, singular: string, plural?: string): string {
  return count === 1 ? singular : (plural ?? `${singular}s`);
}
