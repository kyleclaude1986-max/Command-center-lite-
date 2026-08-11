import { asInt, asString, badRequest, ok, readJson, requireSession } from "@/lib/api";
import { isValidIso, todayIso } from "@/lib/dates";
import { deleteSavedMeal, isMeal, saveMealFromDay } from "@/lib/food/diary";

export async function POST(request: Request) {
  const denied = await requireSession();
  if (denied) return denied;

  const body = await readJson(request);

  const name = asString(body.name);
  if (!name) return badRequest("give the meal a name");

  const loggedOn = asString(body.loggedOn) ?? todayIso();
  if (!isValidIso(loggedOn)) return badRequest("loggedOn must be YYYY-MM-DD");

  if (!isMeal(body.meal)) return badRequest("unknown meal");

  const result = saveMealFromDay(name, loggedOn, body.meal);
  if ("error" in result) return badRequest(result.error);
  return ok(result);
}

export async function DELETE(request: Request) {
  const denied = await requireSession();
  if (denied) return denied;

  const id = asInt(new URL(request.url).searchParams.get("id"));
  if (id === null) return badRequest("id is required");

  deleteSavedMeal(id);
  return ok();
}
