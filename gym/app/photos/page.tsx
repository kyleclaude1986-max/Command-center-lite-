import Link from "next/link";
import { BottomNav } from "@/components/BottomNav";
import { DeletePhotoButton, PhotoUpload } from "@/components/PhotoManager";
import { comparablePair, photosByPose } from "@/lib/photos";
import { PHOTO_POSES } from "@/lib/db/schema";
import { diffDaysIso, fmtIsoDay, todayIso } from "@/lib/dates";
import { pluralize } from "@/lib/format";

export const dynamic = "force-dynamic";

export default function PhotosPage() {
  const today = todayIso();
  const groups = photosByPose();
  const comparisons = PHOTO_POSES.map((pose) => ({ pose, pair: comparablePair(pose) })).filter(
    (entry) => entry.pair !== null
  );

  return (
    <>
      <main className="mx-auto max-w-2xl space-y-5 px-4 pb-32 pt-6">
        <header className="flex items-baseline justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Photos</h1>
            <p className="text-sm text-ink-muted">Progress shots, encrypted on disk</p>
          </div>
          <Link href="/body" className="text-sm text-ink-muted">
            Body
          </Link>
        </header>

        <section className="card card-pad">
          <h2 className="section-title mb-3">Add a photo</h2>
          <PhotoUpload today={today} />
        </section>

        {comparisons.length > 0 && (
          <section className="card card-pad">
            <h2 className="section-title mb-3">Then and now</h2>
            <div className="space-y-5">
              {comparisons.map(({ pose, pair }) => {
                const first = pair!.first;
                const last = pair!.last;
                const span = diffDaysIso(first.takenOn, last.takenOn);
                return (
                  <div key={pose}>
                    <p className="mb-2 text-sm font-medium capitalize">
                      {pose}
                      <span className="text-ink-muted">
                        {" "}
                        · {span} {pluralize(span, "day")} apart
                      </span>
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      {[first, last].map((photo, index) => (
                        <figure key={photo.id}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={`/api/photos/${photo.id}`}
                            alt={`${pose} on ${fmtIsoDay(photo.takenOn)}`}
                            className="w-full rounded-lg border border-paper-line object-cover"
                          />
                          <figcaption className="mt-1 text-xs text-ink-muted">
                            {index === 0 ? "First" : "Latest"} · {fmtIsoDay(photo.takenOn)}
                          </figcaption>
                        </figure>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {groups.length === 0 ? (
          <section className="card card-pad">
            <p className="text-sm text-ink-muted">
              No photos yet. Same pose, same spot, same light — that is what makes them
              worth comparing later.
            </p>
          </section>
        ) : (
          groups.map((group) => (
            <section key={group.pose} className="card card-pad">
              <header className="mb-3 flex items-baseline justify-between">
                <h2 className="section-title">{group.label}</h2>
                <span className="text-xs text-ink-muted">
                  {group.photos.length} {pluralize(group.photos.length, "photo")}
                </span>
              </header>
              <div className="grid grid-cols-3 gap-3">
                {group.photos.map((photo) => (
                  <figure key={photo.id}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/photos/${photo.id}`}
                      alt={`${group.label} on ${fmtIsoDay(photo.takenOn)}`}
                      className="aspect-[3/4] w-full rounded-lg border border-paper-line object-cover"
                    />
                    <figcaption className="mt-1 flex items-baseline justify-between gap-1 text-xs text-ink-muted">
                      <span>{fmtIsoDay(photo.takenOn)}</span>
                      <DeletePhotoButton photoId={photo.id} />
                    </figcaption>
                  </figure>
                ))}
              </div>
            </section>
          ))
        )}
      </main>
      <BottomNav />
    </>
  );
}
