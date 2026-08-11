import { asInt, badRequest, notFound, ok, requireSession } from "@/lib/api";
import { deletePhoto, readPhoto } from "@/lib/photos";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const denied = await requireSession();
  if (denied) return denied;

  const id = asInt((await params).id);
  if (id === null) return badRequest("bad id");

  const found = readPhoto(id);
  if (!found) return notFound();

  return new Response(new Uint8Array(found.bytes), {
    headers: {
      "Content-Type": found.photo.mimeType,
      "Content-Length": String(found.bytes.length),
      "Cache-Control": "private, no-store",
    },
  });
}

export async function DELETE(_request: Request, { params }: Params) {
  const denied = await requireSession();
  if (denied) return denied;

  const id = asInt((await params).id);
  if (id === null) return badRequest("bad id");

  if (!deletePhoto(id)) return notFound();
  return ok();
}
