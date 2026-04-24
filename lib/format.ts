import { formatInTimeZone } from "date-fns-tz";
import { env } from "./env";

export function fmtTime(unix: number): string {
  return formatInTimeZone(new Date(unix * 1000), env.DISPLAY_TIMEZONE, "h:mm a");
}

export function fmtDate(unix: number): string {
  return formatInTimeZone(new Date(unix * 1000), env.DISPLAY_TIMEZONE, "EEE, MMM d");
}

export function fmtDayLabel(d: Date): string {
  return formatInTimeZone(d, env.DISPLAY_TIMEZONE, "EEE M/d");
}

export function fmtRelative(unix: number | null): string {
  if (!unix) return "never";
  const diffSec = Math.floor(Date.now() / 1000) - unix;
  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

export function fmtCurrency(value: number | null): string {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function calendarColor(source: string, label: string): string {
  // Deterministic assignment based on source + label ordering
  if (source === "msgraph") {
    return label.toLowerCase().includes("b") ? "bg-cal-workB" : "bg-cal-workA";
  }
  return label.toLowerCase().includes("b") ? "bg-cal-famB" : "bg-cal-famA";
}
