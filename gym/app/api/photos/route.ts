import { badRequest, ok, requireSession } from "@/lib/api";
import { isValidIso, todayIso } from "@/lib/dates";
import { ALLOWED_MIME, MAX_PHOTO_BYTES, isPose, savePhoto } from "@/lib/photos";

export async function POST(request: Request) {
  const denied = await requireSession();
  if (denied) return denied;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return badRequest("expected a file upload");
  }

  const file = form.get("photo");
  if (!(file instanceof File)) return badRequest("photo is required");
  if (file.size === 0) return badRequest("that file is empty");
  if (file.size > MAX_PHOTO_BYTES) {
    return badRequest(`photos must be under ${Math.round(MAX_PHOTO_BYTES / 1024 / 1024)} MB`);
  }
  if (!(file.type in ALLOWED_MIME)) {
    return badRequest("that image format is not supported");
  }

  const takenOnRaw = form.get("takenOn");
  const takenOn = typeof takenOnRaw === "string" && takenOnRaw ? takenOnRaw : todayIso();
  if (!isValidIso(takenOn)) return badRequest("takenOn must be YYYY-MM-DD");

  const poseRaw = form.get("pose");
  if (poseRaw !== null && !isPose(poseRaw)) return badRequest("unknown pose");
  const pose = poseRaw === null ? "front" : poseRaw;

  const bytes = Buffer.from(await file.arrayBuffer());
  return ok(savePhoto({ takenOn, pose, mimeType: file.type, bytes }));
}
