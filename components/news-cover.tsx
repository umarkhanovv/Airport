/**
 * A news post's cover image.
 *
 * The upload half of this has worked since Stage 7 — the file is validated by
 * its magic bytes, stored under a generated name in `DATA_DIR/uploads/news`,
 * and served with a whitelisted content type by `app/api/news/image/[name]`.
 * The read half was never built: `lib/news/queries.ts` has always selected
 * `coverImage` and `coverAlt` and handed them to the pages, and no page has
 * ever contained an `<img>`. Staff uploaded covers and nobody saw them.
 *
 * Plain `<img>`, not `next/image`. The source is already a route handler that
 * sets `immutable` caching on a name that is never reused, so the optimiser
 * would add a hop and a `remotePatterns` entry to re-solve a solved problem on
 * a self-hosted single node.
 *
 * `width` and `height` are the *ratio*, not the file's real pixels — nothing
 * records those. That is enough: the browser reserves a box of the right shape
 * before a byte of image arrives, and `object-cover` crops whatever turns up
 * to fit it. A list of stories that reflows as its images land is exactly the
 * failure this site is built to avoid.
 */
export function NewsCover({
  name,
  alt,
  variant,
}: {
  name: string;
  alt: string | null;
  variant: 'hero' | 'thumbnail';
}) {
  const hero = variant === 'hero';

  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={`/api/news/image/${name}`}
      /*
        Empty alt when there is none, never the headline. The admin form
        requires a description whenever a cover is set, so this is the case
        where a post predates that rule — and an image announced by repeating
        the heading next to it is worse for a screen reader than one skipped.
      */
      alt={alt ?? ''}
      width={hero ? 1200 : 320}
      height={hero ? 675 : 240}
      /* Eager on the article, where the image is the thing the reader came to
         see and sits above the fold; lazy in the lists, where most of them are
         below it. */
      loading={hero ? 'eager' : 'lazy'}
      decoding="async"
      className={
        hero
          ? 'border-border mt-6 aspect-[16/9] w-full rounded-lg border object-cover'
          : 'border-border aspect-[4/3] w-24 shrink-0 rounded-md border object-cover sm:w-36'
      }
    />
  );
}
