import Image from 'next/image';
import type { PublicProfile } from '@/lib/public-profile-core';

export function PublicProfileView({
  labels,
  profile,
}: {
  labels: { entryYear: string; links: string; photoAlt: string };
  profile: PublicProfile;
}) {
  return (
    <article className="grid gap-10 lg:grid-cols-12 lg:gap-12">
      <header className="grid content-start gap-5 lg:col-span-7 lg:pt-12">
        <p className="text-sm font-semibold tracking-[0.16em] text-primary">PUBLIC PROFILE</p>
        <h1 className="text-[clamp(2.5rem,6vw,4.5rem)] leading-[1.15] font-semibold tracking-tight">
          {profile.displayName}
        </h1>
        <p className="text-sm text-muted-foreground">{labels.entryYear}</p>
        {profile.bio ? (
          <p className="max-w-2xl text-lg leading-[1.7] text-foreground">{profile.bio}</p>
        ) : null}
      </header>

      {profile.photo ? (
        <div className="relative aspect-square overflow-hidden rounded-media bg-muted lg:col-span-5 lg:row-span-2">
          <Image
            alt={labels.photoAlt}
            fill
            sizes="(max-width: 1024px) 100vw, 42vw"
            src={`/people/${profile.publicId}/photo`}
            unoptimized
          />
        </div>
      ) : (
        <div
          aria-hidden="true"
          className="aspect-square rounded-media border border-border bg-primary-soft lg:col-span-5 lg:row-span-2"
        />
      )}

      {profile.links.length > 0 ? (
        <section className="grid gap-4 border-t border-border pt-6 lg:col-span-7">
          <h2 className="text-2xl font-semibold">{labels.links}</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {profile.links.map((link) => (
              <li key={link.url}>
                <a
                  className="flex min-h-11 items-center border-b border-border font-medium text-primary hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
                  href={link.url}
                  rel="external noopener noreferrer"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </article>
  );
}
