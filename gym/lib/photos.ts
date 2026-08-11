import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { isAbsolute, join, resolve } from "node:path";
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "./db/client";
import { progressPhotos, PHOTO_POSES } from "./db/schema";
import type { PhotoPose, ProgressPhoto } from "./db/schema";
import { decryptBuffer, encryptBuffer } from "./crypto";
import { POSE_LABELS } from "./labels";
import { env } from "./env";
import type { IsoDate } from "./dates";

export const MAX_PHOTO_BYTES = 12 * 1024 * 1024;

export const ALLOWED_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
};

export function isPose(value: unknown): value is PhotoPose {
  return typeof value === "string" && (PHOTO_POSES as readonly string[]).includes(value);
}

function photoDir(): string {
  const dir = isAbsolute(env.PHOTO_DIR) ? env.PHOTO_DIR : resolve(process.cwd(), env.PHOTO_DIR);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

/**
 * Storage keys are generated here, never taken from the request. A key that came in
 * from outside could walk out of the photo directory with a few slashes and dots.
 */
function pathFor(storageKey: string): string {
  if (!/^[0-9a-f]{32}$/.test(storageKey)) throw new Error("bad storage key");
  return join(photoDir(), `${storageKey}.enc`);
}

export type SavePhotoInput = {
  takenOn: IsoDate;
  pose: PhotoPose;
  mimeType: string;
  bytes: Buffer;
};

export function savePhoto(input: SavePhotoInput): { id: number } {
  const storageKey = randomBytes(16).toString("hex");
  writeFileSync(pathFor(storageKey), encryptBuffer(input.bytes), { mode: 0o600 });

  const row = db
    .insert(progressPhotos)
    .values({
      takenOn: input.takenOn,
      pose: input.pose,
      storageKey,
      mimeType: input.mimeType,
      byteSize: input.bytes.length,
    })
    .returning({ id: progressPhotos.id })
    .get();

  return { id: row.id };
}

export function readPhoto(id: number): { photo: ProgressPhoto; bytes: Buffer } | null {
  const photo = db.select().from(progressPhotos).where(eq(progressPhotos.id, id)).get();
  if (!photo) return null;

  try {
    return { photo, bytes: decryptBuffer(readFileSync(pathFor(photo.storageKey))) };
  } catch {
    return null;
  }
}

export function deletePhoto(id: number): boolean {
  const photo = db.select().from(progressPhotos).where(eq(progressPhotos.id, id)).get();
  if (!photo) return false;

  rmSync(pathFor(photo.storageKey), { force: true });
  db.delete(progressPhotos).where(eq(progressPhotos.id, id)).run();
  return true;
}

export function listPhotos(pose?: PhotoPose): ProgressPhoto[] {
  const query = db.select().from(progressPhotos);
  const rows = pose
    ? query.where(eq(progressPhotos.pose, pose)).all()
    : query.all();

  return rows.sort((a, b) =>
    a.takenOn === b.takenOn ? b.id - a.id : a.takenOn < b.takenOn ? 1 : -1
  );
}

export type PoseGroup = { pose: PhotoPose; label: string; photos: ProgressPhoto[] };

export function photosByPose(): PoseGroup[] {
  return PHOTO_POSES.map((pose) => ({
    pose,
    label: POSE_LABELS[pose],
    photos: listPhotos(pose),
  })).filter((group) => group.photos.length > 0);
}

/**
 * The oldest and newest shot of the same pose. Comparing a front shot against a side
 * shot tells you nothing, so a pose with only one photo has nothing to compare yet.
 */
export function comparablePair(pose: PhotoPose): { first: ProgressPhoto; last: ProgressPhoto } | null {
  const rows = db
    .select()
    .from(progressPhotos)
    .where(eq(progressPhotos.pose, pose))
    .orderBy(asc(progressPhotos.takenOn), asc(progressPhotos.id))
    .all();

  if (rows.length < 2) return null;
  return { first: rows[0]!, last: rows[rows.length - 1]! };
}

export function photosOn(takenOn: IsoDate, pose: PhotoPose): ProgressPhoto[] {
  return db
    .select()
    .from(progressPhotos)
    .where(and(eq(progressPhotos.takenOn, takenOn), eq(progressPhotos.pose, pose)))
    .orderBy(desc(progressPhotos.id))
    .all();
}
