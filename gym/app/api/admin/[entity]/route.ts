import { NextResponse } from "next/server";
import { asInt, badRequest, notFound, readJson } from "@/lib/api";
import { requireElevated } from "@/lib/admin-auth";
import { ADMIN_ENTITIES, isKnownEntity } from "@/lib/admin-entities";

type Params = { params: Promise<{ entity: string }> };

function respond(result: { error: string } | { ok: true; id?: number }): Response {
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result);
}

export async function POST(request: Request, { params }: Params) {
  const denied = await requireElevated();
  if (denied) return denied;

  const { entity } = await params;
  if (!isKnownEntity(entity)) return notFound("unknown entity");

  const handler = ADMIN_ENTITIES[entity];
  if (!handler.create) return badRequest("cannot create this");

  return respond(handler.create(await readJson(request)));
}

export async function PATCH(request: Request, { params }: Params) {
  const denied = await requireElevated();
  if (denied) return denied;

  const { entity } = await params;
  if (!isKnownEntity(entity)) return notFound("unknown entity");

  const handler = ADMIN_ENTITIES[entity];
  if (!handler.update) return badRequest("cannot update this");

  const body = await readJson(request);
  const id = asInt(body.id) ?? 0;
  return respond(handler.update(id, body));
}

export async function DELETE(request: Request, { params }: Params) {
  const denied = await requireElevated();
  if (denied) return denied;

  const { entity } = await params;
  if (!isKnownEntity(entity)) return notFound("unknown entity");

  const handler = ADMIN_ENTITIES[entity];
  const url = new URL(request.url);
  const id = asInt(url.searchParams.get("id"));
  if (id === null) return badRequest("id is required");

  const mode = url.searchParams.get("mode") ?? "archive";

  if (mode === "archive" || mode === "unarchive") {
    if (!handler.archive) return badRequest("cannot archive this");
    return respond(handler.archive(id, mode === "archive"));
  }

  if (mode === "delete") {
    if (!handler.destroy) return badRequest("cannot delete this");
    return respond(handler.destroy(id));
  }

  return badRequest("unknown mode");
}
