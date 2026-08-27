import Image from 'next/image';
import { ArrowUpRightIcon } from 'lucide-react';
import type { PublicProfile } from '@/lib/public-profile-core';

export function PublicProfileView({
  labels,
  profile,
}: {
  labels: { entryYear: string; eyebrow: string; links: string; photoAlt: string };
  profile: PublicProfile;
}) {
  return (
    <article className="grid gap-12 lg:grid-cols-12 lg:gap-16">
      <header className="grid content-center gap-5 lg:col-span-7 lg:py-12">
        <p className="text-sm font-semibold tracking-[0.12em] text-primary">{labels.eyebrow}</p>
        <h1 className="text-[clamp(2.6rem,6vw,5rem)] leading-[1.08] font-semibold tracking-[-0.05em] text-balance">
          {profile.displayName}
        </h1>
        <p className="w-fit rounded-control bg-primary-soft px-3 py-1.5 text-sm font-medium text-primary">
          {labels.entryYear}
        </p>
        {profile.bio ? (
          <p className="max-w-[65ch] text-lg leading-[1.85] text-foreground text-pretty">
            {profile.bio}
          </p>
        ) : null}
      </header>

      {profile.photo ? (
        <div className="relative aspect-[4/5] overflow-hidden rounded-media bg-muted shadow-[0_2rem_5rem_-3rem_color-mix(in_oklch,var(--primary),transparent_48%)] lg:col-span-5 lg:row-span-2">
          <Image
            alt={labels.photoAlt}
            className="object-cover"
            fill
            sizes="(max-width: 1024px) 100vw, 42vw"
            src={`/people/${profile.publicId}/photo`}
            unoptimized
          />
        </div>
      ) : (
        <div
          aria-hidden="true"
          className="relative aspect-[4/5] overflow-hidden rounded-media border border-border bg-primary-soft lg:col-span-5 lg:row-span-2"
        >
          <span className="absolute -top-20 -right-20 size-72 rounded-full border-[3rem] border-primary/10" />
          <span className="absolute -bottom-20 -left-16 size-64 rounded-full bg-primary/10" />
          <span className="absolute inset-x-10 top-1/2 grid aspect-square -translate-y-1/2 place-items-center rounded-[2rem] border border-primary/20 bg-background/75 text-[clamp(5rem,10vw,8rem)] leading-none font-semibold text-primary backdrop-blur-sm">
            {Array.from(profile.displayName.trim()).at(0)}
          </span>
        </div>
      )}

      {profile.links.length > 0 ? (
        <section className="grid gap-4 border-t border-border pt-6 lg:col-span-7">
          <h2 className="text-3xl font-semibold tracking-[-0.03em]">{labels.links}</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {profile.links.map((link) => (
              <li key={link.url}>
                <a
                  className="group flex min-h-12 items-center justify-between gap-3 border-b border-border font-medium text-primary transition-colors duration-200 hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
                  href={link.url}
                  rel="external noopener noreferrer"
                >
                  {link.label}
                  <ArrowUpRightIcon
                    aria-hidden="true"
                    className="size-4 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 motion-reduce:transform-none"
                  />
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </article>
  );
}
