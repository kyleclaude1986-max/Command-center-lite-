import { asBool, asFloat, asInt, badRequest, notFound, ok, readJson, requireSession } from "@/lib/api";
import { removeSet, updateSet, type SetPatch } from "@/lib/logbook";

type Params = { params: Promise<{ id: string }> };

const MAX_REPS = 200;
const MAX_WEIGHT_LB = 2000;

export async function PATCH(request: Request, { params }: Params) {
  const denied = await requireSession();
  if (denied) return denied;

  const id = asInt((await params).id);
  if (id === null) return badRequest("bad id");

  const body = await readJson(request);
  const patch: SetPatch = {};

  if ("reps" in body) {
    const reps = body.reps === null || body.reps === "" ? null : asInt(body.reps);
    if (reps !== null && (reps < 0 || reps > MAX_REPS)) {
      return badRequest(`reps must be between 0 and ${MAX_REPS}`);
    }
    patch.reps = reps;
  }

  if ("weightLb" in body) {
    const weight = body.weightLb === null || body.weightLb === "" ? null : asFloat(body.weightLb);
    if (weight !== null && (weight < 0 || weight > MAX_WEIGHT_LB)) {
      return badRequest(`weight must be between 0 and ${MAX_WEIGHT_LB} lb`);
    }
    patch.weightLb = weight;
  }

  if ("rpe" in body) {
    const rpe = body.rpe === null || body.rpe === "" ? null : asFloat(body.rpe);
    if (rpe !== null && (rpe < 1 || rpe > 10)) return badRequest("RPE must be between 1 and 10");
    patch.rpe = rpe;
  }

  if ("isWarmup" in body) patch.isWarmup = asBool(body.isWarmup);

  if (Object.keys(patch).length === 0) return badRequest("nothing to change");
  if (!updateSet(id, patch)) return notFound();

  return ok();
}

export async function DELETE(_request: Request, { params }: Params) {
  const denied = await requireSession();
  if (denied) return denied;

  const id = asInt((await params).id);
  if (id === null) return badRequest("bad id");

  removeSet(id);
  return ok();
}
