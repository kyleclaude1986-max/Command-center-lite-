import { asFloat, asInt, asString, badRequest, ok, readJson, requireSession } from "@/lib/api";
import { METRIC_KEYS, recordMetrics, removeMetrics, type MetricInput } from "@/lib/body";
import { isValidIso, todayIso } from "@/lib/dates";

const BOUNDS: Record<(typeof METRIC_KEYS)[number], { max: number; label: string }> = {
  weightLb: { max: 1000, label: "Weight" },
  muscleMassLb: { max: 1000, label: "Muscle mass" },
  fatMassLb: { max: 1000, label: "Fat mass" },
  bodyFatPct: { max: 100, label: "Body fat percentage" },
};

export async function POST(request: Request) {
  const denied = await requireSession();
  if (denied) return denied;

  const body = await readJson(request);
  const measuredOn = asString(body.measuredOn) ?? todayIso();
  if (!isValidIso(measuredOn)) return badRequest("measuredOn must be YYYY-MM-DD");

  const values: MetricInput = {};

  for (const key of METRIC_KEYS) {
    if (!(key in body)) continue;
    const raw = body[key];
    if (raw === null || raw === "") {
      values[key] = null;
      continue;
    }
    const value = asFloat(raw);
    const { max, label } = BOUNDS[key];
    if (value === null || value <= 0 || value > max) {
      return badRequest(`${label} must be between 0 and ${max}`);
    }
    values[key] = value;
  }

  if (Object.keys(values).length === 0) return badRequest("nothing to record");

  const weight = values.weightLb;
  const fat = values.fatMassLb;
  const muscle = values.muscleMassLb;
  if (
    typeof weight === "number" &&
    ((typeof fat === "number" && fat > weight) || (typeof muscle === "number" && muscle > weight))
  ) {
    return badRequest("fat and muscle mass cannot exceed total weight");
  }

  return ok(recordMetrics(measuredOn, values));
}

export async function DELETE(request: Request) {
  const denied = await requireSession();
  if (denied) return denied;

  const id = asInt(new URL(request.url).searchParams.get("id"));
  if (id === null) return badRequest("id is required");

  removeMetrics(id);
  return ok();
}
