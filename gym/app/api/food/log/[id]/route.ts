import { asFloat, asInt, badRequest, notFound, ok, readJson, requireSession } from "@/lib/api";
import { isMeal, removeEntry, updateEntry } from "@/lib/food/diary";

type Params = { params: Promise<{ id: string }> };

const MAX_QUANTITY = 100;

export async function PATCH(request: Request, { params }: Params) {
  const denied = await requireSession();
  if (denied) return denied;

  const id = asInt((await params).id);
  if (id === null) return badRequest("bad id");

  const body = await readJson(request);
  const patch: { quantity?: number; meal?: "breakfast" | "lunch" | "dinner" | "snack" } = {};

  if ("quantity" in body) {
    const quantity = asFloat(body.quantity);
    if (quantity === null || quantity <= 0 || quantity > MAX_QUANTITY) {
      return badRequest(`quantity must be between 0 and ${MAX_QUANTITY}`);
    }
    patch.quantity = quantity;
  }

  if ("meal" in body) {
    if (!isMeal(body.meal)) return badRequest("unknown meal");
    patch.meal = body.meal;
  }

  if (Object.keys(patch).length === 0) return badRequest("nothing to change");
  if (!updateEntry(id, patch)) return notFound();

  return ok();
}

export async function DELETE(_request: Request, { params }: Params) {
  const denied = await requireSession();
  if (denied) return denied;

  const id = asInt((await params).id);
  if (id === null) return badRequest("bad id");

  removeEntry(id);
  return ok();
}
